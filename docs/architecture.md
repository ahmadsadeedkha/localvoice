# Architecture

## Overview

```
Caller ──► Phone number (Twilio, planned) ──► Retell AI voice agent
                                                 │
                         custom functions (HTTPS, signed)
                                                 ▼
 Clerk ──webhooks──►  NestJS backend  ◄──webhooks── Retell (call events)
                       │      │     │
              PostgreSQL  Redis/BullMQ  Google Calendar API
                       ▲                (free/busy, events)
        ┌──────────────┴──────────────┐
   Next.js frontend              React admin console
   (business users)              (platform admins)
```

The voice pipeline is Retell's speech-to-text → LLM → tool calls → text-to-speech. Business logic (availability, booking, messages) lives in our backend and the agent calls it as tools, so every action is validated, tenant-scoped and auditable.

## Components

| Component    | Responsibility |
| ------------ | -------------- |
| **Retell agent** | Conversation. Calls backend tools; sends `call_started`, `call_ended`, `call_analyzed` webhooks. |
| **Backend** (`backend/`) | REST API for both apps, agent tool endpoints, webhook ingest, booking rules, Google Calendar integration, background jobs. |
| **Frontend** (`frontend/`) | Business-facing app: dashboard, calls, appointments (cancel/reschedule), services & hours, customers, messages, integrations. |
| **Admin** (`admin/`) | Operator console: list tenants, change tenant status. Platform admins only. |
| **Clerk** | Sign-in, organizations, membership roles. Source of truth for identity; synced to our DB by webhook. |
| **Google Calendar** | Per-tenant calendar. Read for busy time; confirmed bookings are written to it as events. |
| **PostgreSQL** | System of record for all tenant data. |
| **Redis + BullMQ** | Background jobs: hold expiry and calendar sync. |

### Backend modules

`auth` · `tenants` · `webhooks` (clerk, retell) · `calls` · `tools` · `booking` · `availability` · `calendar-sync` · `integrations/google` · `business` · `customers` · `messages` · `dashboard` · `admin` · `queue` · `database`

## Call flow

1. Retell sends `call_started` → backend upserts a `calls` row (status `in_progress`) for the tenant that owns the agent/number.
2. During the call the agent invokes tools at `/tools/*`. `CallContextGuard` verifies the Retell signature over the raw body and resolves the tenant **from the call ID in our `calls` table**. Tenant ID is never taken from the request body.
3. `call_ended` stores duration, disconnection reason and transcript.
4. `call_analyzed` stores Retell's summary, sentiment, success flag and analysis JSON.

Every webhook is recorded in `webhook_events` (unique on `provider + external_event_id`), which makes ingest idempotent against retries.

## Availability

Availability goes through the `AvailabilityProvider` interface. The active provider is `GoogleAvailabilityProvider`:

```
free slots = business hours − our own held/confirmed bookings − busy time in Google Calendar
```

- Tenants without a Google connection get the database-only result (`MockAvailabilityProvider`), unchanged.
- Google free/busy is called with a **4 s timeout** because the caller is waiting on the line.
- **Fail closed:** if Google can't be read (down, slow, access revoked), the tools return `calendar_unavailable` and the agent offers to take a message instead of promising a time we can't verify.
- `check_availability` returns free time ranges plus every free start time for the day, so the agent can answer follow-ups without calling again. With an optional `time` (`HH:mm`) it says whether that exact time is free and, if not, offers the 4 nearest. If the requested day is full it returns alternatives on the next 3 days that have space.
- When rescheduling, the booking's own slot and its own Google event are excluded so it can move to an overlapping time.

## Booking flow

```
check_availability ──► book_appointment ──► held (5 min) ──► confirmed ──► calendar-sync job ──► Google event
                                              │
                                              └─► expired (hold-expiry job / next booking attempt)
```

- **Re-check before booking:** `book_appointment` re-reads real availability (including Google) right before inserting. A slot that's no longer free returns `slot_unavailable`.
- **Holds:** a booking is first inserted as `held` with `hold_expires_at`, then confirmed in the same transaction once validated.
- **Double-booking protection** is enforced by the database: an exclusion constraint on `(tenant_id, resource_id, tstzrange(starts_at, ends_at))` for `held` and `confirmed` rows (`btree_gist`).
- **State machine** (`booking-status.ts`), applied only through `BookingService.transition()`:

| From        | Allowed to                          |
| ----------- | ----------------------------------- |
| `held`      | `confirmed`, `expired`, `cancelled` |
| `confirmed` | `cancelled`, `completed`, `no_show` |
| others      | terminal                            |

### Dashboard changes

Owners and admins can **reschedule** and **cancel** upcoming `confirmed` bookings, and **retry** a failed calendar sync. Reschedule locks the row, re-checks availability for the new slot and enqueues a calendar update. Cancel transitions to `cancelled` and enqueues an event deletion.

## Calendar sync

Writes to Google happen in the background, never during the call, so a slow Google API can't hold up a booking.

| Job | Queue | Trigger | Behaviour |
| --- | ----- | ------- | --------- |
| `create-event` | `calendar-sync` | Booking confirmed | Insert the Google event. Job ID per booking, so duplicates are ignored. |
| `update-event` | `calendar-sync` | Reschedule | Patch the event to the booking's current time (creates it if missing). |
| `cancel-event` | `calendar-sync` | Cancel | Delete the event. |
| `sweep-pending` | `calendar-sync` | Every 5 min | Re-enqueue bookings still `pending`, e.g. if Redis was down at enqueue time. |
| `expire-holds` | `maintenance` | Every 60 s | Move stale `held` bookings to `expired`. |

- Retries: 5 attempts with exponential backoff (30 s, 1 m, 2 m, 4 m). Permanent Google errors stop immediately.
- **Idempotent events:** the Google event ID is derived from the booking ID, so a retried insert that already succeeded is detected and patched instead of duplicated.
- `bookings.calendar_sync_status` tracks the result: `pending` → `synced`, or `failed` after the last attempt. Failed syncs show in the dashboard with a retry action.
- Google calls use a 10 s timeout in background jobs.

## Data model

All tenant-owned tables carry `tenant_id`. Child tables use composite foreign keys `(tenant_id, x_id)` so a row can never reference another tenant's data.

| Table            | Purpose | Key constraints |
| ---------------- | ------- | --------------- |
| `tenants`        | A business (= Clerk organization) | unique `slug`, `clerk_org_id`, `twilio_number`; status `trial`/`active`/`suspended` |
| `tenant_members` | User ↔ tenant with role `owner`/`admin`/`staff` | unique `(tenant_id, clerk_user_id)` |
| `phone_numbers`  | Numbers mapped to tenants | unique `e164` |
| `services`       | Bookable services with duration | |
| `resources`      | What gets booked (staff member, bay, chair) | |
| `business_hours` | Opening hours per day of week | |
| `calls`          | One row per Retell call, with transcript and analysis | unique `retell_call_id` |
| `bookings`       | Appointments, with `calendar_event_id` and `calendar_sync_status` | exclusion constraint on overlaps; check constraints on status |
| `messages`       | Messages and transfer requests taken by the agent; status `new`/`read`/`handled` | |
| `google_calendar_connections` | One Google connection per tenant: account email, encrypted refresh token, granted scopes, selected calendar, status `active`/`revoked`, last error | unique `tenant_id`; cascades on tenant delete |
| `webhook_events` | Raw inbound webhooks and processing status `received`/`processed`/`failed` | unique `(provider, external_event_id)` |

Customers are not a table: they are derived from calls and bookings grouped by normalized phone number.

## Multi-tenancy and access control

- A Clerk **organization** maps 1:1 to a tenant. Clerk webhooks (`organization.*`, `organizationMembership.*`, `user.*`) create and update `tenants` and `tenant_members`.
- `AuthGuard` (global) verifies the Clerk session token on every request unless the route is `@Public()`.
- `RolesGuard` (global) enforces `@Roles(...)`. Owners and admins can edit services and hours, change appointments and manage the Google connection. Staff have read access.
- `@PlatformAdminOnly()` protects `/admin/*`, based on the `isPlatformAdmin` flag in Clerk public metadata.
- Every query in tenant-scoped services filters by the tenant resolved from the session or call context.

## Security

- Webhooks and tool calls are authenticated by provider signatures (Svix for Clerk, `x-retell-signature` for Retell) verified against the raw request body.
- **Google OAuth:** the `state` parameter is signed and carries the tenant and user, so the public callback can't be used to attach a calendar to another tenant. Partial grants (unticked scopes) are rejected.
- **Token storage:** Google refresh tokens are encrypted at rest with AES-256-GCM (`GOOGLE_TOKEN_ENC_KEY`). The stored value has a version prefix for future key rotation.
- **Least-privilege scopes:** `calendar.calendarlist.readonly`, `calendar.freebusy`, `calendar.events` (plus `openid` and email).
- Caller PII (name, phone, message body) is not written to logs.
- Secrets live only in each service's environment; nothing is committed. Env is validated at boot with Zod (`backend/src/config/env.ts`).
- CORS is restricted to `ALLOWED_ORIGINS`.
- Payment card data is never collected or stored.

## Key decisions

| Decision | Reason |
| -------- | ------ |
| Retell pipeline agent with backend tools, not speech-to-speech | Transcripts, tool-call control, validation and easier debugging |
| NestJS + TypeORM (replacing Prisma) | Team familiarity; migrations as code |
| Clerk organizations as tenants | Auth, orgs and roles out of the box |
| DB exclusion constraint for bookings | Correct under concurrency without app-level locks |
| Our DB is the booking source of truth; Google is synced in the background | The call never waits on Google writes; retries are safe |
| Fail closed when Google can't be read | Offering an unverified slot risks double-booking a real job |
| Independent `frontend` / `backend` / `admin` projects | Separate deploys and dependencies, no shared env |
| Twilio/telephony deferred | Provider availability in Pakistan under review; web calls used for testing |
