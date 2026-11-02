import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, clearAuth, formatInr, getStoredUser } from "../lib/api";
import { t, type Lang } from "../lib/i18n";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  LoadingState,
  statusTone,
} from "../components/ui";

type Portal = {
  student: { id: string; studentCode: string; name: string; batch: string; centre: string };
  outstanding: number;
  nextDue: {
    id: string;
    dueDate: string;
    remaining: number;
    status: string;
    daysOverdue: number;
  } | null;
  instalments: Array<{
    id: string;
    sequence: number;
    dueDate: string;
    amount: number;
    amountPaid: number;
    remaining: number;
    status: string;
    daysOverdue: number;
  }>;
  receipts: Array<{ receiptNo: string; totalAmount: number; issuedAt: string; cgst: number; sgst: number }>;
  reminders: Array<{ stage: string; deliveryStatus: string; messagePreview: string; scheduledFor: string }>;
  attendanceSummary: { records: number; presentPct: number | null };
  testScores: Array<{ testName: string; pct: number; heldOn: string }>;
  consent: { status: string; version: string } | null;
};

export function ParentPortalPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [lang, setLang] = useState<Lang>((localStorage.getItem("feeflow_lang") as Lang) || "HI");
  const [studentId, setStudentId] = useState<string>("");

  const students = useQuery({
    queryKey: ["parent-students"],
    queryFn: () => api<Array<{ id: string; name: string; studentCode: string }>>("/api/students"),
  });

  useEffect(() => {
    if (students.data?.length && !studentId) setStudentId(students.data[0].id);
  }, [students.data, studentId]);

  useEffect(() => {
    localStorage.setItem("feeflow_lang", lang);
  }, [lang]);

  const portal = useQuery({
    queryKey: ["parent-portal", studentId],
    queryFn: () => api<Portal>(`/api/students/${studentId}/parent-portal`),
    enabled: !!studentId,
  });

  const pay = useMutation({
    mutationFn: async (instalmentId: string) => {
      const link = await api<{ token: string; url: string }>(
        `/api/instalments/${instalmentId}/payment-link`,
        { method: "POST" },
      );
      return link;
    },
    onSuccess: (link) => navigate(`/pay/${link.token}`),
  });

  const consent = useMutation({
    mutationFn: (given: boolean) =>
      api("/api/consent", { method: "POST", json: { studentId, given } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["parent-portal", studentId] }),
  });

  if (students.isLoading || portal.isLoading) return <LoadingState label={t(lang, "loading")} />;
  if (portal.isError)
    return <ErrorState message={(portal.error as Error).message} onRetry={() => portal.refetch()} />;
  if (!portal.data) return null;

  const d = portal.data;
  const overdue = d.instalments.filter((i) => i.status === "OVERDUE" || i.daysOverdue > 0);
  const upcoming = d.instalments.filter((i) => i.remaining > 0 && i.daysOverdue === 0);
  const paid = d.instalments.filter((i) => i.remaining === 0);

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-[linear-gradient(180deg,#eef2f8_0%,#f7f9fc_28%,#f7f9fc_100%)] px-4 pb-10 pt-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-navy-700">{t(lang, "appName")}</p>
          <p className="text-xs text-muted">{getStoredUser()?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-md border border-line bg-white px-2 py-1 text-sm"
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
            aria-label={t(lang, "language")}
          >
            <option value="HI">हिन्दी</option>
            <option value="EN">English</option>
          </select>
          <button
            className="text-sm text-navy-700 underline"
            type="button"
            onClick={() => {
              clearAuth();
              navigate("/login/parent");
            }}
          >
            {t(lang, "logout")}
          </button>
        </div>
      </div>

      {students.data && students.data.length > 1 ? (
        <select
          className="mb-4 w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
        >
          {students.data.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.studentCode})
            </option>
          ))}
        </select>
      ) : null}

      {/* 5-second dues view */}
      <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
        <p className="text-sm text-muted">
          {d.student.name} · {d.student.studentCode}
        </p>
        <p className="mt-4 text-xs uppercase tracking-wide text-muted">{t(lang, "outstanding")}</p>
        <p className="font-display text-4xl font-semibold text-navy-900">
          {formatInr(d.outstanding)}
        </p>
        <p className="mt-3 text-sm text-muted">
          {t(lang, "nextDue")}:{" "}
          <span className="font-medium text-ink">
            {d.nextDue ? d.nextDue.dueDate.slice(0, 10) : "—"}
          </span>
          {d.nextDue?.daysOverdue ? (
            <span className="ml-2 text-danger">{d.nextDue.daysOverdue}d overdue</span>
          ) : null}
        </p>
        {d.nextDue ? (
          <Button
            className="mt-5 w-full py-3 text-base"
            disabled={pay.isPending}
            onClick={() => pay.mutate(d.nextDue!.id)}
          >
            {t(lang, "payNow")} · {formatInr(d.nextDue.remaining)}
          </Button>
        ) : (
          <p className="mt-5 text-sm text-success">{t(lang, "noDues")}</p>
        )}
      </section>

      <Section title={t(lang, "overdue")}>
        {overdue.length === 0 ? (
          <p className="text-sm text-muted">—</p>
        ) : (
          overdue.map((i) => <InstRow key={i.id} i={i} onPay={() => pay.mutate(i.id)} />)
        )}
      </Section>
      <Section title={t(lang, "upcoming")}>
        {upcoming.map((i) => (
          <InstRow key={i.id} i={i} onPay={() => pay.mutate(i.id)} />
        ))}
      </Section>
      <Section title={t(lang, "paid")}>
        {paid.map((i) => (
          <InstRow key={i.id} i={i} />
        ))}
      </Section>

      <Section title={t(lang, "receipts")}>
        {d.receipts.length === 0 ? (
          <p className="text-sm text-muted">—</p>
        ) : (
          d.receipts.map((r) => (
            <div key={r.receiptNo} className="flex justify-between border-b border-line py-2 text-sm">
              <div>
                <p className="font-medium">{r.receiptNo}</p>
                <p className="text-xs text-muted">
                  GST CGST {formatInr(r.cgst)} + SGST {formatInr(r.sgst)}
                </p>
              </div>
              <p>{formatInr(r.totalAmount)}</p>
            </div>
          ))
        )}
      </Section>

      <Section title={t(lang, "reminders")}>
        {d.reminders.slice(0, 6).map((r, idx) => (
          <div key={idx} className="border-b border-line py-2 text-sm">
            <Badge tone={statusTone(r.deliveryStatus)}>{r.deliveryStatus}</Badge>
            <p className="mt-1 text-muted">{r.messagePreview}</p>
          </div>
        ))}
      </Section>

      <Section title={t(lang, "attendance")}>
        <p className="text-sm">
          {d.attendanceSummary.presentPct != null
            ? `${d.attendanceSummary.presentPct}% · ${d.attendanceSummary.records} sessions`
            : "—"}
        </p>
      </Section>

      <Section title={t(lang, "tests")}>
        {d.testScores.map((ts) => (
          <div key={ts.testName + ts.heldOn} className="flex justify-between text-sm">
            <span>{ts.testName}</span>
            <span>{ts.pct}%</span>
          </div>
        ))}
      </Section>

      <Section title={t(lang, "consent")}>
        <p className="mb-2 text-xs text-muted">
          Demo consent only — production DPDP verification needs legal review.
        </p>
        <p className="text-sm">
          Status: <Badge tone={statusTone(d.consent?.status ?? "NOT_GIVEN")}>{d.consent?.status ?? "NOT_GIVEN"}</Badge>
        </p>
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" onClick={() => consent.mutate(true)}>
            Give consent
          </Button>
          <Button variant="ghost" onClick={() => consent.mutate(false)}>
            Withdraw
          </Button>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="mt-4">
      <h2 className="mb-2 text-sm font-semibold text-navy-900">{title}</h2>
      {children}
    </Card>
  );
}

function InstRow({
  i,
  onPay,
}: {
  i: {
    sequence: number;
    dueDate: string;
    remaining: number;
    amount: number;
    status: string;
    daysOverdue: number;
  };
  onPay?: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-line py-2 text-sm">
      <div>
        <p className="font-medium">
          #{i.sequence} · {i.dueDate.slice(0, 10)}
        </p>
        <div className="mt-1 flex gap-2">
          <Badge tone={statusTone(i.status)}>{i.status}</Badge>
          {i.daysOverdue > 0 ? <span className="text-xs text-danger">{i.daysOverdue}d</span> : null}
        </div>
      </div>
      <div className="text-right">
        <p>{formatInr(i.remaining > 0 ? i.remaining : i.amount)}</p>
        {onPay && i.remaining > 0 ? (
          <button className="mt-1 text-xs text-navy-700 underline" type="button" onClick={onPay}>
            Pay
          </button>
        ) : null}
      </div>
    </div>
  );
}
