import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { Card, ErrorState, Input, LoadingState, PageHeader } from "../components/ui";
import { useState } from "react";

type Student = {
  id: string;
  studentCode: string;
  name: string;
  centre: { name: string };
  batch: { name: string };
};

export function StudentsPage() {
  const [params] = useSearchParams();
  const [q, setQ] = useState("");
  const centreId = params.get("centreId") ?? "";
  const batchId = params.get("batchId") ?? "";

  const query = useQuery({
    queryKey: ["students", q, centreId, batchId],
    queryFn: () => {
      const sp = new URLSearchParams();
      if (q) sp.set("q", q);
      if (centreId) sp.set("centreId", centreId);
      if (batchId) sp.set("batchId", batchId);
      return api<Student[]>(`/api/students?${sp.toString()}`);
    },
  });

  return (
    <div>
      <PageHeader title="Student fee ledgers" subtitle="Search by name or student ID" />
      <div className="mb-4 max-w-md">
        <Input
          placeholder="Search students…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {query.isLoading ? <LoadingState /> : null}
      {query.isError ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : null}
      {query.data ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-muted">
              <tr>
                <th className="px-4 py-3">Student ID</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Centre</th>
                <th className="px-4 py-3">Batch</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((s) => (
                <tr key={s.id} className="border-t border-line hover:bg-navy-100/40">
                  <td className="px-4 py-3">
                    <Link className="font-medium text-navy-700 underline" to={`/accounts/students/${s.id}`}>
                      {s.studentCode}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{s.name}</td>
                  <td className="px-4 py-3">{s.centre.name}</td>
                  <td className="px-4 py-3">{s.batch.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  );
}
