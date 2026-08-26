// Gera legendas ASS (libass) no estilo Shorts a partir dos word timestamps da Groq.
// Substitui o drawtext concatenado da spec original (revisão C2).

export interface Word {
  word: string;
  start: number;
  end: number;
}

interface AssOptions {
  fontName: string;
  fontSize: number;
  marginV: number; // distância do topo, em px do canvas 1080x1920
  maxWordsPerLine: number;
  maxLineSeconds: number;
}

const DEFAULTS: AssOptions = {
  fontName: 'DejaVu Sans',
  fontSize: 72,
  marginV: 200,
  maxWordsPerLine: 4,
  maxLineSeconds: 1.8,
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

/**
 * words: timestamps globais do vídeo fonte; clipStart/clipEnd delimitam o trecho.
 * Os tempos saem relativos ao início do clip (o vídeo renderizado começa em 0).
 */
export function buildAss(
  words: Word[],
  clipStart: number,
  clipEnd: number,
  opts: Partial<AssOptions> = {}
): string {
  const o = { ...DEFAULTS, ...opts };
  const inClip = words.filter((w) => w.start >= clipStart - 0.2 && w.end <= clipEnd + 0.5);

  const lines: { start: number; end: number; text: string }[] = [];
  let current: Word[] = [];
  const flush = () => {
    if (current.length === 0) return;
    lines.push({
      start: Math.max(0, current[0].start - clipStart),
      end: Math.max(0.1, current[current.length - 1].end - clipStart),
      text: escapeAss(current.map((w) => w.word.trim()).join(' ')).toUpperCase(),
    });
    current = [];
  };
  for (const w of inClip) {
    current.push(w);
    const span = current[current.length - 1].end - current[0].start;
    if (current.length >= o.maxWordsPerLine || span >= o.maxLineSeconds || /[.!?]$/.test(w.word.trim())) {
      flush();
    }
  }
  flush();

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${o.fontName},${o.fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H7F000000,-1,0,0,0,100,100,0,0,1,6,0,8,60,60,${o.marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = lines
    .map((l) => `Dialogue: 0,${assTime(l.start)},${assTime(l.end)},Caption,,0,0,0,,${l.text}`)
    .join('\n');

  return header + events + '\n';
}
