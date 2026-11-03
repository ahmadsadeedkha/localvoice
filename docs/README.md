# LocalVoice AI

Multi-tenant AI voice receptionist for local service businesses (HVAC, plumbing, electrical, clinics, salons). The agent answers inbound calls, answers questions from business data, checks real availability, books appointments into the business's Google Calendar, takes messages and hands off to staff. Each business gets a dashboard of calls, appointments, customers and messages; platform operators manage all businesses from an admin console.

## Documentation

| Document                            | What it covers                                                   |
| ----------------------------------- | ---------------------------------------------------------------- |
| [Architecture](./architecture.md)   | System components, call and booking flows, calendar sync, data model, multi-tenancy, security |
| [API Reference](./api.md)           | REST endpoints, agent tool endpoints, webhooks, OAuth callback   |
| [Development](./development.md)     | Local setup, environment variables, migrations, testing, Git workflow |
| [Deployment](./deployment.md)       | Environments, hosting, release process, rollback                 |

## Repository layout

```
localvoice/
├── docs/       # Project documentation (this folder)
├── backend/    # NestJS API, agent tools, webhooks, integrations, background jobs
├── frontend/   # Next.js app used by each business
├── admin/      # React (Vite) operator console for platform admins
├── docker-compose.yml   # Local Postgres + Redis
└── mprocs.yaml          # Runs all services together locally
```

`backend`, `frontend` and `admin` are independent projects: each has its own `package.json`, lockfile and `.env`. There is no root workspace.

## Tech stack

| Area              | Choice                                       |
| ----------------- | -------------------------------------------- |
| Voice agent       | Retell AI (single-prompt agent + custom functions) |
| Telephony / SMS   | Twilio (planned; provider under review)      |
| Backend           | NestJS 11, TypeScript, TypeORM, Zod, Luxon   |
| Database          | PostgreSQL 16                                |
| Queue             | Redis 7 + BullMQ                             |
| Business app      | Next.js 16, Tailwind v4, shadcn/ui           |
| Operator console  | React + Vite                                 |
| Auth              | Clerk (organizations = tenants)              |
| Calendar          | Google Calendar (OAuth; free/busy + event sync) |
| Hosting           | Render (backend), Vercel (frontend, admin)   |
| CI                | GitHub Actions                               |

## Status

| Area                                             | Status         |
| ------------------------------------------------ | -------------- |
| Repo, CI, local infra                            | Done           |
| Auth, roles, Clerk → tenant sync                 | Done           |
| Retell webhook ingest (calls, transcripts, analysis) | Done       |
| Agent tools: business info, availability, booking | Done           |
| Agent tools: take message, transfer request      | Done (no live transfer yet) |
| Google Calendar: connect, calendar picker, free/busy, event sync | Done |
| Appointment cancel, reschedule and sync retry from the dashboard | Done |
| Business app: dashboard, calls, appointments, services & hours, customers, messages, integrations | Done |
| Operator console: tenant list and status         | Done           |
| Staging deployment                               | Done           |
| Telephony (phone numbers, live transfer, SMS)    | Not started (provider decision pending) |
| Post-call summaries (email/SMS)                  | Not started    |
| Production deployment and pilot                  | Not started    |

## Quick start

```bash
docker compose up -d postgres redis
cd backend && cp .env.example .env && pnpm install && pnpm migration:run && pnpm seed && pnpm start:dev
```

Full instructions: [Development](./development.md).