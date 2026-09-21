import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const canonicalize = require('canonicalize') as (input: unknown) => string | undefined;

export function mipHashInputHex(buyerId: string, inputData: unknown): string {
  const json = canonicalize(inputData);
  if (json === undefined) {
    throw new Error('canonicalize failed for input hash');
  }
  const pre = `${buyerId};${json}`;
  return createHash('sha256').update(pre, 'utf8').digest('hex').toLowerCase();
}

/**
 * Result hash for escrow / Sokosumi verification (Masumi `hashResult`).
 * Hashes the job result string the buyer sees (markdown), not the full output JSON.
 */
export function mipHashResultHex(buyerId: string, result: string): string {
  const escaped = JSON.stringify(result).slice(1, -1);
  const pre = `${buyerId};${escaped}`;
  return createHash('sha256').update(pre, 'utf8').digest('hex');
}
