# Deployment

## Environments

| Environment | Branch    | Backend | Frontend / Admin | Status |
| ----------- | --------- | ------- | ---------------- | ------ |
| Local       | any       | localhost:4000 | localhost:3000 / 5173 | — |
| Staging     | `staging` | Render (Singapore): `localvoice-backend-staging.onrender.com` | Vercel | Live |
| Production  | `main`    | Render | Vercel | Planned |

## Infrastructure

| Service | Host | Notes |
| ------- | ---- | ----- |
| Backend (NestJS) | Render web service | Auto-deploys on push to the tracked branch. Runs the API and the BullMQ workers in one process |
| PostgreSQL | Render Postgres | Same region as the backend |
| Redis | Render Key Value | BullMQ queues `maintenance` and `calendar-sync` |
| Frontend (Next.js) | Vercel | Root directory `frontend` |
| Admin (React/Vite) | Vercel | Root directory `admin` (SPA rewrite configured) |

### Render backend settings

| Setting | Value |
| ------- | ----- |
| Root directory | `backend` |
| Build command | `pnpm install --frozen-lockfile && pnpm build` |
| Start command | `pnpm migration:run:prod && pnpm start:prod` |
| Health check path | `/health` |

Migrations run on every start, before the app boots. A failing migration stops the deploy, and the previous version keeps serving.

The Render free tier sleeps when idle, which also pauses the background jobs. Bookings made while it's asleep sync when it wakes, through the 5-minute `sweep-pending` job. Use a paid instance for the pilot and production.

## Configuration per environment

Set all variables from [Development → Environment variables](./development.md#environment-variables) in the Render and Vercel dashboards. Per environment:

- `PUBLIC_BASE_URL` = the backend's public URL.
- `FRONTEND_URL` = the frontend's Vercel URL (the OAuth callback redirects here).
- `ALLOWED_ORIGINS` = the Vercel URLs of the frontend and admin.
- `GOOGLE_REDIRECT_URI` = `<backend>/integrations/google/callback`, also registered on the Google OAuth client.
- `GOOGLE_TOKEN_ENC_KEY` = a unique key per environment. Store it safely: losing or changing it means every tenant must reconnect Google.
- `NEXT_PUBLIC_API_URL` / `VITE_API_URL` = the backend URL.
- Production uses a **separate** Clerk production instance, Retell agent, Google OAuth client and database. Never share secrets between staging and production.

External services to point at each environment's backend:

| Service | Setting |
| ------- | ------- |
| Clerk | Webhook endpoint → `<backend>/webhooks/clerk`; signing secret → `CLERK_WEBHOOK_SIGNING_SECRET` |
| Retell | Agent webhook → `<backend>/webhooks/retell`; custom functions → `<backend>/tools/<name>` |
| Google Cloud | OAuth client redirect URI → `<backend>/integrations/google/callback` |

### Before production: Google OAuth

The OAuth app must be moved out of **Testing**. In Testing, only listed test users can connect and refresh tokens expire after 7 days. Publishing with `calendar.events` requires Google's verification: a privacy policy URL, a homepage on a verified domain, and a scope justification. Allow time for review.

## Release process

1. Merge feature PRs into `staging`; Render and Vercel deploy automatically.
2. Smoke test on staging:
   - Sign in; the dashboard loads.
   - A test web call creates a call row with a transcript.
   - A booking made by the agent appears under Appointments and in the connected Google Calendar.
   - Reschedule and cancel move or delete the Google event.
3. Open a PR `staging` → `main`, get it reviewed, merge.
4. Verify production `/health` and repeat the smoke test.

## Rollback

- **App:** redeploy the previous successful deploy from the Render / Vercel dashboard, or revert the merge commit on the branch.
- **Database:** migrations are forward-only in deployed environments. To undo a schema change, ship a new migration. Use `migration:revert` only locally.

## Monitoring

- Render and Vercel logs for errors.
- `webhook_events` rows with status `failed`: webhook processing errors.
- `bookings` with `calendar_sync_status = 'failed'`: Google sync gave up after retries (also visible in the dashboard with a retry action).
- `google_calendar_connections` with status `revoked` or a `last_error`: the tenant needs to reconnect.
- Render health checks on `/health`.
