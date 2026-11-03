# Development

## Prerequisites

- Node.js 24, pnpm
- Docker Desktop
- [mprocs](https://github.com/pvolok/mprocs) (optional, runs everything at once)
- ngrok or cloudflared (to receive Retell and Clerk webhooks locally)
- Accounts: Clerk (dev instance), Retell AI, Google Cloud project (for Calendar)

## Setup

```bash
git clone https://github.com/ahmadsadeedkha/localvoice.git
cd localvoice
git checkout staging

docker compose up -d postgres redis      # Postgres on 5433, Redis on 6379

cd backend
cp .env.example .env                      # fill in values (see below)
pnpm install
pnpm migration:run
pnpm seed <tenantId>                       # dev services, business hours, resources for a tenant

cd ../frontend && cp .env.example .env && pnpm install
cd ../admin    && cp .env.example .env && pnpm install
```

The seed uses `Asia/Karachi` as the timezone by default; override with `SEED_TIMEZONE=America/Chicago pnpm seed <tenantId>`.

Run all services: `mprocs` from the repo root. Or individually:

| Service  | Command          | URL                     |
| -------- | ---------------- | ----------------------- |
| backend  | `pnpm start:dev` | http://localhost:4000   |
| frontend | `pnpm dev`       | http://localhost:3000   |
| admin    | `pnpm dev`       | http://localhost:5173   |

### Webhooks locally

```bash
ngrok http 4000
```

Set `PUBLIC_BASE_URL` to the tunnel URL, then point the Clerk webhook to `<url>/webhooks/clerk`, the Retell agent webhook to `<url>/webhooks/retell`, and the Retell custom functions to `<url>/tools/<name>`.

### Google Calendar locally

1. In Google Cloud, enable the **Google Calendar API** and create an **OAuth client** (type: Web application).
2. Add the redirect URI `http://localhost:4000/integrations/google/callback`.
3. On the OAuth consent screen, add the scopes `calendar.calendarlist.readonly`, `calendar.freebusy`, `calendar.events`, and add your Google account as a test user.
4. Fill in `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` and `GOOGLE_TOKEN_ENC_KEY`. Generate the key with:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

5. In the frontend, open **Integrations → Connect Google**, then pick a calendar.

While the OAuth app is in **Testing** mode, Google expires refresh tokens after 7 days; the app will show Reconnect when that happens.

## Environment variables

Each project has its own `.env`; `.env.example` is the template. Never commit `.env`.

**backend** (validated at boot by `src/config/env.ts`)

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `NODE_ENV` | no | `development` / `test` / `production` |
| `PORT` | no | Default `4000` |
| `DATABASE_URL` | yes | Postgres connection string |
| `REDIS_URL` | yes | Redis connection string |
| `PUBLIC_BASE_URL` | yes | Public URL Retell/Twilio call back to |
| `RETELL_API_KEY` | yes | Also used to verify Retell signatures |
| `RETELL_AGENT_ID` | yes | Default agent |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | no | Telephony (not yet used) |
| `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | yes | Clerk API |
| `CLERK_WEBHOOK_SIGNING_SECRET` | no | Required to accept Clerk webhooks |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | no | Google OAuth client. Required for the Calendar integration |
| `GOOGLE_REDIRECT_URI` | no | `<backend>/integrations/google/callback`; must match the OAuth client exactly |
| `GOOGLE_TOKEN_ENC_KEY` | no | 32 random bytes, base64. Encrypts stored Google refresh tokens. Changing it invalidates existing connections |
| `FRONTEND_URL` | no | Where the OAuth callback redirects back to. Default `http://localhost:3000` |
| `ALLOWED_ORIGINS` | no | Comma-separated CORS origins |
| `ENABLE_DEV_CALLS` | no | `true` to expose `/dev/calls/*` when `NODE_ENV=production` |

**frontend**: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL`

**admin**: `VITE_API_URL`, `VITE_CLERK_PUBLISHABLE_KEY`

## Database migrations

Schema changes go through TypeORM migrations in `backend/src/database/migrations`. Never edit a migration that has run on staging or production; add a new one.

```bash
pnpm migration:generate src/database/migrations/<Name>
pnpm migration:run
pnpm migration:revert        # undo the last migration
```

CI builds the schema from an empty database, so a new migration's timestamp must be later than every existing one.

## Testing and quality

```bash
pnpm test          # unit tests (Jest)
pnpm test:e2e      # end-to-end tests
pnpm lint          # oxlint
pnpm format        # prettier
```

Unit tests sit next to the code as `*.spec.ts`. Pure logic such as slot calculation (`subtract-busy`, `free-ranges`, `nearest-slots`), OAuth state signing, token encryption and calendar event building should be covered there. Test web calls: open `/dev/calls/test-page` on the backend.

## Git workflow

| Branch | Purpose | Deploys to |
| ------ | ------- | ---------- |
| `main` | Production | Production (planned) |
| `staging` | Tested, integrated features | Staging |
| `feature/<name>` | New work, branched from `staging` | — |

1. Branch from `staging`: `git checkout -b feature/sms-confirmations`.
2. Commit using [Conventional Commits](https://www.conventionalcommits.org): `feat(booking): add hold expiry job`, `fix(calls): ...`, `docs: ...`.
3. Open a PR into `staging`. CI (build, migrations, tests for all three projects) must pass.
4. After testing on staging, open a PR from `staging` into `main` for release.

## Conventions

- `frontend`, `backend`, `admin` stay independent: no shared packages, no root `package.json`, no shared env.
- Tenant ID always comes from the session, call context or signed OAuth state, never from request bodies.
- Don't log caller PII (names, phone numbers, message bodies) or OAuth tokens.
- Booking status changes go through `BookingService.transition()` only.
- Never call Google writes inside a request the caller is waiting on; enqueue a `calendar-sync` job.
- Background jobs must be idempotent: use deterministic job IDs and check current state before acting.
- Update `docs/` in the same PR when you change an endpoint, env variable, job or schema.
