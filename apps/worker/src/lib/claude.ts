import Anthropic from '@anthropic-ai/sdk';
import { env } from '../env.js';

export const CLAUDE_MODEL = 'claude-haiku-4-5';
export const HAIKU_USD_PER_M_INPUT = 1;
export const HAIKU_USD_PER_M_OUTPUT = 5;

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY não configurada — etapa 8 do setup');
  }
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}
