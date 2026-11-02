# FeeFlow — Deployment & local run

**GitHub:** https://github.com/kavyarathod05/FeeFlow

**Temporary frontend (claim to keep):** https://flying-oasis-xa3jswq.tmp.now  
**Claim URL:** https://vercel.com/claim-deployment?code=4f48ab62-6b2b-4e85-9b00-f100ac61d8f0  

**Backend (Render Blueprint):** https://dashboard.render.com/blueprint/new?repo=https://github.com/kavyarathod05/FeeFlow  
After API is live, set frontend `VITE_API_BASE_URL` to the Render URL and re-deploy/claim the frontend. Run `npm run seed` once on the API service.

## Prerequisites

- Node.js 20+
- PostgreSQL 14+
- npm

## Environment variables (names only)

Backend:

- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `PORT`
- `NODE_ENV`
- `CORS_ORIGIN`
- `APP_BASE_URL`
- `API_BASE_URL`
- `OTP_DEMO_MODE`
- `OTP_DEMO_CODE`
- `OTP_EXPIRY_MINUTES`
- `OTP_MAX_ATTEMPTS`
- `PAYMENT_WEBHOOK_SECRET`
- `GST_RATE`
- `TZ`

Frontend:

- `VITE_API_BASE_URL`

Copy `.env.example` to `backend/.env` and `frontend/.env`. Never commit secrets.

## Local setup

1. Create a PostgreSQL database and user matching `DATABASE_URL`.
2. Backend:

```bash
cd backend
npm install
npx prisma migrate deploy
npm run seed
npm run dev
```

API: `http://localhost:4000` · Health: `GET /health`

3. Frontend:

```bash
cd frontend
npm install
npm run dev
```

App: `http://localhost:5173`

## Testing

```bash
cd backend
npm test
```

Optional Playwright (after servers are up):

```bash
cd frontend
npx playwright install chromium
npx playwright test
```

## Demo login credentials

**Accounts executive**

- Email: `accounts@feeflow.demo`
- Password: `Accounts@123`

**Parent OTP (demo mode)**

- Phone examples: `9876500587` (Ishita), `9876500412` (Aarav), `9876500219` (Mohit)
- When `OTP_DEMO_MODE=true`, use OTP from response / logs (default demo code name: `OTP_DEMO_CODE`)
- This is mock delivery only — no real SMS is sent

## Mock payment instructions

1. Parent login → open outstanding instalment → Pay now
2. Or Accounts → ledger → Payment link
3. On `/pay/:token`, start session, then choose Success / Fail / Cancel / Unmatched
4. Success allocates once, issues GST receipt, cancels pending reminders
5. Replay callback is safe (idempotent)
6. Unmatched payments appear in Accounts → Reconciliation

## OTP demo instructions

1. Set `OTP_DEMO_MODE=true` (never in real production with a fixed code)
2. `POST /api/auth/parent/request-otp` with parent phone
3. Use returned `demoOtp` (non-production) or `OTP_DEMO_CODE`
4. `POST /api/auth/parent/verify-otp`

## Production deployment (recommended)

### Backend — Render Web Service

- Root: `backend`
- Build: `npm install && npx prisma generate && npm run build`
- Start: `npx prisma migrate deploy && node dist/server.js`
- Bind: Express listens on `0.0.0.0:$PORT`
- Attach Render PostgreSQL; set `DATABASE_URL` and other env names above
- Set `CORS_ORIGIN` to the Vercel frontend URL
- Run seed once via Render shell: `npm run seed`
- Health check path: `/health`

### Frontend — Vercel

- Root: `frontend`
- Build: `npm run build`
- Output: `dist`
- Env: `VITE_API_BASE_URL` = Render API URL

### Notes

- Filesystem on Render is ephemeral — use Postgres, not local disk, for data
- Free web services may spin down after inactivity
- Redis/BullMQ not required for MVP (in-process cron for reminders)

## Known limitations

- Refund formula is **illustrative** (assumption A1), not client-approved legal policy
- OTP/consent are demo workflows, not production DPDP verification
- Messaging and payment gateway are mocked
- Risk score is a deterministic heuristic, not trained ML
- Tally export is CSV mapping assumption, not live Tally API
- Bulk attendance/score upload UI is optional depth (seed covers sample data)
