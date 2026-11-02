import { useMutation } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { api, formatInr } from "../lib/api";
import { Badge, Button, Card, ErrorState, statusTone } from "../components/ui";

export function PayPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState<string>("");
  const [receipt, setReceipt] = useState<string>("");

  // We need instalment context — checkout creates session from token
  const checkout = useMutation({
    mutationFn: () =>
      api<{ paymentId: string; amount: number; gatewayRef: string }>("/api/payments/mock-checkout", {
        method: "POST",
        json: { paymentLinkToken: token, idempotencyKey: `checkout-${token}` },
      }),
  });

  const complete = useMutation({
    mutationFn: (payload: {
      paymentId: string;
      result: "SUCCESS" | "FAILED" | "CANCELLED" | "TIMEOUT" | "UNMATCHED";
    }) => api<{ outcome: string; receiptNo?: string }>("/api/payments/mock-complete", {
      method: "POST",
      json: payload,
    }),
    onSuccess: (data) => {
      setResult(data.outcome);
      if (data.receiptNo) setReceipt(data.receiptNo);
    },
  });

  if (!token) return <ErrorState message="Missing payment link" />;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <p className="mb-2 text-sm font-semibold text-navy-700">FeeFlow · Test mode</p>
      <h1 className="mb-4 text-2xl font-semibold text-navy-900">Instalment payment</h1>
      <Card className="space-y-4">
        <p className="text-sm text-muted">
          Mock gateway. Backend validates webhook signature and allocates payment exactly once.
          Frontend success alone never marks an instalment paid.
        </p>

        {!checkout.data ? (
          <Button
            className="w-full"
            disabled={checkout.isPending}
            onClick={() => checkout.mutate()}
          >
            {checkout.isPending ? "Creating session…" : "Start payment session"}
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md bg-surface p-3 text-sm">
              <p>Amount: <strong>{formatInr(checkout.data.amount)}</strong></p>
              <p className="text-muted">Ref: {checkout.data.gatewayRef}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                disabled={complete.isPending}
                onClick={() =>
                  complete.mutate({ paymentId: checkout.data.paymentId, result: "SUCCESS" })
                }
              >
                Pay successfully
              </Button>
              <Button
                variant="secondary"
                disabled={complete.isPending}
                onClick={() =>
                  complete.mutate({ paymentId: checkout.data.paymentId, result: "FAILED" })
                }
              >
                Fail
              </Button>
              <Button
                variant="ghost"
                disabled={complete.isPending}
                onClick={() =>
                  complete.mutate({ paymentId: checkout.data.paymentId, result: "CANCELLED" })
                }
              >
                Cancel
              </Button>
              <Button
                variant="ghost"
                disabled={complete.isPending}
                onClick={() =>
                  complete.mutate({ paymentId: checkout.data.paymentId, result: "UNMATCHED" })
                }
              >
                Unmatched
              </Button>
            </div>
            <Button
              variant="secondary"
              className="w-full"
              disabled={complete.isPending}
              onClick={() =>
                complete.mutate({ paymentId: checkout.data.paymentId, result: "SUCCESS" })
              }
            >
              Replay callback (idempotency test)
            </Button>
          </div>
        )}

        {checkout.isError ? <ErrorState message={(checkout.error as Error).message} /> : null}
        {complete.isError ? <ErrorState message={(complete.error as Error).message} /> : null}

        {result ? (
          <div className="rounded-md border border-line bg-surface p-3 text-sm">
            <Badge tone={statusTone(result.includes("paid") || result.includes("already") ? "SUCCESS" : "FAILED")}>
              {result}
            </Badge>
            {receipt ? <p className="mt-2">Receipt: {receipt}</p> : null}
            <Button className="mt-3 w-full" variant="secondary" onClick={() => navigate("/parent")}>
              Back to parent portal
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
