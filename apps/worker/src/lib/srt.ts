export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

function stamp(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const rest = ms % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(rest, 3)}`;
}

export function segmentsToSrt(segments: TranscriptSegment[]): string {
  return segments
    .map((seg, i) => `${i + 1}\n${stamp(seg.start)} --> ${stamp(seg.end)}\n${seg.text.trim()}\n`)
    .join('\n');
}
