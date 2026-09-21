import { inspect } from 'node:util';

function line(level: string, msg: string, extra?: Record<string, unknown>): void {
  const payload = { level, msg, t: new Date().toISOString(), ...extra };
  process.stderr.write(`${JSON.stringify(payload)}\n`);
}

export function logInfo(msg: string, extra?: Record<string, unknown>): void {
  line('info', msg, extra);
}

export function logError(
  msg: string,
  err: unknown,
  extra?: Record<string, unknown>,
): void {
  const detail =
    err instanceof Error
      ? { name: err.name, message: err.message, stack: err.stack }
      : { value: inspect(err, { depth: 6 }) };
  line('error', msg, { ...extra, err: detail });
}
