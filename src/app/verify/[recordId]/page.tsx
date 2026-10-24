import type { Metadata } from "next";
import { PublicHeader, SiteFooter } from "@/components/site-chrome";
import { VerifyRecord } from "@/components/verify-record";

export const metadata: Metadata = { title: "Verify a record" };

export default async function VerificationPage({ params }: { params: Promise<{ recordId: string }> }) {
  const { recordId } = await params;
  return (
    <>
      <PublicHeader current="verify" />
      <main id="main-content" className="verify-page">
        <section className="verify-hero">
          <div className="container verify-hero__grid">
            <div>
              <p className="eyebrow">Public verification</p>
              <h1>Trust, reduced to<br /><em>five essential fields.</em></h1>
            </div>
            <p>Enter a certified record code. The public view deliberately excludes organization data, shipment details, invoice evidence, estimates, and student outcomes.</p>
          </div>
        </section>
        <section className="container verify-content">
          <VerifyRecord initialRecordId={decodeURIComponent(recordId)} key={recordId} />
          <aside className="verify-aside">
            <p className="eyebrow">What this means</p>
            <h2>A match confirms integrity metadata—not a carbon credit.</h2>
            <ol><li><span>01</span>Record ID and status are checked against the public API.</li><li><span>02</span>The audit hash anchors this record to the internal event chain.</li><li><span>03</span>Methodology details and caveats remain independently readable.</li></ol>
            <a className="text-arrow-link" href="/methodology">Read the methodology <span aria-hidden="true">→</span></a>
          </aside>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
