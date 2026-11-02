import { describe, expect, it } from "vitest";
import { calculateProRataRefund } from "../src/services/refundCalculation.js";

const base = {
  baseFee: 120000,
  discountTotal: 0,
  totalPaid: 60000,
  courseStartDate: new Date("2026-04-01"),
  courseEndDate: new Date("2027-03-31"),
};

describe("refundCalculation (illustrative A1)", () => {
  it("full refund before course start capped by paid", () => {
    const r = calculateProRataRefund({
      ...base,
      withdrawalDate: new Date("2026-03-01"),
    });
    expect(r.ok).toBe(true);
    expect(r.remainingDays).toBe(r.totalDays);
    expect(Number(r.calculatedRefund)).toBe(60000);
    expect(r.edgeCase).toBe("withdrawal_before_course_start");
  });

  it("midway pro-rata capped by paid", () => {
    const r = calculateProRataRefund({
      ...base,
      withdrawalDate: new Date("2026-10-01"),
      totalPaid: 120000,
    });
    expect(r.ok).toBe(true);
    expect(r.remainingDays).toBeGreaterThan(0);
    expect(Number(r.calculatedRefund)).toBeLessThanOrEqual(120000);
    expect(Number(r.calculatedRefund)).toBe(Number(r.rawProRata));
  });

  it("zero refund at course completion", () => {
    const r = calculateProRataRefund({
      ...base,
      withdrawalDate: new Date("2027-03-31"),
      totalPaid: 120000,
    });
    expect(Number(r.calculatedRefund)).toBe(0);
  });

  it("never exceeds eligible paid minus prior refunds", () => {
    const r = calculateProRataRefund({
      ...base,
      withdrawalDate: new Date("2026-03-01"),
      totalPaid: 20000,
      previouslyRefunded: 5000,
    });
    expect(Number(r.calculatedRefund)).toBe(15000);
  });

  it("accounts for discounts in eligible net", () => {
    const r = calculateProRataRefund({
      ...base,
      discountTotal: 20000,
      totalPaid: 100000,
      withdrawalDate: new Date("2026-03-01"),
    });
    expect(r.eligibleNetFee).toBe("100000.00");
    expect(Number(r.calculatedRefund)).toBe(100000);
  });
});
