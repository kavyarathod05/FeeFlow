import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, formatInr } from "../lib/api";
import { Badge, Button, Card, ErrorState, LoadingState, PageHeader, statusTone } from "../components/ui";

type Reminder = {
  id: string;
  student: string;
  studentCode: string;
  instalmentSequence: number;
  dueDate: string;
  outstandingAmount: number;
  stage: string;
  language: string;
  scheduledFor: string;
  deliveryStatus: string;
  messagePreview: string;
};

export function RemindersPage() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["reminders"],
    queryFn: () => api<Reminder[]>("/api/reminders"),
  });
  const dispatch = useMutation({
    mutationFn: () => api("/api/reminders/dispatch", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reminders"] }),
  });

  return (
    <div>
      <PageHeader
        title="Reminder centre"
        subtitle="Mock SMS/WhatsApp delivery · cancelled automatically on successful payment"
        actions={
          <Button disabled={dispatch.isPending} onClick={() => dispatch.mutate()}>
            Dispatch due (mock)
          </Button>
        }
      />
      {query.isLoading ? <LoadingState /> : null}
      {query.isError ? <ErrorState message={(query.error as Error).message} /> : null}
      {query.data ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-muted">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Lang</th>
                <th className="px-4 py-3">Scheduled</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Preview</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((r) => (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.student}</div>
                    <div className="text-xs text-muted">
                      {r.studentCode} · Inst #{r.instalmentSequence}
                    </div>
                  </td>
                  <td className="px-4 py-3">{r.stage}</td>
                  <td className="px-4 py-3">{formatInr(r.outstandingAmount)}</td>
                  <td className="px-4 py-3">{r.language}</td>
                  <td className="px-4 py-3">{new Date(r.scheduledFor).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(r.deliveryStatus)}>{r.deliveryStatus}</Badge>
                  </td>
                  <td className="max-w-xs px-4 py-3 text-muted">{r.messagePreview}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  );
}
