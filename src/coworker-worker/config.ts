import 'dotenv/config';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return n;
}

export const config = {
  sokosumiApiUrl: (
    process.env.SOKOSUMI_API_URL?.trim() || 'http://localhost:8787'
  ).replace(/\/$/, ''),
  coworkerToken: requireEnv('SOKOSUMI_COWORKER_TOKEN'),
  newsAgentId: requireEnv('SOKOSUMI_NEWS_AGENT_ID'),
  pollIntervalMs: optionalInt('COWORKER_POLL_INTERVAL_MS', 15_000),
  jobPollIntervalMs: optionalInt('COWORKER_JOB_POLL_INTERVAL_MS', 5_000),
  jobTimeoutMs: optionalInt('COWORKER_JOB_TIMEOUT_MS', 600_000),
  maxCredits: optionalInt('COWORKER_MAX_CREDITS', 25),
  defaultArticleLimit: optionalInt('COWORKER_DEFAULT_LIMIT', 5),
  statePath:
    process.env.COWORKER_STATE_PATH?.trim() ||
    '.coworker-worker-state.json',
};
