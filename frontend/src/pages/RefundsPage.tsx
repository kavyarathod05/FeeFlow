import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, formatInr } from "../lib/api";
import { Button, Card, ErrorState, Input, PageHeader } from "../components/ui";

type Calc = {
  policy: {
    version: string;
    name: string;
    isIllustrative: boolean;
    formulaDescription: string;
    processingDays: number;
    disclaimer: string;
  };
  student: { name: string; studentCode: string; courseStartDate: string; courseEndDate: string };
  calculation: {
    ok: boolean;
    error?: string;
    eligibleNetFee: number;
    totalPaid: number;
    previouslyRefunded: number;
    totalDays: number;
    completedDays: number;
    remainingDays: number;
    rawProRata: number;
    calculatedRefund: number;
    processingDeadline: string | null;
    edgeCase: string;
    formulaDescription: string;
  };
};

export function RefundsPage() {
  const [params] = useSearchParams();
  const [studentId, setStudentId] = useState(params.get("studentId") ?? "");
  const [withdrawalDate, setWithdrawalDate] = useState("2026-11-15");

  const students = useQuery({
    queryKey: ["students-for-refund"],
    queryFn: () =>
      api<Array<{ id: string; name: string; studentCode: string }>>("/api/students"),
  });

  useEffect(() => {
    if (!studentId && students.data?.[0]) setStudentId(students.data[0].id);
  }, [students.data, studentId]);

  const calc = useMutation({
    mutationFn: () =>
      api<Calc>("/api/refunds/calculate", {
        method: "POST",
        json: { studentId, withdrawalDate },
      }),
  });

  const create = useMutation({
    mutationFn: () =>
      api("/api/refunds", { method: "POST", json: { studentId, withdrawalDate } }),
  });

  const c = calc.data?.calculation;

  return (
    <div>
      <PageHeader
        title="Pro-rata refund calculator"
        subtitle="Policy-driven illustrative formula — not the client's approved written policy"
      />
      <Card className="max-w-xl space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Student</span>
          <select
            className="w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
          >
            {(students.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.studentCode} — {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Withdrawal date</span>
          <Input
            type="date"
            value={withdrawalDate}
            onChange={(e) => setWithdrawalDate(e.target.value)}
          />
        </label>
        <div className="flex gap-2">
          <Button disabled={calc.isPending || !studentId} onClick={() => calc.mutate()}>
            Calculate
          </Button>
          <Button
            variant="secondary"
            disabled={!calc.data?.calculation.ok || create.isPending}
            onClick={() => create.mutate()}
          >
            Submit for review
          </Button>
        </div>
        {calc.isError ? <ErrorState message={(calc.error as Error).message} /> : null}
        {create.isSuccess ? <p className="text-sm text-success">Refund request created for review.</p> : null}
      </Card>

      {calc.data && c ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="text-sm font-semibold">{calc.data.student.name}</h2>
            <p className="text-sm text-muted">{calc.data.student.studentCode}</p>
            <p className="mt-3 text-xs text-muted">
              Course {calc.data.student.courseStartDate.slice(0, 10)} →{" "}
              {calc.data.student.courseEndDate.slice(0, 10)}
            </p>
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-warning">
              <p className="font-medium">{calc.data.policy.name}</p>
              <p className="mt-1">{calc.data.policy.disclaimer}</p>
              <p className="mt-2 text-xs">{calc.data.policy.formulaDescription}</p>
            </div>
          </Card>
          <Card className="space-y-2 text-sm">
            <Row label="Eligible net fee" value={formatInr(c.eligibleNetFee)} />
            <Row label="Total paid" value={formatInr(c.totalPaid)} />
            <Row label="Previously refunded" value={formatInr(c.previouslyRefunded)} />
            <Row label="Total days" value={String(c.totalDays)} />
            <Row label="Completed days" value={String(c.completedDays)} />
            <Row label="Remaining days" value={String(c.remainingDays)} />
            <Row label="Raw pro-rata" value={formatInr(c.rawProRata)} />
            <Row label="Proposed refund" value={formatInr(c.calculatedRefund)} strong />
            <Row
              label="10-day processing deadline"
              value={c.processingDeadline ? c.processingDeadline.slice(0, 10) : "—"}
            />
            <Row label="Edge case" value={c.edgeCase} />
            <p className="pt-2 text-xs text-muted">
              The deadline is a visible processing obligation. The app does not guarantee legal compliance.
            </p>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between border-b border-line py-1.5">
      <span className="text-muted">{label}</span>
      <span className={strong ? "font-display text-lg font-semibold text-navy-900" : "font-medium"}>
        {value}
      </span>
    </div>
  );
}
