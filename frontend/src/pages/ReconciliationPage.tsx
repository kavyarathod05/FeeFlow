import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, formatInr } from "../lib/api";
import { Badge, Button, Card, ErrorState, Input, LoadingState, PageHeader, statusTone } from "../components/ui";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

type PaymentRow = {
  id: string;
  gatewayRef: string | null;
  amount: number;
  status: string;
  reconciliationStatus: string | null;
  unmatched: { id: string; reason: string; resolved: boolean } | null;
  allocations: Array<{ instalmentId: string; student: string; studentName: string; amount: number }>;
};

export function ReconciliationPage() {
  const qc = useQueryClient();
  const [instalmentId, setInstalmentId] = useState("");
  const [selectedUnmatched, setSelectedUnmatched] = useState("");

  const query = useQuery({
    queryKey: ["reconciliation"],
    queryFn: () => api<PaymentRow[]>("/api/reconciliation"),
  });

  const match = useMutation({
    mutationFn: () =>
      api("/api/reconciliation/match", {
        method: "POST",
        json: { unmatchedPaymentId: selectedUnmatched, instalmentId },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reconciliation"] });
      setSelectedUnmatched("");
      setInstalmentId("");
    },
  });

  function exportCsv() {
    const token = localStorage.getItem("feeflow_token");
    window.open(`${API_BASE}/api/reconciliation/export?token=${token}`, "_blank");
    // Better: fetch with auth
    fetch(`${API_BASE}/api/reconciliation/export`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.text())
      .then((csv) => {
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "feeflow-tally-export.csv";
        a.click();
      });
  }

  const unmatched = (query.data ?? []).filter((p) => p.unmatched && !p.unmatched.resolved);

  return (
    <div>
      <PageHeader
        title="Payment reconciliation"
        subtitle="Unmatched payments stay in review · never auto-allocated"
        actions={<Button variant="secondary" onClick={exportCsv}>Export Tally CSV</Button>}
      />

      {unmatched.length > 0 ? (
        <Card className="mb-6 space-y-3">
          <h2 className="text-sm font-semibold">Unmatched queue</h2>
          {unmatched.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                selectedUnmatched === p.unmatched!.id ? "border-navy-700 bg-navy-100" : "border-line"
              }`}
              onClick={() => setSelectedUnmatched(p.unmatched!.id)}
            >
              <div className="flex justify-between">
                <span>{p.gatewayRef}</span>
                <span>{formatInr(p.amount)}</span>
              </div>
              <p className="text-xs text-muted">{p.unmatched!.reason}</p>
            </button>
          ))}
          <Input
            placeholder="Instalment ID to match"
            value={instalmentId}
            onChange={(e) => setInstalmentId(e.target.value)}
          />
          <Button
            disabled={!selectedUnmatched || !instalmentId || match.isPending}
            onClick={() => match.mutate()}
          >
            Match manually
          </Button>
          {match.isError ? <ErrorState message={(match.error as Error).message} /> : null}
        </Card>
      ) : null}

      {query.isLoading ? <LoadingState /> : null}
      {query.isError ? <ErrorState message={(query.error as Error).message} /> : null}
      {query.data ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-muted">
              <tr>
                <th className="px-4 py-3">Ref</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Recon</th>
                <th className="px-4 py-3">Mapping</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="px-4 py-3">{p.gatewayRef}</td>
                  <td className="px-4 py-3">{formatInr(p.amount)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(p.reconciliationStatus ?? "PENDING")}>
                      {p.reconciliationStatus ?? "—"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {p.allocations.length
                      ? p.allocations.map((a) => `${a.student} · ${formatInr(a.amount)}`).join(", ")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
      <p className="mt-4 text-xs text-muted">
        ASSUMPTION: Tally CSV uses Receipt voucher columns for manual import mapping — not a live Tally API.
      </p>
    </div>
  );
}
