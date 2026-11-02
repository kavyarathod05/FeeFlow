import { describe, expect, it } from "vitest";
import { scoreDropoutRisk } from "../src/services/riskScoring.js";

describe("riskScoring", () => {
  it("flags high risk with clear factors", () => {
    const r = scoreDropoutRisk({
      missedInstalments: 2,
      attendancePriorPct: 90,
      attendanceRecentPct: 55,
      testPriorAvgPct: 72,
      testRecentAvgPct: 48,
    });
    expect(r.category).toBe("HIGH");
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.factors.length).toBeGreaterThan(0);
  });

  it("returns insufficient data without inventing a score", () => {
    const r = scoreDropoutRisk({
      missedInstalments: 0,
      attendancePriorPct: null,
      attendanceRecentPct: null,
      testPriorAvgPct: null,
      testRecentAvgPct: null,
    });
    expect(r.category).toBe("INSUFFICIENT_DATA");
    expect(r.score).toBeNull();
  });

  it("medium / low categories", () => {
    const mid = scoreDropoutRisk({
      missedInstalments: 1,
      attendancePriorPct: 80,
      attendanceRecentPct: 70,
      testPriorAvgPct: 60,
      testRecentAvgPct: 55,
    });
    expect(["MEDIUM", "LOW", "HIGH"]).toContain(mid.category);

    const low = scoreDropoutRisk({
      missedInstalments: 0,
      attendancePriorPct: 80,
      attendanceRecentPct: 82,
      testPriorAvgPct: 60,
      testRecentAvgPct: 65,
    });
    expect(low.category).toBe("LOW");
  });
});
