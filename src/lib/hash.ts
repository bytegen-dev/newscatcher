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

export function mipHashOutputHex(buyerId: string, output: unknown): string {
  const json = canonicalize(output);
  if (json === undefined) {
    throw new Error('canonicalize failed for output hash');
  }
  const pre = `${buyerId};${json}`;
  return createHash('sha256').update(pre, 'utf8').digest('hex').toLowerCase();
}
