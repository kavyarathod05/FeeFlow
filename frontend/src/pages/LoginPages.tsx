import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setAuth } from "../lib/api";
import { Button, Card, Input } from "../components/ui";

export function AccountsLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("accounts@feeflow.demo");
  const [password, setPassword] = useState("Accounts@123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await api<{ token: string; user: unknown }>("/api/auth/accounts/login", {
        method: "POST",
        json: { email, password },
      });
      setAuth(data.token, data.user);
      navigate("/accounts");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <p className="mb-2 text-sm font-semibold text-navy-700">FeeFlow</p>
      <h1 className="mb-6 text-3xl font-semibold text-navy-900">Accounts sign-in</h1>
      <Card>
        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Email</span>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Password</span>
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
            />
          </label>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button className="w-full" disabled={loading} type="submit">
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-sm text-muted">
        Parent? <Link className="text-navy-700 underline" to="/login/parent">OTP login</Link>
      </p>
    </div>
  );
}

export function ParentLoginPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("9876500587");
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [hint, setHint] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await api<{ demoOtp?: string; message: string }>("/api/auth/parent/request-otp", {
        method: "POST",
        json: { phone },
      });
      setOtpSent(true);
      if (data.demoOtp) {
        setHint(`Demo OTP: ${data.demoOtp}`);
        setCode(data.demoOtp);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await api<{ token: string; user: unknown }>("/api/auth/parent/verify-otp", {
        method: "POST",
        json: { phone, code },
      });
      setAuth(data.token, data.user);
      navigate("/parent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <p className="mb-2 text-sm font-semibold text-navy-700">FeeFlow</p>
      <h1 className="mb-2 text-3xl font-semibold text-navy-900">Parent sign-in</h1>
      <p className="mb-6 text-sm text-muted">OTP login · mock delivery in demo mode</p>
      <Card>
        {!otpSent ? (
          <form className="space-y-4" onSubmit={requestOtp}>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Mobile number</span>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </label>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button className="w-full" disabled={loading} type="submit">
              Send OTP
            </Button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={verifyOtp}>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">OTP</span>
              <Input value={code} onChange={(e) => setCode(e.target.value)} required />
            </label>
            {hint ? <p className="text-sm text-navy-700">{hint}</p> : null}
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button className="w-full" disabled={loading} type="submit">
              Verify & continue
            </Button>
          </form>
        )}
      </Card>
      <p className="mt-4 text-sm text-muted">
        Demo: 9876500587 (Ishita) · OTP 246810 ·{" "}
        <Link className="text-navy-700 underline" to="/login/accounts">
          Accounts login
        </Link>
      </p>
    </div>
  );
}
