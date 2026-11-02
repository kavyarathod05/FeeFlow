import { describe, expect, it } from "vitest";
import { canAllocate } from "../src/services/feeCalculation.js";
import { signWebhookPayload, verifyWebhookSignature } from "../src/services/paymentService.js";

describe("payment safety primitives", () => {
  it("signs and verifies webhook payloads", () => {
    const payload = { gatewayRef: "MOCK-1", status: "SUCCESS", amount: 15000 };
    const sig = signWebhookPayload(payload);
    expect(verifyWebhookSignature(payload, sig)).toBe(true);
    expect(verifyWebhookSignature(payload, "deadbeef")).toBe(false);
  });

  it("blocks overpayment and zero payment", () => {
    expect(canAllocate(15000, 15001).allowed).toBe(false);
    expect(canAllocate(15000, 0).allowed).toBe(false);
    expect(canAllocate(0, 100).allowed).toBe(false);
    expect(canAllocate(15000, 15000).allowed).toBe(true);
  });
});
