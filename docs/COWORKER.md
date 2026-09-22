# News Catcher as a Sokosumi coworker (tasks only)

This repo includes a **tasks-only** coworker worker. It does not implement chat.
Sokosumi assigns **READY** tasks to your coworker; the worker hires the **News catcher**
marketplace agent and posts results back on the task.

## Prerequisites

1. **News catcher agent** listed in Sokosumi (sync + publish) and you know its **`agentId`**.
2. **Masumi agent** still running (local or tunnel) so Core can run jobs.
3. **Sokosumi coworker row** (admin):
   - `POST /v1/coworkers` with `capabilities: ["tasks"]` only (no `baseURL` required).
   - `POST /v1/coworkers/{id}/api-keys` → save the one-time token.
   - Whitelist or workspace access so users can pick the coworker (`isWhitelisted` or workspace grant).

Preprod API base: `https://api.preprod.sokosumi.com`  
Local Core: `http://localhost:8787`

## Local Sokosumi (step by step)

### 1. Run the stack

| Service | Command | URL |
|---------|---------|-----|
| Postgres | (your local DB) | in `sokosumi/apps/core/.env` `DATABASE_URL` |
| Core | `pnpm core:dev` from `sokosumi/` | `http://localhost:8787` |
| Web | `pnpm --filter web dev` | `http://localhost:3000` |
| Payment node | `pnpm dev` in `masumi-payment-service/` | usually `:3001` |
| Registry | if Core points at local registry | match Core `REGISTRY_*` |
| News catcher agent | `pnpm dev` in `agents/newscatcher/` | `:3040` |

Sync agents after registration: `curl -H "Authorization: Bearer $CRON_SECRET" "$CORE_URL/sync/agents"` (see Core `CRON_SECRET`).

Publish the agent in Sokosumi if needed (`isShown`, ONLINE). For a quick local test you can hire by agent id even when hidden; the worker uses `SOKOSUMI_NEWS_AGENT_ID` directly.

### 2. Platform admin on your user

Coworker **create** and **whitelist** need a user with `role` containing `admin`.

**Option A — SQL** (Core DB):

```sql
UPDATE "User" SET role = 'admin' WHERE email = 'your-login@email.com';
```

Sign out and back in on the web app.

**Option B — fixture user** (if you use cloud-agent DB fixtures): `admin@sokosumi.test` / `Password123!`.

### 3. User API key (admin)

1. Open `http://localhost:3000/connections` (signed in as admin).
2. Create an API key → export as `SOKOSUMI_ADMIN_API_KEY` (setup script only; do not commit).

You also need a **normal user API key** (same or another account) to create tasks and to fund credits if jobs fail with insufficient balance.

### 4. Vendor + coworker + worker key

**UI:** `/admin/vendors/new` → create vendor → note `vendorId`.

**Script** (vendor + coworker + whitelist + coworker API key in one go):

```bash
cd agents/newscatcher
export SOKOSUMI_ADMIN_API_KEY='...'
# optional: export VENDOR_ID=... if you already created a vendor
./scripts/setup-local-coworker.sh
```

Copy printed `SOKOSUMI_COWORKER_TOKEN` and `coworkerId` into `.env`.

**UI alternative:** `/admin/coworkers` does not create new rows today; use the script or `POST /v1/coworkers`. After create, open the coworker in admin → enable **tasks**, turn on **Whitelisted**.

### 5. Agent id

```bash
curl -sS -H "Authorization: Bearer $USER_API_KEY" \
  "http://localhost:8787/v1/agents?limit=50" | jq '.data[] | select(.name|test("news";"i")) | {id,name}'
```

Set `SOKOSUMI_NEWS_AGENT_ID` in `agents/newscatcher/.env`.

### 6. Run worker + agent

```bash
# terminal A
pnpm dev

# terminal B
pnpm coworker:dev
```

### 7. Create a READY task

Web: new task → assign **News Catcher** coworker → READY.

Or CLI:

```bash
export SOKOSUMI_API_URL=http://localhost:8787
sokosumi tasks create \
  --api-key "$USER_API_KEY" \
  --coworker-id "$COWORKER_ID" \
  --name "Local news test" \
  --description '{"query":"Masumi Cardano","limit":3}' \
  --status READY \
  --json
```

Watch terminal B; then `sokosumi tasks get TASK_ID --json`.

## Worker env

Add to `.env` (see `.env.example`):

| Variable | Description |
|----------|-------------|
| `SOKOSUMI_COWORKER_TOKEN` | Coworker API key (Bearer) |
| `SOKOSUMI_NEWS_AGENT_ID` | Sokosumi agent id for News catcher |
| `SOKOSUMI_API_URL` | Core API base (optional, default `http://localhost:8787`) |

Optional tuning: `COWORKER_POLL_INTERVAL_MS`, `COWORKER_MAX_CREDITS`, `COWORKER_DEFAULT_LIMIT`, `COWORKER_STATE_PATH`.

## Run

Terminal 1: MIP-003 agent

```bash
pnpm dev
```

Terminal 2: coworker worker

```bash
pnpm coworker:dev
```

## Task brief format

Users create a task assigned to your coworker with `status: READY`.

The worker maps the brief to News catcher `input_data`:

- **JSON in description:** `{ "query": "Masumi Cardano", "limit": 3 }`
- **Plain text:** task name + description become the search query
- **Optional lines:** `query: ...`, `limit: 5`

## Register coworker (admin curl sketch)

Replace placeholders. Use an **admin** bearer token on preprod.

```bash
export SOKOSUMI_API_URL=https://api.preprod.sokosumi.com
export ADMIN_TOKEN=...

curl -sS -X POST "$SOKOSUMI_API_URL/v1/coworkers" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "vendorId": "YOUR_VENDOR_ID",
    "name": "News Catcher",
    "caption": "Topic news research",
    "description": "Assign a READY task with a search query; returns a markdown brief.",
    "capabilities": ["tasks"]
  }'
```

Then create an API key, whitelist the coworker, and set `SOKOSUMI_COWORKER_TOKEN` on the worker.

## Test

```bash
# User API key
sokosumi tasks create \
  --coworker-id YOUR_COWORKER_ID \
  --name "Masumi news" \
  --description '{"query":"Masumi Cardano","limit":3}' \
  --status READY \
  --json
```

Watch the worker logs and `sokosumi tasks get TASK_ID --json`.
