import { mkdtemp, mkdir, copyFile, rm, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Job } from 'bullmq';
import type { RenderJob } from '@easymidia/shared';
import { env } from '../env.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { run } from '../lib/exec.js';
import { uploadToR2 } from '../lib/r2.js';
import { buildAss, type Word } from '../lib/ass.js';
import { notifyFailure, cookieHint } from '../lib/notify.js';

const RENDER_COST_USD = 0.008; // estimativa Railway (spec §7.4)

// Template v1.1 "Full-frame": vídeo 16:9 inteiro (sem crop), gancho no topo,
// legendas em zona própria, barra roxa embaixo. Substitui o split 70/30 que
// cortava 55% da largura da imagem.
const CANVAS_BG = '0x1A1327';
const ACCENT = '0x7C3AED';
const VIDEO_Y = 520; // vídeo 1080x608 ocupa y 520-1128
const ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets');
const FONTS_DIR = join(ASSETS_DIR, 'fonts');
const LOGO_PATH = join(ASSETS_DIR, 'brand', 'wordmark.png');

function shortHook(hook: string): string {
  const firstSentence = hook.match(/^.{10,100}?[.!?]/)?.[0];
  if (firstSentence) return firstSentence;
  return hook.length <= 100 ? hook : hook.slice(0, 97).trimEnd() + '…';
}

interface ExpressionEntry {
  at_seconds: number;
  expression: string;
}

export async function render(job: Job<RenderJob>) {
  const { clipId, userId } = job.data;
  try {
    await renderInner(job);
  } catch (err) {
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    if (finalAttempt) {
      const message = err instanceof Error ? err.message : String(err);
      await supabaseAdmin
        .from('suggested_clips')
        .update({ status: 'failed', error_message: `render: ${message.slice(0, 480)}` })
        .eq('id', clipId)
        .eq('user_id', userId);
      await notifyFailure(
        'render falhou de vez',
        `Clip ${clipId}\n${message.slice(0, 600)}${cookieHint(message)}`
      );
    }
    throw err;
  }
}

async function renderInner(job: Job<RenderJob>) {
  const { clipId, userId } = job.data;

  const { data: clip, error } = await supabaseAdmin
    .from('suggested_clips')
    .select(
      'id, status, start_seconds, end_seconds, hook, caption, hashtags, expression_timeline, source_video_id, source_videos ( youtube_id )'
    )
    .eq('id', clipId)
    .single();
  if (error || !clip) throw new Error(`clip ${clipId} não encontrado`);
  if (clip.status === 'rendered') return; // job re-entregue após sucesso
  if (!['approved', 'rendering', 'failed'].includes(clip.status)) {
    throw new Error(`clip em status inesperado: ${clip.status}`);
  }
  const video = clip.source_videos as unknown as { youtube_id: string };
  const start = Number(clip.start_seconds);
  const end = Number(clip.end_seconds);
  const duration = end - start;

  await supabaseAdmin
    .from('suggested_clips')
    .update({ status: 'rendering', error_message: null })
    .eq('id', clipId);

  const workDir = await mkdtemp(join(tmpdir(), 'em-render-'));
  try {
    // 1. Trecho em vídeo — só agora, pós-aprovação (revisão C4)
    const url = `https://www.youtube.com/watch?v=${video.youtube_id}`;
    const cookieArgs = env.YTDLP_COOKIES_FILE ? ['--cookies', env.YTDLP_COOKIES_FILE] : [];
    await run(
      'yt-dlp',
      [
        ...cookieArgs,
        '--no-progress',
        '-f', 'bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b',
        '--download-sections', `*${start.toFixed(2)}-${end.toFixed(2)}`,
        '--force-keyframes-at-cuts',
        '--merge-output-format', 'mp4',
        '-o', 'clip.mp4',
        url,
      ],
      { timeoutMs: 10 * 60_000, cwd: workDir }
    );

    // 2. Legendas ASS a partir dos word timestamps da transcrição
    if (!env.R2_PUBLIC_URL) throw new Error('R2_PUBLIC_URL não configurada');
    const base = env.R2_PUBLIC_URL.replace(/\/$/, '');
    const tRes = await fetch(`${base}/users/${userId}/source/${clip.source_video_id}/transcript.json`);
    if (!tRes.ok) throw new Error(`transcript.json indisponível (${tRes.status})`);
    const transcription = (await tRes.json()) as { words?: Word[] };
    const words = transcription.words ?? [];
    await writeFile(
      join(workDir, 'captions.ass'),
      buildAss(words, start, end, shortHook(clip.hook)),
      'utf8'
    );
    // Fontes junto do .ass: fontsdir relativo evita escaping de caminho no filtro
    await mkdir(join(workDir, 'fonts'), { recursive: true });
    for (const f of await readdir(FONTS_DIR)) {
      if (f.endsWith('.ttf')) await copyFile(join(FONTS_DIR, f), join(workDir, 'fonts', f));
    }

    // 3. Avatar: usa o selecionado no perfil (profiles.avatar_id; null = sem avatar)
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('avatar_id')
      .eq('id', userId)
      .single();
    let avatar: { id: string; expressions: unknown } | null = null;
    if (profile?.avatar_id) {
      const { data } = await supabaseAdmin
        .from('avatars')
        .select('id, expressions, status')
        .eq('id', profile.avatar_id)
        .single();
      if (data && data.status === 'ready') avatar = data;
    }
    const expressions = (avatar?.expressions ?? {}) as Record<string, string | null>;
    const timeline = ((clip.expression_timeline ?? []) as ExpressionEntry[])
      .filter((e) => e.at_seconds >= 0 && e.at_seconds < duration)
      .sort((a, b) => a.at_seconds - b.at_seconds);
    if (timeline.length === 0 || timeline[0].at_seconds > 0) {
      timeline.unshift({ at_seconds: 0, expression: 'idle' });
    }

    const windows: { file: string; from: number; to: number }[] = [];
    const downloaded = new Map<string, string>();
    for (let i = 0; i < timeline.length; i++) {
      const expr = timeline[i].expression;
      const exprUrl = expressions[expr] ?? expressions['idle'];
      if (!exprUrl) continue;
      let file = downloaded.get(exprUrl);
      if (!file) {
        const res = await fetch(exprUrl);
        if (!res.ok) continue;
        // Expressão pode ser retrato (.png) ou loop de reação em vídeo (.mp4)
        const ext = /\.mp4(\?|$)/i.test(exprUrl) ? 'mp4' : 'png';
        file = `avatar_${downloaded.size}.${ext}`;
        await writeFile(join(workDir, file), Buffer.from(await res.arrayBuffer()));
        downloaded.set(exprUrl, file);
      }
      windows.push({
        file,
        from: timeline[i].at_seconds,
        to: i + 1 < timeline.length ? timeline[i + 1].at_seconds : duration,
      });
    }

    // 4. Composição — template v1.1 Full-frame
    const inputs: string[] = ['-i', 'clip.mp4'];
    const uniqueFiles = [...new Set(windows.map((w) => w.file))];
    for (const f of uniqueFiles) {
      if (f.endsWith('.mp4')) {
        // Loop de reação: repete o vídeo pelo clip inteiro (enable= liga/desliga)
        inputs.push('-stream_loop', '-1', '-t', duration.toFixed(2), '-i', f);
      } else {
        inputs.push('-loop', '1', '-t', duration.toFixed(2), '-i', f);
      }
    }
    const filters: string[] = [
      `color=c=${CANVAS_BG}:s=1080x1920:d=${duration.toFixed(2)}:r=30[bg]`,
      `[0:v]scale=1080:-2,setsar=1[vid]`,
      `[bg][vid]overlay=0:${VIDEO_Y}[c0]`,
      `[c0]drawbox=x=0:y=1848:w=1080:h=72:color=${ACCENT}:t=fill[c1]`,
    ];
    let chain = 'c1';
    uniqueFiles.forEach((f, idx) => {
      const inputIdx = idx + 1;
      const enable = windows
        .filter((w) => w.file === f)
        .map((w) => `between(t,${w.from.toFixed(2)},${w.to.toFixed(2)})`)
        .join('+');
      // Máscara circular: o avatar entra como medalhão, sem cantos quadrados
      filters.push(
        `[${inputIdx}:v]scale=260:260,setsar=1,fps=30,format=rgba,` +
          `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(hypot(X-W/2,Y-H/2),W/2-1),alpha(X,Y),0)'[av${idx}]`
      );
      filters.push(`[${chain}][av${idx}]overlay=790:1560:enable='${enable}'[c${idx + 2}]`);
      chain = `c${idx + 2}`;
    });
    // Marca d'água: wordmark discreto acima da barra roxa
    if (existsSync(LOGO_PATH)) {
      await copyFile(LOGO_PATH, join(workDir, 'logo.png'));
      inputs.push('-loop', '1', '-t', duration.toFixed(2), '-i', 'logo.png');
      const logoIdx = uniqueFiles.length + 1;
      filters.push(`[${logoIdx}:v]scale=300:-1,format=rgba,colorchannelmixer=aa=0.55[logo]`);
      filters.push(`[${chain}][logo]overlay=40:1758[clogo]`);
      chain = 'clogo';
    }
    filters.push(`[${chain}]subtitles=captions.ass:fontsdir=fonts[out]`);

    await run(
      'ffmpeg',
      [
        '-y',
        ...inputs,
        '-filter_complex', filters.join(';'),
        '-map', '[out]', '-map', '0:a',
        '-t', duration.toFixed(2),
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-pix_fmt', 'yuv420p', '-r', '30',
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart',
        'out.mp4',
      ],
      { timeoutMs: 15 * 60_000, cwd: workDir }
    );

    // 5. Thumbnail: frame do meio do vídeo renderizado (legenda já queimada)
    await run(
      'ffmpeg',
      ['-y', '-ss', (duration / 2).toFixed(2), '-i', 'out.mp4', '-frames:v', '1', '-q:v', '3', 'thumb.jpg'],
      { timeoutMs: 60_000, cwd: workDir }
    );

    // 6. Upload + registros. Nome versionado por render: a CDN da Cloudflare
    // cacheia por URL, então re-render no mesmo path serviria o mp4 antigo.
    const outBuffer = await readFile(join(workDir, 'out.mp4'));
    const version = Date.now();
    const prefix = `users/${userId}/shorts/${clipId}`;
    const [videoUrl, thumbUrl] = await Promise.all([
      uploadToR2(`${prefix}/short-${version}.mp4`, outBuffer, 'video/mp4'),
      uploadToR2(`${prefix}/thumb-${version}.jpg`, await readFile(join(workDir, 'thumb.jpg')), 'image/jpeg'),
    ]);
    const size = (await stat(join(workDir, 'out.mp4'))).size;

    const { data: template } = await supabaseAdmin
      .from('templates')
      .select('id')
      .eq('is_default', true)
      .limit(1)
      .single();

    const { error: insertError } = await supabaseAdmin.from('rendered_shorts').insert({
      suggested_clip_id: clipId,
      user_id: userId,
      template_id: template?.id ?? null,
      avatar_id: avatar?.id ?? null,
      video_url: videoUrl,
      thumbnail_url: thumbUrl,
      caption: clip.caption ?? clip.hook,
      hashtags: clip.hashtags ?? [],
      duration_seconds: duration,
      size_bytes: size,
      render_cost_usd: RENDER_COST_USD,
    });
    if (insertError) throw new Error(`insert rendered_shorts: ${insertError.message}`);

    await supabaseAdmin.from('usage_events').insert({
      user_id: userId,
      event_type: 'render',
      reference_id: clipId,
      cost_usd: RENDER_COST_USD,
      metadata: { duration_seconds: duration, size_bytes: size },
    });

    await supabaseAdmin
      .from('suggested_clips')
      .update({ status: 'rendered' })
      .eq('id', clipId);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
