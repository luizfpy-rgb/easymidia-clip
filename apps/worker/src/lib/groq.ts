import { readFile } from 'node:fs/promises';
import { env } from '../env.js';
import type { TranscriptSegment } from './srt.js';

export interface GroqTranscription {
  text: string;
  duration?: number;
  segments?: TranscriptSegment[];
  words?: { word: string; start: number; end: number }[];
}

export const GROQ_WHISPER_USD_PER_HOUR = 0.04;

export async function transcribeAudio(filePath: string, language?: string): Promise<GroqTranscription> {
  if (!env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY não configurada — etapa 7 do setup');
  }
  const audio = await readFile(filePath);
  const form = new FormData();
  form.append('file', new Blob([audio], { type: 'audio/mp4' }), 'audio.m4a');
  form.append('model', 'whisper-large-v3-turbo');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');
  form.append('timestamp_granularities[]', 'word');
  if (language) form.append('language', language);

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Groq ${res.status}: ${body.slice(0, 500)}`);
  }
  return (await res.json()) as GroqTranscription;
}
