import type { InstalmentStatus } from "@prisma/client";
import { daysOverdue, daysUntil } from "../utils/dates.js";
import { money, sub, toFixed, toNumber, isPositive, isZero } from "../utils/money.js";

export type InstalmentLike = {
  amount: number | string | { toString(): string };
  amountPaid: number | string | { toString(): string };
  dueDate: Date;
  status?: InstalmentStatus;
};

function asMoneyInput(value: number | string | { toString(): string }): string | number {
  return typeof value === "number" || typeof value === "string" ? value : value.toString();
}

export function netCourseFee(baseFee: number | string, discountTotal: number | string): string {
  const net = sub(baseFee, discountTotal);
  if (net.isNegative()) {
    throw new Error("Net course fee cannot be negative");
  }
  return toFixed(net);
}

export function outstandingBalance(
  netFee: number | string,
  successfullyAllocated: number | string,
  adjustments: number | string = 0,
): string {
  // Outstanding = net − allocated + adjustments (e.g. penalties); never treat failed/unmatched as allocated
  const result = money(netFee).minus(money(successfullyAllocated)).plus(money(adjustments));
  return toFixed(result.lessThan(0) ? 0 : result);
}

export function instalmentRemaining(inst: InstalmentLike): string {
  const rem = sub(asMoneyInput(inst.amount), asMoneyInput(inst.amountPaid));
  return toFixed(rem.lessThan(0) ? 0 : rem);
}

export function validateInstalmentSum(
  instalmentAmounts: Array<number | string>,
  netFee: number | string,
): { valid: boolean; sum: string; netFee: string } {
  const sum = instalmentAmounts.reduce((acc, a) => acc.plus(money(a)), money(0));
  const net = money(netFee);
  return {
    valid: sum.equals(net),
    sum: toFixed(sum),
    netFee: toFixed(net),
  };
}

export function deriveInstalmentStatus(
  inst: InstalmentLike,
  asOf: Date = new Date(),
): InstalmentStatus {
  const remaining = money(instalmentRemaining(inst));
  if (isZero(remaining)) return "PAID";
  const paid = money(asMoneyInput(inst.amountPaid));
  const overdue = daysOverdue(inst.dueDate, asOf) > 0;
  if (paid.greaterThan(0) && remaining.greaterThan(0)) {
    return overdue ? "OVERDUE" : "PARTIALLY_PAID";
  }
  if (overdue) return "OVERDUE";
  if (daysUntil(inst.dueDate, asOf) === 0) return "DUE";
  return "UPCOMING";
}

export function instalmentDaysOverdue(inst: InstalmentLike, asOf: Date = new Date()): number {
  const remaining = money(instalmentRemaining(inst));
  if (!isPositive(remaining)) return 0;
  return daysOverdue(inst.dueDate, asOf);
}

export function canAllocate(
  remainingOnInstalment: number | string,
  paymentAmount: number | string,
): { allowed: boolean; allocate: string; reason?: string } {
  const rem = money(remainingOnInstalment);
  const pay = money(paymentAmount);
  if (pay.lessThanOrEqualTo(0)) {
    return { allowed: false, allocate: "0.00", reason: "Payment amount must be positive" };
  }
  if (rem.lessThanOrEqualTo(0)) {
    return { allowed: false, allocate: "0.00", reason: "Instalment already fully paid" };
  }
  if (pay.greaterThan(rem)) {
    return {
      allowed: false,
      allocate: "0.00",
      reason: "Payment exceeds outstanding instalment amount",
    };
  }
  return { allowed: true, allocate: toFixed(pay) };
}

export function summariseLedger(instalments: InstalmentLike[], asOf: Date = new Date()) {
  let total = money(0);
  let paid = money(0);
  let overdue = money(0);
  let overdueCount = 0;

  const rows = instalments.map((inst) => {
    const amount = money(asMoneyInput(inst.amount));
    const amountPaid = money(asMoneyInput(inst.amountPaid));
    const remaining = money(instalmentRemaining(inst));
    const status = deriveInstalmentStatus(inst, asOf);
    const overdueDays = instalmentDaysOverdue(inst, asOf);
    total = total.plus(amount);
    paid = paid.plus(amountPaid);
    if (status === "OVERDUE" || (overdueDays > 0 && remaining.greaterThan(0))) {
      overdue = overdue.plus(remaining);
      overdueCount += 1;
    }
    return {
      amount: toNumber(amount),
      amountPaid: toNumber(amountPaid),
      remaining: toNumber(remaining),
      status,
      daysOverdue: overdueDays,
      daysUntilDue: daysUntil(inst.dueDate, asOf),
    };
  });

  return {
    totalBilled: toNumber(total),
    totalPaid: toNumber(paid),
    outstanding: toNumber(sub(total, paid).lessThan(0) ? 0 : sub(total, paid)),
    overdueAmount: toNumber(overdue),
    overdueCount,
    instalments: rows,
  };
}
