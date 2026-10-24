import type { Metadata } from "next";
import Link from "next/link";
import { LoginPanel } from "@/components/auth-panels";
import { Brand, SourceLabel } from "@/components/site-chrome";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="auth-page" id="main-content">
      <aside className="auth-context">
        <Brand href="/" inverse />
        <div className="auth-context__center">
          <SourceLabel kind="simulated">Synthetic demo workspace</SourceLabel>
          <blockquote>“Make the evidence as useful as the surplus.”</blockquote>
          <p>Follow one batch from declaration to campus outcome through four distinct operational views.</p>
        </div>
        <div className="auth-context__foot">
          <span>Independent receiving</span><span>Five-field public verification</span>
        </div>
      </aside>
      <section className="auth-form-area" aria-label="Sign in form">
        <div className="auth-form-area__top"><Link href="/">← Back to overview</Link><Link href="/signup">Create corporate account</Link></div>
        <LoginPanel />
      </section>
    </main>
  );
}
