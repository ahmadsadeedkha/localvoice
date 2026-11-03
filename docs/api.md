# API Reference

Base URL: `http://localhost:4000` (local), `https://localvoice-backend-staging.onrender.com` (staging).

## Authentication

| Type           | Used by              | How |
| -------------- | -------------------- | --- |
| Clerk session  | Frontend, admin      | `Authorization: Bearer <Clerk session token>`. Tenant comes from the active organization. |
| Retell signature | Agent tools, Retell webhook | `x-retell-signature` over the raw body |
| Svix signature | Clerk webhook        | `svix-id`, `svix-timestamp`, `svix-signature` headers |
| Signed OAuth state | Google OAuth callback | `state` query parameter issued by `/integrations/google/connect` |
| Public         | `/health`, `/dev/*`  | None |

Roles: `owner`, `admin`, `staff` (per tenant), plus platform admin (`isPlatformAdmin`). "owner, admin" below means staff get `403`.

Errors use NestJS's standard shape: `{ "statusCode": 400, "message": "...", "error": "Bad Request" }`.

## App endpoints (Clerk session)

### General

| Method | Path | Role | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/me` | any | Current user, tenant, role, `isPlatformAdmin` |
| GET | `/dashboard` | any | Summary metrics for the tenant |

### Calls

| Method | Path | Role | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/calls` | any | Paginated call list |
| GET | `/calls/:id` | any | Call detail with transcript and analysis |

### Appointments

| Method | Path | Role | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/appointments?view=upcoming\|past` | any | Bookings for the tenant (default `upcoming`), with `canEdit` for the current user |
| GET | `/appointments/:id/slots?date=YYYY-MM-DD` | owner, admin | Free slots for moving this booking on a date |
| PATCH | `/appointments/:id/reschedule` | owner, admin | Body `{ "start": "<ISO datetime>" }`. Returns `{ rescheduled, startsAt }` |
| POST | `/appointments/:id/cancel` | owner, admin | Cancel. Returns `{ cancelled: true }` |
| POST | `/appointments/:id/retry-sync` | owner, admin | Re-queue a failed Google Calendar sync. `409` if the sync isn't `failed` |

Only upcoming `confirmed` bookings can be rescheduled or cancelled; anything else returns `409`.

### Services and hours

| Method | Path | Role | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/services` | any | Services list |
| POST | `/services` | owner, admin | Create a service |
| PATCH | `/services/:id` | owner, admin | Update a service |
| PUT | `/hours` | owner, admin | Replace weekly business hours |

### Customers and messages

| Method | Path | Role | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/customers` | any | Customers derived from calls and bookings |
| GET | `/customers/:phone` | any | One customer's calls and bookings |
| GET | `/messages` | any | Messages and transfer requests |
| PATCH | `/messages/:id` | any | Update status (`new` / `read` / `handled`) |

### Google Calendar integration

| Method | Path | Role | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/integrations/google` | any | Connection status (account, selected calendar, status), with `canEdit` |
| GET | `/integrations/google/connect` | owner, admin | Returns `{ url }`: the Google consent URL. The frontend redirects the browser to it. |
| GET | `/integrations/google/callback` | public (signed state) | Google redirects here. Stores the connection, then redirects to `FRONTEND_URL/integrations?google=connected` or `?google=error&reason=<reason>` |
| GET | `/integrations/google/calendars` | owner, admin | Calendars on the connected account |
| PUT | `/integrations/google/calendar` | owner, admin | Body `{ "calendarId": "..." }`. Selects the calendar to use |
| DELETE | `/integrations/google` | owner, admin | Disconnect |

If Google access has been revoked or expired, `calendars` and `calendar` return `409 needs_reconnect`; the UI shows a Reconnect button.

Callback `reason` values include `access_denied` (user cancelled), `missing_scopes` (a permission was unticked), `missing_code` and `unexpected_error`.

## Admin endpoints (platform admin)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/admin/tenants?limit=25&offset=0` | Paginated tenants (`limit` max 100). Returns `{ items, total }` |
| PATCH | `/admin/tenants/:id/status` | Set tenant status (`trial` / `active` / `suspended`) |

## Agent tool endpoints (Retell signature)

Configured as Retell custom functions. Request body: `{ name, call: { call_id, ... }, args }` ("Payload: args only" must be **off**). The tenant is resolved from `call.call_id`; the call must exist and be `in_progress`. All return `200`; failures come back as `{ error, message }` for the agent to act on.

| Path | Tool name | Args | Result |
| ---- | --------- | ---- | ------ |
| `POST /tools/get-business-info` | `get_business_info` | — | Business name, services, hours, whether open now, current local time |
| `POST /tools/check-availability` | `check_availability` | `service_id`, `date` (`YYYY-MM-DD`), optional `time` (`HH:mm`, 24-hour) | Free time ranges and every free start time that day. With `time`: the exact start if free, otherwise the 4 nearest. If the day is full: alternatives on the next 3 days with free slots |
| `POST /tools/book-appointment` | `book_appointment` | `service_id`, `start`, caller name, phone, notes | Confirmed booking |
| `POST /tools/take-message` | `take_message` | caller name, phone, message | Message saved |
| `POST /tools/transfer-to-human` | `transfer_to_human` | caller details, reason | Transfer request logged (`live_transfer: false` until telephony exists) |

Tool error codes:

| `error` | Meaning |
| ------- | ------- |
| `invalid_service` | Unknown service; call `get_business_info` first |
| `invalid_date` / `date_in_past` | Bad or past date |
| `invalid_time` | `time` isn't `HH:mm` |
| `slot_unavailable` | Slot was taken between checking and booking |
| `calendar_unavailable` | Google Calendar can't be read; don't promise a time, offer to take a message |

## Webhooks

| Path | Provider | Events handled |
| ---- | -------- | -------------- |
| `POST /webhooks/retell` | Retell | `call_started`, `call_ended`, `call_analyzed` |
| `POST /webhooks/clerk` | Clerk (Svix) | `organization.created/updated/deleted`, `organizationMembership.created/updated/deleted`, `user.updated/deleted` |

Each event is stored in `webhook_events`; a repeated `external_event_id` is acknowledged and skipped.

## Utility

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/health` | Liveness check |
| GET | `/dev/calls/test-page` | Browser page for test web calls. Enabled outside production, or with `ENABLE_DEV_CALLS=true` |
| POST | `/dev/calls/web` | Create a Retell web call for testing. Same flag |
