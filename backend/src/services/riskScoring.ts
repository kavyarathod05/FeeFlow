/**
 * ASSUMPTION A7: Deterministic explainable scoring — NOT a trained ML model.
 * Safety: only creates counsellor tasks; never fee actions or parent messages.
 */
export type RiskInputs = {
  missedInstalments: number;
  attendanceRecentPct: number | null;
  attendancePriorPct: number | null;
  testRecentAvgPct: number | null;
  testPriorAvgPct: number | null;
};

export type RiskFactor = {
  key: string;
  label: string;
  weight: number;
  contribution: number;
  detail: string;
};

export type RiskResult = {
  category: "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT_DATA";
  score: number | null;
  factors: RiskFactor[];
  explanation: string;
  inputs: RiskInputs;
};

export function scoreDropoutRisk(inputs: RiskInputs): RiskResult {
  const hasAttendance =
    inputs.attendanceRecentPct !== null && inputs.attendancePriorPct !== null;
  const hasTests = inputs.testRecentAvgPct !== null && inputs.testPriorAvgPct !== null;
  const hasFeeSignal = inputs.missedInstalments > 0;

  if (!hasAttendance && !hasTests && !hasFeeSignal) {
    return {
      category: "INSUFFICIENT_DATA",
      score: null,
      factors: [],
      explanation:
        "Insufficient data: no missed instalments, attendance history, or test trends available. No score invented.",
      inputs,
    };
  }

  const factors: RiskFactor[] = [];
  let score = 0;

  if (inputs.missedInstalments > 0) {
    const contribution = Math.min(40, inputs.missedInstalments * 20);
    factors.push({
      key: "missed_instalments",
      label: "Missed instalments",
      weight: 40,
      contribution,
      detail: `Missed ${inputs.missedInstalments} instalment(s) with outstanding balance.`,
    });
    score += contribution;
  }

  if (hasAttendance) {
    const drop = (inputs.attendancePriorPct as number) - (inputs.attendanceRecentPct as number);
    if (drop > 0) {
      const contribution = Math.min(30, Math.round(drop * 0.75));
      factors.push({
        key: "attendance_drop",
        label: "Falling attendance",
        weight: 30,
        contribution,
        detail: `Attendance dropped from ${inputs.attendancePriorPct}% to ${inputs.attendanceRecentPct}% (Δ ${drop.toFixed(0)} pts).`,
      });
      score += contribution;
    } else {
      factors.push({
        key: "attendance_stable",
        label: "Attendance stable/improving",
        weight: 30,
        contribution: 0,
        detail: `Attendance recent ${inputs.attendanceRecentPct}% vs prior ${inputs.attendancePriorPct}%.`,
      });
    }
  }

  if (hasTests) {
    const drop = (inputs.testPriorAvgPct as number) - (inputs.testRecentAvgPct as number);
    if (drop > 0) {
      const contribution = Math.min(30, Math.round(drop * 0.9));
      factors.push({
        key: "test_decline",
        label: "Declining test scores",
        weight: 30,
        contribution,
        detail: `Test average dropped from ${inputs.testPriorAvgPct}% to ${inputs.testRecentAvgPct}% (Δ ${drop.toFixed(0)} pts).`,
      });
      score += contribution;
    } else {
      factors.push({
        key: "tests_stable",
        label: "Test scores stable/improving",
        weight: 30,
        contribution: 0,
        detail: `Recent test avg ${inputs.testRecentAvgPct}% vs prior ${inputs.testPriorAvgPct}%.`,
      });
    }
  }

  score = Math.min(100, score);
  const category = score >= 70 ? "HIGH" : score >= 40 ? "MEDIUM" : "LOW";
  const explanation = `Decision-support score ${score}/100 (${category}). Factors: ${
    factors.map((f) => f.detail).join(" ")
  } This is an explainable heuristic, not a trained predictive model.`;

  return { category, score, factors, explanation, inputs };
}
