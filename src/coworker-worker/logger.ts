export function log(message: string, extra?: Record<string, unknown>): void {
  const suffix =
    extra && Object.keys(extra).length > 0
      ? ` ${JSON.stringify(extra)}`
      : '';
  console.error(`[coworker-worker] ${message}${suffix}`);
}
