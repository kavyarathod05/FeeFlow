import { Navigate, Route, Routes } from "react-router-dom";
import { AccountsLayout } from "./layouts/AccountsLayout";
import { AccountsLoginPage, ParentLoginPage } from "./pages/LoginPages";
import { DashboardPage } from "./pages/DashboardPage";
import { StudentsPage } from "./pages/StudentsPage";
import { LedgerPage } from "./pages/LedgerPage";
import { ParentPortalPage } from "./pages/ParentPortalPage";
import { PayPage } from "./pages/PayPage";
import { RemindersPage } from "./pages/RemindersPage";
import { RefundsPage } from "./pages/RefundsPage";
import { RiskPage } from "./pages/RiskPage";
import { ReconciliationPage } from "./pages/ReconciliationPage";
import { getStoredUser } from "./lib/api";

function RequireAuth({ role, children }: { role: "ACCOUNTS" | "PARENT"; children: React.ReactNode }) {
  const user = getStoredUser();
  if (!user) return <Navigate to={role === "ACCOUNTS" ? "/login/accounts" : "/login/parent"} replace />;
  if (user.role !== role) return <Navigate to={role === "ACCOUNTS" ? "/login/accounts" : "/login/parent"} replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login/parent" replace />} />
      <Route path="/login/accounts" element={<AccountsLoginPage />} />
      <Route path="/login/parent" element={<ParentLoginPage />} />
      <Route path="/pay/:token" element={<PayPage />} />

      <Route
        path="/parent"
        element={
          <RequireAuth role="PARENT">
            <ParentPortalPage />
          </RequireAuth>
        }
      />

      <Route
        path="/accounts"
        element={
          <RequireAuth role="ACCOUNTS">
            <AccountsLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="students/:id" element={<LedgerPage />} />
        <Route path="reminders" element={<RemindersPage />} />
        <Route path="refunds" element={<RefundsPage />} />
        <Route path="risk" element={<RiskPage />} />
        <Route path="reconciliation" element={<ReconciliationPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
