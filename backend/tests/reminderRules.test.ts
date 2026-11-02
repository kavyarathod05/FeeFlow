import { describe, expect, it } from "vitest";
import { instalmentRemaining } from "../src/services/feeCalculation.js";

/**
 * Reminder amount rules unit-tested at the calculation boundary.
 * Integration of cancel-on-pay is covered by payment service transaction.
 */
describe("reminder amount rules", () => {
  it("partial payment reminder uses remaining not full instalment", () => {
    const remaining = instalmentRemaining({
      amount: 30000,
      amountPaid: 15000,
      dueDate: new Date("2026-10-10"),
    });
    expect(remaining).toBe("15000.00");
  });

  it("fully paid has zero remaining so reminders should cancel", () => {
    expect(
      instalmentRemaining({
        amount: 30000,
        amountPaid: 30000,
        dueDate: new Date("2026-10-10"),
      }),
    ).toBe("0.00");
  });
});
