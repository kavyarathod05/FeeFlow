# FeeFlow — Technical Design Document

**GitHub URL:** https://github.com/kavyarathod05/FeeFlow  
**Live frontend:** https://frontend-beta-two-a4xpte0563.vercel.app  
**Live API:** https://feeflow-api-rppm.onrender.com  
**API health:** `GET https://feeflow-api-rppm.onrender.com/health`

**ASSUMPTION:** Free Render web services sleep after ~15 minutes of inactivity; the first request after sleep can take 30–60s. OTP demo mode returns `demoOtp` in the API response for reviewers.

---

## 1. Executive summary

FeeFlow is an MVP SaaS for Company A (Jaipur coaching) that gives parents a clear dues view with pay links, automates Hindi/English reminders that stop on payment, standardises illustrative pro-rata refunds, and gives accounts a multi-centre dues dashboard with reconciliation and explainable dropout-risk counsellor tasks.

## 2. Original business problem

Desktop fee software + Excel due dates + phone chasing. Estimated leakage: late follow-up (~₹62.4L never collected), late collections, and ~4 FTE chasing cost (~₹16.8L) → ~₹79.2L/year impact cited in the brief.

## 3. Business impact calculations

From the brief (preserved): 2,600 × ₹1.2L = ₹31.2Cr billed; 2% uncollected ≈ ₹62.4L; staff chasing ≈ ₹16.8L; total ≈ ₹79.2L. Success targets: cut 60+ day late value 12%→6%, parent dues calls −70%, month-end recon 4 days→1.

## 4. Product scope

**In MVP:** fee ledger, parent OTP portal, mock pay + receipt, reminder cancel-on-pay, refund calculator, dues dashboard, risk tasks, reconciliation CSV.  
**Roles:** Parent, Accounts Executive.  
**Out of scope:** LMS, timetables, admissions CRM.

## 5. Architecture

React SPA → Express domain modules → PostgreSQL (Prisma). In-process cron for mock reminder dispatch. Mock payment webhook with HMAC + idempotency. See `docs/ARCHITECTURE.md`.

## 6. Technology choices

Chosen for typed financial correctness (Decimal), fast MVP UI, Render/Vercel deployability, and strong testability without paid gateways/SMS.

## 7. Database / ER

26+ relational models including FeePlan, Instalment, Payment, PaymentAllocation, Reminder, RefundPolicy/Request, RiskAssessment, CounsellorTask, UnmatchedPayment, IdempotencyRecord. Amounts: `Decimal(12,2)`. Schema: `backend/prisma/schema.prisma`.

## 8. Authentication & permissions

- Parent: OTP (hashed, expiry, rate limit); JWT with `parentId`; student access via `ParentStudent` only.
- Accounts: email/password (bcrypt) + JWT; dashboard/refund/risk/recon restricted.
- Parent → accounts endpoints → 403.

## 9. Fee & instalment logic

`netFee = base − discounts`. Outstanding from successful allocations only. Instalment sum must equal net fee on activation. Partial payments update remaining; overdue days only if remaining > 0 and due date passed (Asia/Kolkata).

## 10. Payment lifecycle

Link → mock checkout session → gateway result → signed webhook → transactional allocation → receipt (GST split) → cancel pending reminders. Duplicate callbacks return `already_processed`. Unmatched → review queue (no auto allocate, reminders kept).

## 11. Reminder automation

Configurable T−3 / T0 / T+3/+7/+15 (ASSUMPTION A3). HI/EN templates. Respect consent. Partial: amount = remaining. Full pay: cancel scheduled. Failed/unmatched: do not cancel. Mock delivery only.

## 12. Refund calculation & assumptions

**ASSUMPTION A1 (labelled in UI):**  
`eligibleNetFee × remainingDays / totalDays`, capped at `paid − alreadyRefunded`. Versioned policy + immutable snapshot. 10-day deadline shown as obligation, not compliance guarantee. **Not** the client's approved written policy.

## 13. AI risk scoring

Deterministic weighted score from missed instalments, attendance drop, test decline (ASSUMPTION A7). Creates counsellor task only. False-positive feedback stored. Never mutates fees or parent messages. Insufficient data → no invented score.

## 14. API architecture

REST under `/api/*` — auth, students/ledger, instalments/payment-link, payments (checkout/webhook), refunds, reminders, dashboard, risk, reconciliation, consent. Consistent `{ success, data|error }` envelope.

Key auth paths:
- `POST /api/auth/parent/request-otp`
- `POST /api/auth/parent/verify-otp`
- `POST /api/auth/accounts/login`

## 15. Security & privacy

Zod validation, RBAC, hashed OTP/passwords, webhook HMAC, idempotency keys, audit logs, CORS, rate limits, no secrets in repo, synthetic data only. Consent is **demo** (ASSUMPTION A9).

## 16. UI / design decisions

Restrained navy/indigo, IBM Plex Sans + Source Serif 4 for amounts. Accounts: sidebar + tables. Parent: mobile-first 5-second dues (amount, next due, Pay). Loading/empty/error states. Hindi/English toggle.

**Figma:** MCP unavailable during build. Design system + 8 screens captured in `docs/figma-design-system.html` and `docs/figma-screens.html` (importable to Figma). Tokens live in `frontend/src/index.css`.

## 17. Testing

Vitest: fee, refund, risk, reminder amount rules (18 passing). API smoke verified: pay → receipt → idempotent replay → parent 403 on dashboard. Playwright scenario scaffold recommended for CI.

## 18. Deployment

| Layer | Host | URL |
|-------|------|-----|
| Frontend | Vercel | https://frontend-beta-two-a4xpte0563.vercel.app |
| API | Render (free web) | https://feeflow-api-rppm.onrender.com |
| Database | Render Postgres (free) | private `DATABASE_URL` |

See `deployment.md`. Server binds `0.0.0.0:$PORT`. Empty DB auto-seeds when `AUTO_SEED=true`.

## 19. Assumptions register

| ID | Type | Statement |
|----|------|-----------|
| A1 | Business-policy | Illustrative refund formula |
| A2 | Implementation | Eligible net = base − discounts (− optional non-refundable) |
| A3 | Implementation | Reminder day offsets configurable defaults |
| A4 | Technical | Asia/Kolkata date policy |
| A5 | Implementation | Parent pays specific instalment (not cross-instalment waterfall) |
| A6 | Business-policy | 18% GST illustrative on receipts |
| A7 | Technical | Deterministic risk heuristic ≠ ML |
| A8 | Technical | OTP demo mode |
| A9 | Future/legal | Demo consent ≠ production DPDP |
| A10 | Data | Brief snapshots preserved alongside live recalculation |

## 20. Intentionally cut

Bulk CSV upload UI, Redis/BullMQ, real SMS/WhatsApp/Razorpay, multi-approver refund workflow, student self-login role.

## 21. Future roadmap

Real gateway + messaging, legally reviewed refund policy pack, verifiable parental consent, trained risk model with counsellor feedback loop, live Tally integration, centre-level RBAC.
