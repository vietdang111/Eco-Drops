"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { apiRequest, messageForError, postJson } from "./api-client";
import type { SessionData, UserRole } from "./ecodrops-types";
import { Arrow, CheckIcon, FieldHint } from "./site-chrome";

const DEMO_PASSWORD = "DemoPass!2026";
const DEMO_ACCOUNTS: Array<{
  role: UserRole;
  label: string;
  email: string;
  description: string;
  number: string;
}> = [
  { role: "corp_user", label: "Corporate", email: "corp@demo.ecodrops.local", description: "Register surplus and follow custody.", number: "01" },
  { role: "warehouse_op", label: "Warehouse", email: "warehouse@demo.ecodrops.local", description: "Receive, reconcile, and certify.", number: "02" },
  { role: "campus_admin", label: "Campus", email: "campus@demo.ecodrops.local", description: "Track inventory and outcomes.", number: "03" },
  { role: "admin", label: "Platform admin", email: "admin@demo.ecodrops.local", description: "Verify audit integrity and method.", number: "04" },
];

export function LoginPanel() {
  const router = useRouter();
  const [email, setEmail] = useState(DEMO_ACCOUNTS[0]?.email ?? "");
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function login(loginEmail: string, loginPassword: string, intent: string) {
    setBusy(intent);
    setError(null);
    try {
      await postJson<SessionData>("/auth/login", { email: loginEmail, password: loginPassword });
      router.push("/app");
      router.refresh();
    } catch (caught) {
      setError(messageForError(caught));
      setBusy(null);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void login(email, password, "form");
  }

  return (
    <div className="auth-panel auth-panel--wide">
      <div className="auth-panel__heading">
        <p className="eyebrow">Demo workspace</p>
        <h1>Choose a view into the loop.</h1>
        <p>Every role opens a purpose-built workspace populated with clearly labelled synthetic demo data.</p>
      </div>

      <div className="role-grid" aria-label="One-click demo accounts">
        {DEMO_ACCOUNTS.map((account) => (
          <button
            className="role-card"
            disabled={busy !== null}
            key={account.role}
            onClick={() => void login(account.email, DEMO_PASSWORD, account.role)}
            type="button"
          >
            <span className="role-card__number">{account.number}</span>
            <span className="role-card__body">
              <strong>{account.label}</strong>
              <span>{account.description}</span>
              <code>{account.email}</code>
            </span>
            <span className="role-card__arrow" aria-hidden="true">{busy === account.role ? "…" : "↗"}</span>
          </button>
        ))}
      </div>
      <p className="demo-password"><span>Shared seeded password</span><code>{DEMO_PASSWORD}</code></p>

      <div className="auth-divider"><span>or sign in normally</span></div>
      <form className="form-stack" onSubmit={onSubmit}>
        <div className="form-row form-row--two">
          <label className="field">
            <span>Email address</span>
            <input autoComplete="email" inputMode="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          </label>
          <label className="field">
            <span>Password</span>
            <input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </label>
        </div>
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        <button className="button button--accent button--full" disabled={busy !== null} type="submit">
          <span>{busy === "form" ? "Signing in…" : "Sign in to workspace"}</span><Arrow />
        </button>
      </form>
      <p className="auth-panel__foot">New corporate partner? <Link href="/signup">Create an account</Link></p>
    </div>
  );
}

const passwordRules = [
  { label: "12 or more characters", test: (value: string) => value.length >= 12 },
  { label: "One lowercase letter", test: (value: string) => /[a-z]/.test(value) },
  { label: "One uppercase letter", test: (value: string) => /[A-Z]/.test(value) },
  { label: "One number", test: (value: string) => /[0-9]/.test(value) },
  { label: "One symbol", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
];

export function SignupPanel() {
  const router = useRouter();
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validPassword = useMemo(() => passwordRules.every((rule) => rule.test(password)), [password]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiRequest<SessionData>("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ organizationName, email, password }),
      });
      router.push("/app");
      router.refresh();
    } catch (caught) {
      setError(messageForError(caught));
      setBusy(false);
    }
  }

  return (
    <div className="auth-panel signup-panel">
      <div className="auth-panel__heading">
        <p className="eyebrow">Corporate registration</p>
        <h1>Put useful surplus back in motion.</h1>
        <p>Create an isolated corporate workspace. You can register batches, retain custody evidence, and export certified records after independent receiving.</p>
      </div>
      <form className="form-stack" onSubmit={onSubmit}>
        <label className="field">
          <span>Organization name</span>
          <input autoComplete="organization" maxLength={120} minLength={2} onChange={(event) => setOrganizationName(event.target.value)} placeholder="Northstar Supply Co." required value={organizationName} />
        </label>
        <label className="field">
          <span>Work email</span>
          <input autoComplete="email" inputMode="email" maxLength={254} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required type="email" value={email} />
        </label>
        <label className="field">
          <span>Strong password</span>
          <input autoComplete="new-password" maxLength={128} minLength={12} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          <FieldHint>Use a unique password. EcoDrops never emails passwords.</FieldHint>
        </label>
        <ul className="password-rules" aria-label="Password requirements">
          {passwordRules.map((rule) => {
            const passed = rule.test(password);
            return <li className={passed ? "is-valid" : ""} key={rule.label}><CheckIcon />{rule.label}</li>;
          })}
        </ul>
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        <button className="button button--accent button--full" disabled={busy || !validPassword} type="submit">
          <span>{busy ? "Creating workspace…" : "Create corporate workspace"}</span><Arrow />
        </button>
      </form>
      <p className="auth-panel__foot">Already have access? <Link href="/login">Sign in</Link></p>
    </div>
  );
}
