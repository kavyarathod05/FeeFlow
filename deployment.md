# FeeFlow — Deployment & local run

**GitHub:** https://github.com/kavyarathod05/FeeFlow

**Live production**

| Layer | URL |
|-------|-----|
| Frontend | https://frontend-beta-two-a4xpte0563.vercel.app |
| API | https://feeflow-api-rppm.onrender.com |
| Health | https://feeflow-api-rppm.onrender.com/health |

Prefer a **normal Render Web Service** (not Blueprint) when the account is on limited/free plans. Blueprint Postgres often forces a paid DB tier.

---

## Production — manual Render Web Service (recommended)

### A. Free Postgres

Use Render free Postgres (linked via private `DATABASE_URL`) or Neon:

1. Create a free project at https://console.neon.tech  
2. Copy the connection string (include SSL), e.g. `postgresql://...@.../neondb?sslmode=require`

### B. Create Web Service on Render (Dashboard)

Open: https://dashboard.render.com/select-repo?type=web

| Setting | Value |
|---------|--------|
| Repository | `kavyarathod05/FeeFlow` |
| Name | `feeflow-api` |
| Region | Oregon (or closest) |
| Branch | `main` |
| Root Directory | `backend` |
| Runtime | Node |
| Build Command | `npm install --include=dev && npx prisma generate && npm run build` |
| Start Command | `npx prisma migrate deploy && node dist/server.js` |
| Instance type | **Free** |
| Health Check Path | `/health` |

### C. Environment variables (names → set values in Dashboard)

| Name | Example / notes |
|------|-----------------|
| `DATABASE_URL` | Neon (or Render) Postgres URL with `?sslmode=require` |
| `JWT_SECRET` | long random string (16+ chars) |
| `JWT_EXPIRES_IN` | `8h` |
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | `https://frontend-beta-two-a4xpte0563.vercel.app` |
| `APP_BASE_URL` | `https://frontend-beta-two-a4xpte0563.vercel.app` |
| `API_BASE_URL` | `https://feeflow-api-rppm.onrender.com` |
| `OTP_DEMO_MODE` | `true` |
| `OTP_DEMO_CODE` | `246810` |
| `OTP_EXPIRY_MINUTES` | `5` |
| `OTP_MAX_ATTEMPTS` | `5` |
| `PAYMENT_WEBHOOK_SECRET` | random string |
| `GST_RATE` | `0.18` |
| `TZ` | `Asia/Kolkata` |
| `AUTO_SEED` | `true` (seeds empty DB on boot; free tier often blocks Shell) |

Render sets `PORT` automatically. The app binds `0.0.0.0:$PORT`.

### D. After first successful deploy

1. If Shell is available: `npm run seed` (otherwise rely on `AUTO_SEED=true`)  
2. Check: `https://feeflow-api-rppm.onrender.com/health`  
3. OTP smoke: `POST /api/auth/parent/request-otp` with `{"phone":"9876500587"}` → expect `demoOtp`

### E. Frontend (Vercel)

1. Import repo → root `frontend`  
2. Env: `VITE_API_BASE_URL=https://feeflow-api-rppm.onrender.com`  
3. Build: `npm run build` · Output: `dist`  
4. Disable **Deployment Protection / Vercel Authentication** so the demo is public: `vercel project protection disable --sso`

**Note:** Free Render web services sleep after ~15 minutes; first request can take 30–60s.

---

## Blueprint (optional, not recommended on limited plans)

`render.yaml` remains in the repo for paid/full Blueprint users. Skip it if Postgres/basic plans are blocked.

---

## Local setup

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- npm

### Environment variables (names only)

Backend: `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `PORT`, `NODE_ENV`, `CORS_ORIGIN`, `APP_BASE_URL`, `API_BASE_URL`, `OTP_DEMO_MODE`, `OTP_DEMO_CODE`, `OTP_EXPIRY_MINUTES`, `OTP_MAX_ATTEMPTS`, `PAYMENT_WEBHOOK_SECRET`, `GST_RATE`, `TZ`

Frontend: `VITE_API_BASE_URL`

Copy `.env.example` → `backend/.env` and `frontend/.env`. Never commit secrets.

### Steps

```bash
cd backend
npm install
npx prisma migrate deploy
npm run seed
npm run dev
```

```bash
cd frontend
npm install
npm run dev
```

- API: `http://localhost:4000` · Health: `GET /health`  
- App: `http://localhost:5173`

### Testing

```bash
cd backend && npm test
cd frontend && npx playwright test
```

---

## Demo login credentials

**Accounts executive**

- Email: `accounts@feeflow.demo`
- Password: `Accounts@123`

**Parent OTP (demo mode)**

- Phones: `9876500587` (Ishita), `9876500412` (Aarav), `9876500219` (Mohit)
- OTP: `246810` when `OTP_DEMO_MODE=true`
- Mock delivery only — no real SMS

## Mock payment

1. Parent → Pay now (or Accounts → Payment link)  
2. `/pay/:token` → Start session → Success / Fail / Cancel / Unmatched  
3. Success: allocate once, GST receipt, cancel reminders  
4. Unmatched → Accounts → Reconciliation  

## Known limitations

- Refund formula is illustrative (assumption A1)  
- OTP/consent are demo workflows  
- Messaging and gateway are mocked  
- Risk score is a deterministic heuristic  
- Free Render cold starts  
