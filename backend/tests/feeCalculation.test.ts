import { describe, expect, it } from "vitest";
import {
  canAllocate,
  deriveInstalmentStatus,
  instalmentDaysOverdue,
  instalmentRemaining,
  netCourseFee,
  outstandingBalance,
  validateInstalmentSum,
} from "../src/services/feeCalculation.js";

describe("feeCalculation", () => {
  it("computes net course fee with discount", () => {
    expect(netCourseFee(120000, 10000)).toBe("110000.00");
  });

  it("validates three and four instalment plans", () => {
    expect(validateInstalmentSum([40000, 40000, 40000], 120000).valid).toBe(true);
    expect(validateInstalmentSum([30000, 30000, 30000, 30000], 120000).valid).toBe(true);
    expect(validateInstalmentSum([30000, 30000, 30000], 120000).valid).toBe(false);
  });

  it("handles partial payments and remaining", () => {
    expect(instalmentRemaining({ amount: 30000, amountPaid: 15000, dueDate: new Date() })).toBe(
      "15000.00",
    );
  });

  it("prevents overpayment allocation", () => {
    const r = canAllocate(15000, 20000);
    expect(r.allowed).toBe(false);
  });

  it("allows exact remaining allocation", () => {
    expect(canAllocate(15000, 15000).allowed).toBe(true);
  });

  it("does not treat failed payments in outstanding", () => {
    // only successful allocations count — caller passes allocated sum
    expect(outstandingBalance(120000, 30000)).toBe("90000.00");
  });

  it("computes overdue only when remaining > 0", () => {
    const due = new Date("2026-10-10T00:00:00+05:30");
    const asOf = new Date("2026-11-02T00:00:00+05:30");
    expect(
      instalmentDaysOverdue({ amount: 30000, amountPaid: 30000, dueDate: due }, asOf),
    ).toBe(0);
    expect(
      instalmentDaysOverdue({ amount: 30000, amountPaid: 15000, dueDate: due }, asOf),
    ).toBe(23);
    expect(
      deriveInstalmentStatus({ amount: 30000, amountPaid: 15000, dueDate: due }, asOf),
    ).toBe("OVERDUE");
  });

  it("prevents negative net fee", () => {
    expect(() => netCourseFee(1000, 2000)).toThrow();
  });
});
