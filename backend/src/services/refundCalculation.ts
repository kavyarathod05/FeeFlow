/**
 * ASSUMPTION A1: Illustrative pro-rata refund policy — NOT the client's approved written policy.
 * Formula: refundable = eligibleNetFee × remainingEligibleDays / totalEligibleDays
 * Cap: never exceed (totalPaid − previouslyRefunded)
 * Processing deadline: withdrawalDate + policy.processingDays (Ministry guideline: 10 days)
 */
import { addDays } from "date-fns";
import { calendarDaysBetween } from "../utils/dates.js";
import { money, toFixed, toNumber, minMoney, maxMoney } from "../utils/money.js";

export const REFUND_CALCULATION_VERSION = "illustrative-prorata-v1";

export type RefundInput = {
  baseFee: number | string;
  discountTotal: number | string;
  nonRefundableAmount?: number | string;
  totalPaid: number | string;
  previouslyRefunded?: number | string;
  courseStartDate: Date;
  courseEndDate: Date;
  withdrawalDate: Date;
  processingDays?: number;
};

export type RefundResult = {
  ok: boolean;
  error?: string;
  baseFee: string;
  discountTotal: string;
  eligibleNetFee: string;
  totalPaid: string;
  previouslyRefunded: string;
  maxRefundableFromPayments: string;
  totalDays: number;
  completedDays: number;
  remainingDays: number;
  rawProRata: string;
  calculatedRefund: string;
  processingDeadline: Date | null;
  calculationVersion: string;
  formulaDescription: string;
  edgeCase: string;
  snapshot: Record<string, unknown>;
};

export function calculateProRataRefund(input: RefundInput): RefundResult {
  const formulaDescription =
    "ASSUMPTION (illustrative): eligibleNetFee × remainingDays / totalDays, capped at (paid − alreadyRefunded)";

  const baseFee = money(input.baseFee);
  const discountTotal = money(input.discountTotal);
  const nonRefundable = money(input.nonRefundableAmount ?? 0);
  const totalPaid = money(input.totalPaid);
  const previouslyRefunded = money(input.previouslyRefunded ?? 0);

  if (input.courseEndDate < input.courseStartDate) {
    return errorResult("Missing or invalid course dates", input, formulaDescription);
  }

  const eligibleNet = maxMoney(baseFee.minus(discountTotal).minus(nonRefundable), 0);
  const totalDays = calendarDaysBetween(input.courseStartDate, input.courseEndDate);
  if (totalDays === 0) {
    return errorResult("Total eligible course duration is zero", input, formulaDescription);
  }

  let completedDays: number;
  let remainingDays: number;
  let edgeCase: string;

  if (input.withdrawalDate < input.courseStartDate) {
    completedDays = 0;
    remainingDays = totalDays;
    edgeCase = "withdrawal_before_course_start";
  } else if (input.withdrawalDate >= input.courseEndDate) {
    completedDays = totalDays;
    remainingDays = 0;
    edgeCase = "withdrawal_on_or_after_course_end";
  } else {
    completedDays = calendarDaysBetween(input.courseStartDate, input.withdrawalDate);
    remainingDays = Math.max(0, totalDays - completedDays);
    edgeCase = "withdrawal_mid_course";
  }

  const rawProRata =
    remainingDays === 0
      ? money(0)
      : eligibleNet.mul(remainingDays).div(totalDays);

  const maxFromPayments = maxMoney(totalPaid.minus(previouslyRefunded), 0);
  const calculated = minMoney(rawProRata, maxFromPayments);

  const processingDays = input.processingDays ?? 10;
  const processingDeadline = addDays(input.withdrawalDate, processingDays);

  const snapshot = {
    assumption: "A1_illustrative_not_client_approved_policy",
    formulaDescription,
    baseFee: toFixed(baseFee),
    discountTotal: toFixed(discountTotal),
    nonRefundable: toFixed(nonRefundable),
    eligibleNetFee: toFixed(eligibleNet),
    totalPaid: toFixed(totalPaid),
    previouslyRefunded: toFixed(previouslyRefunded),
    maxRefundableFromPayments: toFixed(maxFromPayments),
    totalDays,
    completedDays,
    remainingDays,
    rawProRata: toFixed(rawProRata),
    calculatedRefund: toFixed(calculated),
    edgeCase,
    calculationVersion: REFUND_CALCULATION_VERSION,
    processingDays,
  };

  return {
    ok: true,
    baseFee: toFixed(baseFee),
    discountTotal: toFixed(discountTotal),
    eligibleNetFee: toFixed(eligibleNet),
    totalPaid: toFixed(totalPaid),
    previouslyRefunded: toFixed(previouslyRefunded),
    maxRefundableFromPayments: toFixed(maxFromPayments),
    totalDays,
    completedDays,
    remainingDays,
    rawProRata: toFixed(rawProRata),
    calculatedRefund: toFixed(calculated),
    processingDeadline,
    calculationVersion: REFUND_CALCULATION_VERSION,
    formulaDescription,
    edgeCase,
    snapshot,
  };
}

function errorResult(
  error: string,
  input: RefundInput,
  formulaDescription: string,
): RefundResult {
  return {
    ok: false,
    error,
    baseFee: toFixed(input.baseFee),
    discountTotal: toFixed(input.discountTotal),
    eligibleNetFee: "0.00",
    totalPaid: toFixed(input.totalPaid),
    previouslyRefunded: toFixed(input.previouslyRefunded ?? 0),
    maxRefundableFromPayments: "0.00",
    totalDays: 0,
    completedDays: 0,
    remainingDays: 0,
    rawProRata: "0.00",
    calculatedRefund: "0.00",
    processingDeadline: null,
    calculationVersion: REFUND_CALCULATION_VERSION,
    formulaDescription,
    edgeCase: "invalid_input",
    snapshot: { error, assumption: "A1_illustrative_not_client_approved_policy" },
  };
}

export function refundToNumbers(result: RefundResult) {
  return {
    ...result,
    baseFee: toNumber(result.baseFee),
    discountTotal: toNumber(result.discountTotal),
    eligibleNetFee: toNumber(result.eligibleNetFee),
    totalPaid: toNumber(result.totalPaid),
    previouslyRefunded: toNumber(result.previouslyRefunded),
    maxRefundableFromPayments: toNumber(result.maxRefundableFromPayments),
    rawProRata: toNumber(result.rawProRata),
    calculatedRefund: toNumber(result.calculatedRefund),
  };
}
