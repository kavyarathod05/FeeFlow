import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, formatInr } from "../lib/api";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  LoadingState,
  PageHeader,
  statusTone,
} from "../components/ui";

type Ledger = {
  student: {
    id: string;
    studentCode: string;
    name: string;
    centre: { name: string };
    batch: { name: string };
    courseStartDate: string;
    courseEndDate: string;
  };
  feePlan: {
    name: string;
    baseFee: number;
    netFee: number;
    discounts: Array<{ label: string; amount: number }>;
  };
  summary: {
    totalBilled: number;
    totalPaid: number;
    outstanding: number;
    overdueAmount: number;
  };
  instalments: Array<{
    id: string;
    sequence: number;
    dueDate: string;
    amount: number;
    amountPaid: number;
    remaining: number;
    status: string;
    daysOverdue: number;
    briefSnapshotNote?: string | null;
    receipts: Array<{ receiptNo: string; totalAmount: number; issuedAt: string }>;
    reminders: Array<{ stage: string; deliveryStatus: string; scheduledFor: string; messagePreview: string }>;
  }>;
  risk?: { category: string; score: number | null; explanation: string } | null;
};

export function LedgerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["ledger", id],
    queryFn: () => api<Ledger>(`/api/students/${id}/ledger`),
    enabled: !!id,
  });

  const payLink = useMutation({
    mutationFn: (instalmentId: string) =>
      api<{ url: string }>(`/api/instalments/${instalmentId}/payment-link`, { method: "POST" }),
    onSuccess: (data) => {
      window.open(data.url, "_blank");
      qc.invalidateQueries({ queryKey: ["ledger", id] });
    },
  });

  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data)
    return <ErrorState message={(query.error as Error)?.message ?? "Failed"} />;

  const { student, feePlan, summary, instalments, risk } = query.data;

  return (
    <div>
      <PageHeader
        title={student.name}
        subtitle={`${student.studentCode} · ${student.centre.name} · ${student.batch.name}`}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate(`/accounts/refunds?studentId=${student.id}`)}>
              Refund calculator
            </Button>
            <Link to="/accounts/students">
              <Button variant="ghost">Back</Button>
            </Link>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <p className="text-xs text-muted">Plan</p>
          <p className="mt-1 font-medium">{feePlan.name}</p>
          <p className="text-sm text-muted">Base {formatInr(feePlan.baseFee)}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted">Net fee</p>
          <p className="mt-1 font-display text-xl">{formatInr(feePlan.netFee)}</p>
          {feePlan.discounts.map((d) => (
            <p key={d.label} className="text-xs text-success">
              − {d.label} {formatInr(d.amount)}
            </p>
          ))}
        </Card>
        <Card>
          <p className="text-xs text-muted">Outstanding</p>
          <p className="mt-1 font-display text-xl">{formatInr(summary.outstanding)}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted">Overdue</p>
          <p className="mt-1 font-display text-xl text-danger">{formatInr(summary.overdueAmount)}</p>
        </Card>
      </div>

      {risk ? (
        <Card className="mt-4">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">Dropout-risk (decision support)</p>
            <Badge tone={statusTone(risk.category)}>{risk.category}</Badge>
            {risk.score != null ? <span className="text-sm text-muted">Score {risk.score}</span> : null}
          </div>
          <p className="mt-2 text-sm text-muted">{risk.explanation}</p>
        </Card>
      ) : null}

      <Card className="mt-6 overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-muted">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Due</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Paid</th>
              <th className="px-4 py-3">Remaining</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Overdue</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {instalments.map((inst) => (
              <tr key={inst.id} className="border-t border-line align-top">
                <td className="px-4 py-3">{inst.sequence}</td>
                <td className="px-4 py-3">{inst.dueDate.slice(0, 10)}</td>
                <td className="px-4 py-3">{formatInr(inst.amount)}</td>
                <td className="px-4 py-3">{formatInr(inst.amountPaid)}</td>
                <td className="px-4 py-3">{formatInr(inst.remaining)}</td>
                <td className="px-4 py-3">
                  <Badge tone={statusTone(inst.status)}>{inst.status}</Badge>
                  {inst.briefSnapshotNote ? (
                    <p className="mt-1 max-w-xs text-xs text-muted">{inst.briefSnapshotNote}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3">{inst.daysOverdue || "—"}</td>
                <td className="px-4 py-3">
                  {inst.remaining > 0 ? (
                    <Button
                      variant="secondary"
                      disabled={payLink.isPending}
                      onClick={() => payLink.mutate(inst.id)}
                    >
                      Payment link
                    </Button>
                  ) : (
                    <span className="text-xs text-muted">Settled</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-2 text-sm font-semibold">Receipts</h3>
          <ul className="space-y-2 text-sm">
            {instalments.flatMap((i) =>
              i.receipts.map((r) => (
                <li key={r.receiptNo} className="flex justify-between border-b border-line py-2">
                  <span>{r.receiptNo}</span>
                  <span>{formatInr(r.totalAmount)}</span>
                </li>
              )),
            )}
            {instalments.every((i) => i.receipts.length === 0) ? (
              <li className="text-muted">No receipts yet</li>
            ) : null}
          </ul>
        </Card>
        <Card>
          <h3 className="mb-2 text-sm font-semibold">Reminder history</h3>
          <ul className="space-y-2 text-sm">
            {instalments.flatMap((i) =>
              i.reminders.map((r, idx) => (
                <li key={`${i.id}-${idx}`} className="border-b border-line py-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={statusTone(r.deliveryStatus)}>{r.deliveryStatus}</Badge>
                    <span className="text-xs text-muted">{r.stage}</span>
                  </div>
                  <p className="mt-1 text-muted">{r.messagePreview}</p>
                </li>
              )),
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}
