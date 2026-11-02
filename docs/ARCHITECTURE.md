# FeeFlow — Architecture & Day-1 Decisions

## Product

FeeFlow is a multi-centre coaching fee management SaaS for Company A (Jaipur).
Core slice: fee ledger, parent OTP portal + pay link, reminder cancel-on-pay,
pro-rata refund calculator, dues dashboard, explainable dropout-risk tasks.

Roles (MVP): **Parent**, **Accounts Executive**.

---

## Architecture

```
┌─────────────┐     JWT / OTP      ┌──────────────────┐
│  React SPA  │ ◄────────────────► │  Express API     │
│  Vite + TS  │                    │  domain modules  │
└─────────────┘                    └────────┬─────────┘
                                            │
                     ┌──────────────────────┼──────────────────────┐
                     ▼                      ▼                      ▼
              PostgreSQL              In-process              Mock adapters
              (Prisma)                job runner              (SMS/WhatsApp/
                                      (reminders,             payment gateway)
                                       risk scan)
```

**Why this stack**
- React/Vite/TS + Tailwind: fast, typed UI for ~8 screens.
- Express + Prisma + PostgreSQL: correct decimals, transactions, migrations.
- In-process scheduler (node-cron) for MVP reminders — Redis/BullMQ optional later.
- Mock payment + messaging adapters keep demo runnable without third-party accounts.

**Deploy target:** Frontend → Vercel (`https://frontend-beta-two-a4xpte0563.vercel.app`); Backend + Postgres → Render (`https://feeflow-api-rppm.onrender.com`); bind `0.0.0.0:$PORT`.

---

## Ambiguous financial rules (labelled assumptions)

| ID | Topic | Assumption (MVP) |
|----|--------|------------------|
| A1 | Refund formula | Client did not supply written policy. **Illustrative:** `eligibleNetFee × remainingEligibleDays / totalEligibleDays`, capped at (paid − alreadyRefunded). Labelled in UI as illustrative, not legal policy. |
| A2 | Eligible net fee | Base fee − approved discounts. Non-refundable admin fee = ₹0 unless policy config sets it. |
| A3 | Reminder schedule | T−3 days, T−0 (due date 09:00 IST), T+3, T+7, T+15. Configurable in `ReminderConfig`. |
| A4 | Timezone | Asia/Kolkata for all due/overdue/reminder dates. |
| A5 | Partial payment | FIFO allocation within selected instalment only (parent pays a specific instalment). |
| A6 | GST on receipts | 18% CGST+SGST illustrative split on taxable component; demo rate in config. |
| A7 | Risk model | Deterministic weighted score (missed instalments, attendance drop, test decline). Not ML. Creates counsellor task only. |
| A8 | OTP demo | Dev/demo mode logs OTP and accepts documented demo OTP when `OTP_DEMO_MODE=true`. Not for production. |
| A9 | Consent | MVP stores versioned consent checkbox + timestamp. Production needs legally reviewed DPDP verification. |
| A10 | Sample dates | Brief snapshot for STU-0412/0587/0219 preserved; live overdue recalculated from `AS_OF` / system date and labelled separately. |

---

## Database (Prisma / PostgreSQL)

Core entities: User, Parent, Student, ParentStudent, Centre, Batch, FeePlan, Instalment, Discount, Payment, PaymentAllocation, PaymentLink, Receipt, Reminder, ReminderTemplate, RefundPolicy, RefundRequest, AttendanceRecord, Test, TestScore, RiskAssessment, CounsellorTask, ParentalConsent, AuditLog, UnmatchedPayment, IdempotencyRecord.

**Invariants**
1. Sum(instalment.amount) = FeePlan.netFee before activation.
2. Allocation never exceeds instalment remaining or payment amount.
3. Failed / pending / unmatched payments never count as collected.
4. Days overdue only when dueDate < today AND remaining > 0.
5. Successful payment → cancel pending reminders for that instalment (idempotent).
6. Risk flag never mutates fees or parent messages.

Amounts: `Decimal(12,2)` INR.

---

## 7-day MVP scope (must ship)

1. Auth: parent OTP, accounts JWT + RBAC
2. Seeded multi-centre data incl. exact brief rows
3. Student fee ledger (backend-calculated)
4. Parent portal (mobile-first, HI/EN) + mock pay + receipt
5. Reminder centre + cancel on pay
6. Refund calculator (policy-driven, snapshot)
7. Accounts dashboard (ageing, centre/batch)
8. Risk assessments + false-positive feedback
9. Reconciliation queue + Tally CSV export
10. Tests for finance / reminders / security / risk
11. Live deploy + TDD + deployment.md ZIP

**Cut if needed:** bulk attendance/score upload UI polish, Redis/BullMQ, real SMS/gateway.

---

## Design direction (Figma)

- Navy/indigo primary (`#1B2A4A` / `#2F4B8A`), white/neutral surfaces, subtle borders
- Typography: **Source Serif 4** for display amounts (parent), **IBM Plex Sans** for UI
- Accounts: desktop sidebar + tables; Parent: mobile-first 5-second dues view
- Status accents only; no decorative KPI walls
