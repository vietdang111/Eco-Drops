import type { Metadata } from "next";
import Link from "next/link";
import { SignupPanel } from "@/components/auth-panels";
import { Brand, CheckIcon } from "@/components/site-chrome";

export const metadata: Metadata = { title: "Register your organization" };

export default function SignupPage() {
  return (
    <main className="auth-page auth-page--signup" id="main-content">
      <aside className="auth-context auth-context--cobalt">
        <Brand href="/" inverse />
        <div className="auth-context__center">
          <p className="eyebrow eyebrow--light">From upload to outcome</p>
          <h2>A corporate account starts the custody chain.</h2>
          <ul className="auth-benefits">
            <li><CheckIcon /><span><strong>Declare responsibly</strong> with authority and invoice evidence.</span></li>
            <li><CheckIcon /><span><strong>See the handoffs</strong> through warehouse receiving.</span></li>
            <li><CheckIcon /><span><strong>Export carefully</strong> with explicit assumptions and disclaimers.</span></li>
          </ul>
        </div>
        <p className="auth-context__legal">Registration creates a corporate workspace only. Student kiosk access remains anonymous.</p>
      </aside>
      <section className="auth-form-area" aria-label="Corporate registration form">
        <div className="auth-form-area__top"><Link href="/">← Back to overview</Link><Link href="/login">Sign in</Link></div>
        <SignupPanel />
      </section>
    </main>
  );
}
