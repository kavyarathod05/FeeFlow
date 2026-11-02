import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, formatInr } from "../lib/api";
import { Card, ErrorState, LoadingState, PageHeader } from "../components/ui";

type Summary = {
  totalBilled: number;
  totalCollected: number;
  outstanding: number;
  overdueAmount: number;
  collectionPct: number;
  overdueStudentCount: number;
  atRiskCount: number;
  recentPayments: Array<{ id: string; amount: number; paidAt: string; gatewayRef: string }>;
  collectionTrend: Array<{ month: string; amount: number }>;
};

export function DashboardPage() {
  const [params] = useSearchParams();
  const qs = params.toString() ? `?${params.toString()}` : "";
  const summary = useQuery({
    queryKey: ["dashboard-summary", qs],
    queryFn: () => api<Summary>(`/api/dashboard/summary${qs}`),
  });
  const ageing = useQuery({
    queryKey: ["dashboard-ageing", qs],
    queryFn: () => api<Record<string, number>>(`/api/dashboard/ageing${qs}`),
  });
  const centres = useQuery({
    queryKey: ["dashboard-centres"],
    queryFn: () =>
      api<Array<{ centreId: string; name: string; outstanding: number; overdue: number }>>(
        "/api/dashboard/centre-wise",
      ),
  });
  const batches = useQuery({
    queryKey: ["dashboard-batches"],
    queryFn: () =>
      api<Array<{ batchId: string; name: string; centre: string; outstanding: number; overdue: number }>>(
        "/api/dashboard/batch-wise",
      ),
  });

  if (summary.isLoading) return <LoadingState />;
  if (summary.isError || !summary.data)
    return <ErrorState message={(summary.error as Error)?.message ?? "Failed"} onRetry={() => summary.refetch()} />;

  const s = summary.data;
  const metrics = [
    { label: "Billed", value: formatInr(s.totalBilled), to: "/accounts/students" },
    { label: "Collected", value: formatInr(s.totalCollected), to: "/accounts/reconciliation" },
    { label: "Outstanding", value: formatInr(s.outstanding), to: "/accounts/students" },
    { label: "Overdue", value: formatInr(s.overdueAmount), to: "/accounts/students?status=OVERDUE" },
    { label: "Collection %", value: `${s.collectionPct}%`, to: "/accounts/students" },
    { label: "Overdue students", value: String(s.overdueStudentCount), to: "/accounts/students" },
    { label: "At-risk", value: String(s.atRiskCount), to: "/accounts/risk" },
  ];

  const ageingData = ageing.data
    ? Object.entries(ageing.data).map(([bucket, amount]) => ({ bucket, amount }))
    : [];

  return (
    <div>
      <PageHeader
        title="Dues dashboard"
        subtitle="Live aggregates across centres and batches · click a metric to drill into ledgers"
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => (
          <Link key={m.label} to={m.to}>
            <Card className="hover:border-navy-700">
              <p className="text-xs uppercase tracking-wide text-muted">{m.label}</p>
              <p className="mt-2 font-display text-2xl text-navy-900">{m.value}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-navy-900">Dues ageing</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ageingData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => formatInr(Number(v))} />
                <Bar dataKey="amount" fill="#2f4b8a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-navy-900">Collection trend</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={s.collectionTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => formatInr(Number(v))} />
                <Line type="monotone" dataKey="amount" stroke="#1b2a4a" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Centre-wise dues</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="py-2">Centre</th>
                  <th>Outstanding</th>
                  <th>Overdue</th>
                </tr>
              </thead>
              <tbody>
                {(centres.data ?? []).map((c) => (
                  <tr key={c.centreId} className="border-t border-line">
                    <td className="py-2">
                      <Link className="text-navy-700 underline" to={`/accounts/students?centreId=${c.centreId}`}>
                        {c.name}
                      </Link>
                    </td>
                    <td>{formatInr(c.outstanding)}</td>
                    <td>{formatInr(c.overdue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Batch-wise dues</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="py-2">Batch</th>
                  <th>Outstanding</th>
                  <th>Overdue</th>
                </tr>
              </thead>
              <tbody>
                {(batches.data ?? []).map((b) => (
                  <tr key={b.batchId} className="border-t border-line">
                    <td className="py-2">
                      <Link className="text-navy-700 underline" to={`/accounts/students?batchId=${b.batchId}`}>
                        {b.name}
                      </Link>
                      <div className="text-xs text-muted">{b.centre}</div>
                    </td>
                    <td>{formatInr(b.outstanding)}</td>
                    <td>{formatInr(b.overdue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="mb-3 text-sm font-semibold">Recent payments</h2>
        {s.recentPayments.length === 0 ? (
          <p className="text-sm text-muted">No recent successful payments</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {s.recentPayments.map((p) => (
              <li key={p.id} className="flex justify-between py-2">
                <span>{p.gatewayRef}</span>
                <span className="font-medium">{formatInr(p.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
