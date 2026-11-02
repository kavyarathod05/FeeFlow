import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { Badge, Button, Card, ErrorState, Input, LoadingState, PageHeader, statusTone } from "../components/ui";

type Task = {
  id: string;
  title: string;
  status: string;
  notes: string | null;
  falsePositiveNote: string | null;
  student: { name: string; studentCode: string; centre: { name: string }; batch: { name: string } };
  riskAssessment: {
    id: string;
    category: string;
    score: number | null;
    explanation: string;
    factors: Array<{ label: string; detail: string; contribution: number }>;
  };
};

export function RiskPage() {
  const qc = useQueryClient();
  const [note, setNote] = useState("Counsellor verified — false positive");
  const tasks = useQuery({
    queryKey: ["risk-tasks"],
    queryFn: () => api<Task[]>("/api/risk/tasks"),
  });

  const fp = useMutation({
    mutationFn: (assessmentId: string) =>
      api(`/api/risk/assessments/${assessmentId}/false-positive`, {
        method: "POST",
        json: { note },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["risk-tasks"] }),
  });

  return (
    <div>
      <PageHeader
        title="Dropout-risk / counsellor tasks"
        subtitle="Explainable heuristic only · never changes fees or messages parents"
      />
      <Card className="mb-4 max-w-xl">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">False-positive note</span>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </Card>
      {tasks.isLoading ? <LoadingState /> : null}
      {tasks.isError ? <ErrorState message={(tasks.error as Error).message} /> : null}
      <div className="grid gap-4">
        {(tasks.data ?? []).map((task) => (
          <Card key={task.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-navy-900">
                  {task.student.name} · {task.student.studentCode}
                </p>
                <p className="text-xs text-muted">
                  {task.student.centre.name} · {task.student.batch.name}
                </p>
                <div className="mt-2 flex gap-2">
                  <Badge tone={statusTone(task.riskAssessment.category)}>
                    {task.riskAssessment.category}
                  </Badge>
                  <Badge tone={statusTone(task.status)}>{task.status}</Badge>
                  {task.riskAssessment.score != null ? (
                    <span className="text-sm text-muted">Score {task.riskAssessment.score}</span>
                  ) : (
                    <span className="text-sm text-muted">Insufficient data</span>
                  )}
                </div>
              </div>
              {task.status !== "FALSE_POSITIVE" ? (
                <Button
                  variant="secondary"
                  disabled={fp.isPending}
                  onClick={() => fp.mutate(task.riskAssessment.id)}
                >
                  Mark false positive
                </Button>
              ) : null}
            </div>
            <p className="mt-3 text-sm text-muted">{task.riskAssessment.explanation}</p>
            <ul className="mt-3 space-y-1 text-sm">
              {(task.riskAssessment.factors ?? []).map((f) => (
                <li key={f.label}>
                  <span className="font-medium">{f.label}</span>: {f.detail} (+{f.contribution})
                </li>
              ))}
            </ul>
            {task.falsePositiveNote ? (
              <p className="mt-3 text-sm text-success">Feedback: {task.falsePositiveNote}</p>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
