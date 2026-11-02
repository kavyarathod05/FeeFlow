import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearAuth, getStoredUser } from "../lib/api";
import { clsx } from "clsx";

const links = [
  { to: "/accounts", end: true, label: "Dashboard" },
  { to: "/accounts/students", label: "Fee ledgers" },
  { to: "/accounts/reminders", label: "Reminders" },
  { to: "/accounts/refunds", label: "Refunds" },
  { to: "/accounts/risk", label: "Risk tasks" },
  { to: "/accounts/reconciliation", label: "Reconciliation" },
];

export function AccountsLayout() {
  const user = getStoredUser();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-line bg-navy-900 text-white lg:min-h-screen lg:border-b-0 lg:border-r lg:border-navy-800">
        <div className="px-5 py-5">
          <p className="text-lg font-semibold tracking-tight">FeeFlow</p>
          <p className="mt-1 text-xs text-navy-100/80">Accounts workspace</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                clsx(
                  "whitespace-nowrap rounded-md px-3 py-2 text-sm",
                  isActive ? "bg-white/15 font-medium" : "text-navy-100 hover:bg-white/10",
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden border-t border-white/10 px-5 py-4 text-xs text-navy-100 lg:block">
          <p>{user?.name}</p>
          <button
            className="mt-2 underline"
            type="button"
            onClick={() => {
              clearAuth();
              navigate("/login/accounts");
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
