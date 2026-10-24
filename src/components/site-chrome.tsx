import Link from "next/link";
import type { ReactNode } from "react";
import type { BatchStatus, RiskTier, VarianceTier } from "./ecodrops-types";

export function LogoMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`logo-mark${compact ? " logo-mark--compact" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 42 42" role="img">
        <path d="M21 2.5C15.2 11.4 8.4 17.9 8.4 26.2A12.6 12.6 0 0 0 21 38.8a12.6 12.6 0 0 0 12.6-12.6C33.6 17.9 26.8 11.4 21 2.5Z" fill="currentColor" />
        <path d="M14.1 27.7c5.6-.4 10.3-3.5 13.7-8.9-1.1 8-5.4 12.4-12.8 13.1" fill="none" stroke="var(--pine)" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function Brand({ href = "/", inverse = false }: { href?: string; inverse?: boolean }) {
  return (
    <Link className={`brand${inverse ? " brand--inverse" : ""}`} href={href} aria-label="EcoDrops home">
      <LogoMark compact />
      <span>EcoDrops</span>
    </Link>
  );
}

export function Arrow({ direction = "right" }: { direction?: "right" | "down" | "up" }) {
  const rotation = direction === "down" ? 90 : direction === "up" ? -90 : 0;
  return (
    <svg className="icon-arrow" viewBox="0 0 20 20" aria-hidden="true" style={{ transform: `rotate(${rotation}deg)` }}>
      <path d="M3.5 10h12M11 5.5l4.5 4.5-4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg className="icon-check" viewBox="0 0 20 20" aria-hidden="true">
      <path d="m4 10.4 3.8 3.8L16 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PublicHeader({ current }: { current?: "methodology" | "verify" | "kiosk" }) {
  return (
    <header className="public-header">
      <div className="container public-header__inner">
        <Brand />
        <nav className="public-nav" aria-label="Primary navigation">
          <Link aria-current={current === "methodology" ? "page" : undefined} href="/methodology">Methodology</Link>
          <Link aria-current={current === "verify" ? "page" : undefined} href="/verify/ECD-SYNTHETIC-0001">Verify a record</Link>
          <Link aria-current={current === "kiosk" ? "page" : undefined} href="/kiosk">Student kiosk</Link>
        </nav>
        <div className="public-header__actions">
          <Link className="text-link hide-mobile" href="/login">Sign in</Link>
          <Link className="button button--small button--dark" href="/signup">Register surplus</Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container site-footer__grid">
        <div>
          <Brand inverse />
          <p className="site-footer__statement">Useful surplus, independently received and matched to campus need.</p>
        </div>
        <div>
          <p className="eyebrow eyebrow--light">Explore</p>
          <Link href="/methodology">Methodology</Link>
          <Link href="/verify/ECD-SYNTHETIC-0001">Public verification</Link>
          <Link href="/kiosk">Student kiosk</Link>
        </div>
        <div>
          <p className="eyebrow eyebrow--light">Important</p>
          <p className="small-copy">Estimates are not carbon credits, offsets, Scope 3 deductions, tax records, or third-party audits.</p>
        </div>
      </div>
      <div className="container site-footer__base">
        <span>EcoDrops · Climate tech demonstration</span>
        <span>Privacy-first · No student PII</span>
      </div>
    </footer>
  );
}

export function StatusPill({ value }: { value: BatchStatus | RiskTier | VarianceTier | string }) {
  const normalized = value.toLowerCase().replaceAll("_", "-");
  return <span className={`status-pill status-pill--${normalized}`}>{value.replaceAll("_", " ")}</span>;
}

export function SourceLabel({ kind, children }: { kind: "sourced" | "simulated" | "estimated"; children: ReactNode }) {
  return <span className={`source-label source-label--${kind}`}><span className="source-label__dot" />{children}</span>;
}

export function InlineNotice({ tone = "info", children }: { tone?: "info" | "warning" | "success" | "danger"; children: ReactNode }) {
  return <div className={`inline-notice inline-notice--${tone}`} role={tone === "danger" ? "alert" : "status"}>{children}</div>;
}

export function LoadingBlock({ label = "Loading EcoDrops…" }: { label?: string }) {
  return (
    <div className="loading-block" role="status">
      <span className="loading-mark" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-state__mark" aria-hidden="true">↗</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function FieldHint({ children }: { children: ReactNode }) {
  return <span className="field-hint">{children}</span>;
}
