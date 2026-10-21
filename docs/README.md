# LocalVoice AI

A multi-tenant AI voice receptionist for local service businesses (HVAC, plumbing, clinics, salons). It answers calls, books appointments, sends SMS confirmations, and gives each business a dashboard to see what happened.

## Tech Stack

| Area                      | Choice                              |
| ------------------------- | ----------------------------------- |
| Voice agent               | Retell AI                           |
| Telephony / SMS           | Twilio                              |
| Backend                   | NestJS (TypeScript, CJS, Jest)      |
| ORM                       | TypeORM                             |
| Database                  | PostgreSQL                          |
| Queue / cache             | Redis + BullMQ                      |
| Business app (frontend)   | Next.js                             |
| Operator console (admin)  | React                               |
| Auth + multi-tenant admin | Clerk                               |
| Calendar                  | Google Calendar (first integration) |
| Package manager           | pnpm                                |
| Local infra               | Docker Compose (Postgres, Redis)    |
| CI                        | GitHub Actions                      |

## Repository Layout

```
localvoice/
├── docs/       # All project documentation
├── frontend/   # Next.js app: what each business uses
├── backend/    # NestJS API
└── admin/      # React operator console: platform admins manage all businesses
```

**Conventions**

- `frontend`, `backend` and `admin` are fully independent. Each has its own `package.json`, its own dependencies and its own env file. There is no root workspace `package.json` and no shared env.
- `mprocs` is used to run all services together locally.
- Branching: `main` (production), `staging` (tested features), `feature` (new work).

## Roles

- **Business users** use the `frontend` app for their own business.
- **Platform admins** use the `admin` console to manage all businesses. This is flagged through Clerk public metadata (`isPlatformAdmin`) and surfaced to the apps via the backend `/me` endpoint.

## Progress

### Done: Week 1 foundations

- Repository created with the four-folder layout and branching model (`main`, `staging`, `feature`)
- Backend, frontend and admin scaffolded as independent projects
- Postgres and Redis running via Docker Compose, containers healthy
- Environment configuration in place per folder
- CI passing on GitHub
- ORM decision: TypeORM (replacing Prisma)

### Done: Authentication and authorization

- Clerk development application set up with keys
- Platform-admin flag set via Clerk public metadata, with the session-token claim configured
- Backend auth guard merged (PR)
- Frontend design system and app shell built
- Clerk wired into the frontend; the auth chain is verified end to end, with `/me` returning role `owner` and `isPlatformAdmin: true`

### In progress

- Designing the full multi-tenant database schema (tenants, calls and related entities) before implementing entities and migrations in TypeORM
- Deciding whether post-call summaries need a separate LLM provider, depending on what Retell's post-call analysis already provides

### Up next

- Multi-tenant schema and migrations
- Working voice agent (Retell + Twilio) from the Week 1 goal
- Google Calendar booking integration
- SMS confirmations
- Business dashboard
- Pilot with a real business

## Local Development

Each service is set up on its own. In each of `backend/`, `frontend/` and `admin/`:

```bash
cp .env.example .env   # fill in values for that service
pnpm install
pnpm dev
```

Start Postgres and Redis with Docker Compose, or run everything at once with `mprocs`.
