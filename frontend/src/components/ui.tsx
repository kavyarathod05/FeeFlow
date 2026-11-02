import type { ButtonHTMLAttributes, InputHTMLAttributes, PropsWithChildren } from "react";
import { clsx } from "clsx";

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center rounded-md px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50",
        variant === "primary" && "bg-navy-900 text-white hover:bg-navy-800",
        variant === "secondary" && "border border-line bg-white text-ink hover:bg-navy-100",
        variant === "ghost" && "text-navy-700 hover:bg-navy-100",
        variant === "danger" && "bg-danger text-white hover:opacity-90",
        className,
      )}
      {...props}
    />
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm outline-none ring-navy-700 focus:ring-2"
      {...props}
    />
  );
}

export function Badge({
  children,
  tone = "neutral",
}: PropsWithChildren<{ tone?: "neutral" | "success" | "warning" | "danger" | "info" }>) {
  return (
    <span
      className={clsx(
        "inline-flex rounded px-2 py-0.5 text-xs font-medium",
        tone === "neutral" && "bg-slate-100 text-slate-700",
        tone === "success" && "bg-emerald-50 text-success",
        tone === "warning" && "bg-amber-50 text-warning",
        tone === "danger" && "bg-red-50 text-danger",
        tone === "info" && "bg-blue-50 text-info",
      )}
    >
      {children}
    </span>
  );
}

export function Card({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <div className={clsx("rounded-lg border border-line bg-white p-4", className)}>{children}</div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-white px-6 py-12 text-center">
      <p className="font-medium text-ink">{title}</p>
      {body ? <p className="mt-1 text-sm text-muted">{body}</p> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">
      <p>{message}</p>
      {onRetry ? (
        <button className="mt-2 underline" onClick={onRetry} type="button">
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return <div className="animate-pulse text-sm text-muted">{label}</div>;
}

export function statusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "PAID" || status === "SUCCESS" || status === "SENT" || status === "GIVEN") return "success";
  if (status === "PARTIALLY_PAID" || status === "DUE" || status === "PENDING" || status === "SCHEDULED")
    return "warning";
  if (status === "OVERDUE" || status === "FAILED" || status === "UNMATCHED" || status === "HIGH") return "danger";
  if (status === "UPCOMING" || status === "MEDIUM") return "info";
  return "neutral";
}
