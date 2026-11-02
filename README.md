# FeeFlow

**Repository:** https://github.com/kavyarathod05/FeeFlow

**Live frontend:** https://frontend-beta-two-a4xpte0563.vercel.app  
**Live API:** https://feeflow-api-rppm.onrender.com · Health: `/health`

Coaching institute fee tracking system and parent portal (MVP).

Multi-centre dues visibility, OTP parent portal, mock payment links with idempotent allocation, automated Hindi/English reminders that cancel on payment, illustrative pro-rata refunds, explainable dropout-risk counsellor tasks, and Tally-oriented CSV export.

## Stack

- **Frontend:** React, Vite, TypeScript, Tailwind CSS, TanStack Query, Recharts
- **Backend:** Node.js, Express, TypeScript, Prisma, PostgreSQL
- **Auth:** Parent OTP (demo mode) · Accounts JWT
- **Deploy:** Vercel (SPA) + Render free web service + Render Postgres

## Quick start

See [deployment.md](./deployment.md) for full steps.

```bash
# DB: PostgreSQL with DATABASE_URL from .env.example
cd backend && npm install && npx prisma migrate deploy && npm run seed && npm run dev
cd frontend && npm install && npm run dev
```

## Demo logins

| Role | Credential |
|------|------------|
| Accounts | `accounts@feeflow.demo` / `Accounts@123` |
| Parent (Ishita) | phone `9876500587` · OTP `246810` (OTP_DEMO_MODE) |
| Parent (Aarav) | `9876500412` |
| Parent (Mohit) | `9876500219` |

## Sample students (from brief)

- **STU-0412** Aarav Meena — Paid snapshot
- **STU-0587** Ishita Sharma — Part paid / overdue snapshot
- **STU-0219** Mohit Gurjar — Upcoming due snapshot

## Docs

- [Technical Design Document](./docs/TDD.md)
- [Architecture & assumptions](./docs/ARCHITECTURE.md)
- [deployment.md](./deployment.md)

## Tests

```bash
cd backend && npm test
```
