// Legendas ASS (libass) do template v1.1 "Full-frame":
// - gancho fixo no topo (zona 90-380)
// - vídeo SEM corte no meio do canvas (1080x608 @ y=420)
// - legendas em zona própria abaixo do vídeo (y~1120), karaokê palavra-a-palavra
// Substitui o crop 70/30 que cortava 55% da imagem e o drawtext frágil (revisão C2).

export interface Word {
  word: string;
  start: number;
  end: number;
}

interface AssOptions {
  fontName: string;
  captionSize: number;
  hookSize: number;
  maxWordsPerLine: number;
  maxLineSeconds: number;
}

const DEFAULTS: AssOptions = {
  fontName: 'Space Grotesk',
  captionSize: 80,
  hookSize: 58,
  maxWordsPerLine: 3,
  maxLineSeconds: 1.6,
};

function assTime(seconds: number): string {
  const cs = Math.max(0, Math.round(seconds * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const rest = cs % 100;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${h}:${pad(m)}:${pad(s)}.${pad(rest)}`;
}

function escapeAss(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\{/g, '(').replace(/\}/g, ')').replace(/\n/g, ' ');
}

// Linha de legenda não pode terminar em conectivo solto ("GANHEI MAIS DE" → o
// "DE" desce pra linha seguinte). Lista conservadora: preposições/artigos/conjunções.
const CONNECTIVES = new Set([
  'e', 'de', 'do', 'da', 'dos', 'das', 'que', 'pra', 'pro', 'para', 'por', 'com',
  'sem', 'um', 'uma', 'o', 'a', 'os', 'as', 'no', 'na', 'nos', 'nas', 'em', 'ao',
  'aos', 'à', 'às', 'pelo', 'pela', 'mas', 'ou', 'nem', 'se', 'como',
]);

function isConnective(word: string): boolean {
  return CONNECTIVES.has(word.trim().toLowerCase().replace(/[.,!?…:;]+$/, ''));
}

export function buildAss(
  words: Word[],
  clipStart: number,
  clipEnd: number,
  hook?: string,
  opts: Partial<AssOptions> = {}
): string {
  const o = { ...DEFAULTS, ...opts };
  const duration = clipEnd - clipStart;
  const inClip = words.filter((w) => w.start >= clipStart - 0.2 && w.end <= clipEnd + 0.5);

  // Agrupa em linhas curtas (1 linha na tela, karaokê dentro dela)
  const lines: { start: number; end: number; words: Word[] }[] = [];
  let current: Word[] = [];
  const flush = () => {
    if (current.length === 0) return;
    lines.push({
      start: Math.max(0, current[0].start - clipStart),
      end: Math.max(0.1, current[current.length - 1].end - clipStart),
      words: current,
    });
    current = [];
  };
  for (const w of inClip) {
    current.push(w);
    const span = current[current.length - 1].end - current[0].start;
    const sentenceEnd = /[.!?]$/.test(w.word.trim());
    if (current.length >= o.maxWordsPerLine || span >= o.maxLineSeconds || sentenceEnd) {
      // Conectivo no fim da linha passa pra próxima (mantém pelo menos 1 palavra)
      const held: Word[] = [];
      if (!sentenceEnd) {
        while (current.length > 1 && isConnective(current[current.length - 1].word)) {
          held.unshift(current.pop() as Word);
        }
      }
      flush();
      current = held;
    }
  }
  flush();

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Hook,${o.fontName},${o.hookSize},&H00FFFFFF,&H00FFFFFF,&H00201434,&H7F000000,-1,0,0,0,100,100,0,0,1,4,0,2,70,70,1460,1
Style: Caption,${o.fontName},${o.captionSize},&H00FFFFFF,&H00FA8BA7,&H00140C24,&H7F000000,-1,0,0,0,100,100,0,0,1,5,1,8,60,60,1120,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events: string[] = [];
  if (hook) {
    events.push(
      `Dialogue: 0,${assTime(0)},${assTime(duration)},Hook,,0,0,0,,${escapeAss(hook.toUpperCase())}`
    );
  }
  for (const line of lines) {
    // Karaokê: \k em centissegundos por palavra (Primary preenche sobre Secondary)
    const parts = line.words.map((w, i) => {
      const next = line.words[i + 1];
      const end = next ? Math.max(w.end, Math.min(next.start, w.end + 0.5)) : w.end;
      const cs = Math.max(8, Math.round((end - w.start) * 100));
      return `{\\k${cs}}${escapeAss(w.word.trim().toUpperCase())}`;
    });
    events.push(
      `Dialogue: 0,${assTime(line.start)},${assTime(line.end)},Caption,,0,0,0,,${parts.join(' ')}`
    );
  }

  return header + events.join('\n') + '\n';
}
