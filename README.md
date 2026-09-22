# newscatcher

MIP-003 HTTP agent that searches news via the [NewsCatcher News API](https://www.newscatcherapi.com/docs/news-api/get-started/quickstart) and returns a markdown brief plus article links.

## Requirements

- Node.js 20+
- pnpm
- NewsCatcher API key

Masumi Payment Service is required for paid `start_job` (escrow). Free local smoke tests still work with `anonymous` and payment env unset.

## Setup

```bash
cp .env.example .env
# set NEWSCATCHER_API_KEY

pnpm install
pnpm db:push
pnpm dev
```

Default URL: `http://localhost:3040`

## Smoke test

```bash
./scripts/smoke-test.sh
```

Uses free mode (`identifier_from_purchaser: "anonymous"`). Expect `completed` with `output.articles` and `output.summary_markdown`.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/availability` | Health and capability flags |
| GET | `/input_schema` | Hire form fields |
| POST | `/start_job` | Create job |
| GET | `/status?job_id=` | Poll job |
| GET | `/get-credential` | SaaS verification (needs `MASUMI_VERIFICATION_SECRET`) |

### `start_job` body

```json
{
  "identifier_from_purchaser": "anonymous",
  "input_data": {
    "query": "Masumi Cardano",
    "lang": "en",
    "limit": 5
  }
}
```

Optional `input_data` fields: `countries`, `from_date` (see `/input_schema`).

### Free vs paid

| Mode | Condition |
|------|-----------|
| Free | `anonymous` purchaser, or payment env vars unset |
| Paid | `PAYMENT_SERVICE_URL`, `PAYMENT_API_KEY`, `AGENT_IDENTIFIER`, `NETWORK` set and a real purchaser id |

Paid jobs stay in `awaiting_payment` until the payment node reports `FundsLocked`, then the news search runs.

**Job price is not configured in this repo.** Fixed pricing (token and amount) is set when you register the agent on a Masumi payment node (admin UI or CLI manifest). The agent calls `POST /payment` and uses whatever `RequestedFunds` the node returns for your `AGENT_IDENTIFIER`.

## Local stack (no ngrok)

1. `masumi-payment-service`: `pnpm dev` (see that repo for the API port, often `http://localhost:3001/api/v1`)
2. This agent: `pnpm dev` → `http://localhost:3040`
3. `masumi-cli doctor --json` (profile should point at your local payment API)
4. `./scripts/smoke-test.sh` (free mode)
5. Optional paid path: register on the local node (`masumi-cli sell agent register`, manifest in `scripts/register-local-manifest.json`; overview in `scripts/run-local.sh`). Edit pricing there or in payment admin, not in agent source.

### After registration (local or hosted)

1. Set **`apiBaseUrl`** to a URL the registry can reach (tunnel or production HTTPS for hosted; `localhost:3040` is fine for local-only).
2. Copy **`agentIdentifier`** into `.env` as **`AGENT_IDENTIFIER`**, plus **`PAYMENT_SERVICE_URL`**, **`PAYMENT_API_KEY`**, **`NETWORK`**. Restart the agent (`/availability` → `masumi_payments: true`).
3. For Sokosumi catalog visibility, sync and publish are handled on the Sokosumi side (see hosted section below).

There is no Sokosumi app in this repo. Local Masumi E2E is payment node + MIP-003 + optional `masumi-cli`. Hosted marketplace listing is a separate step.

## Sokosumi (hosted)

After local validation, list on the marketplace: [list-agent on Sokosumi](https://www.masumi.network/dev/masumi/documentation/how-to-guides/list-agent-on-sokosumi).

## Sokosumi coworker (tasks only)

Register a **coworker** in Core (admin) with `capabilities: ["tasks"]`, then run the worker that hires this agent on assigned tasks. No chat engine required.

See [docs/COWORKER.md](./docs/COWORKER.md). Quick start:

```bash
# .env: SOKOSUMI_COWORKER_TOKEN, SOKOSUMI_NEWS_AGENT_ID
pnpm coworker:dev
```
