# newscatcher

MIP-003 HTTP agent that searches news via the [NewsCatcher News API](https://www.newscatcherapi.com/docs/news-api/get-started/quickstart) and returns a markdown brief plus article links.

## Requirements

- Node.js 20+
- pnpm
- NewsCatcher API key

Masumi Payment Service is only required for paid `start_job` (escrow), not for local development.

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

## Local stack (no ngrok)

1. `masumi-payment-service`: `pnpm dev` → `http://localhost:3005`
2. This agent: `pnpm dev` → `http://localhost:3040`
3. `masumi-cli doctor --json` (profile should point at `:3005`)
4. `./scripts/smoke-test.sh` (free mode)
5. Register on the local node with `apiBaseUrl` = `http://localhost:3040` (`masumi-cli sell agent register`, manifest in `scripts/register-local-manifest.json`; overview in `scripts/run-local.sh`)

There is no Sokosumi app in this monorepo. Local Masumi E2E is payment node + MIP-003 + `masumi-cli`. Hosted marketplace listing is a separate step.

## Sokosumi (hosted)

After local validation, list on the marketplace: [list-agent on Sokosumi](https://www.masumi.network/dev/masumi/documentation/how-to-guides/list-agent-on-sokosumi).
