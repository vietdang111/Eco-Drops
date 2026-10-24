import type { Metadata } from "next";
import Link from "next/link";
import { Arrow, PublicHeader, SiteFooter, SourceLabel } from "@/components/site-chrome";

export const metadata: Metadata = { title: "Methodology" };

const factors = [
  { category: "Electronics", factor: "8 / 12 / 18", displacement: "35 / 55 / 75%", retention: "55 / 70 / 85%", handling: "0.30" },
  { category: "Apparel", factor: "10 / 15 / 22", displacement: "30 / 50 / 70%", retention: "50 / 68 / 82%", handling: "0.08" },
  { category: "Study supplies", factor: "1.8 / 2.7 / 4", displacement: "35 / 55 / 72%", retention: "55 / 70 / 85%", handling: "0.04" },
  { category: "Other (fallback)", factor: "2 / 4 / 7", displacement: "25 / 45 / 65%", retention: "45 / 65 / 80%", handling: "0.10" },
];

export default function MethodologyPage() {
  return (
    <>
      <PublicHeader current="methodology" />
      <main id="main-content">
        <section className="method-hero">
          <div className="container method-hero__grid">
            <div>
              <p className="eyebrow">Methodology · demo-methodology-2026.1</p>
              <h1>Show the range.<br /><em>Keep the caveat.</em></h1>
            </div>
            <div className="method-hero__intro">
              <p>EcoDrops reports estimated avoided emissions as three scenarios. It does not turn an estimate into a credit, offset, accounting deduction, or claim of third-party assurance.</p>
              <div className="label-row"><SourceLabel kind="sourced">Source family</SourceLabel><SourceLabel kind="estimated">Proxy assumptions</SourceLabel></div>
            </div>
          </div>
        </section>

        <section className="section method-formula-section">
          <div className="container method-grid">
            <div className="method-side"><span>01</span><p>Calculation</p></div>
            <div>
              <p className="eyebrow">Avoided-emissions formula v1</p>
              <h2 className="formula-display"><span>max(0,</span> unit weight × factor × displacement × retention − handling <span>) × eligible units</span></h2>
              <div className="formula-legend">
                <div><strong>Unit weight</strong><p>Declared kg per item, then reconciled through receiving.</p></div>
                <div><strong>Eligible units</strong><p>Claimed quantity before receiving; verified units after receiving.</p></div>
                <div><strong>Factor</strong><p>Embodied-new proxy in kgCO₂e per kg.</p></div>
                <div><strong>Handling</strong><p>Per-item deduction for reuse operations.</p></div>
              </div>
            </div>
          </div>
        </section>

        <section className="section method-table-section">
          <div className="container method-grid">
            <div className="method-side"><span>02</span><p>Assumptions</p></div>
            <div>
              <div className="section-heading section-heading--compact">
                <p className="eyebrow">Low / base / high</p>
                <h2>Every variable stays visible.</h2>
                <p>These are synthetic demonstration proxies—not live measurements or category-average claims for decision-making outside this demo.</p>
              </div>
              <div className="table-scroll" tabIndex={0} aria-label="Scenario assumptions table">
                <table className="data-table methodology-table">
                  <caption className="sr-only">Synthetic low, base, and high assumptions by category</caption>
                  <thead><tr><th>Category</th><th>Factor kgCO₂e/kg</th><th>Displacement</th><th>Retention</th><th>Handling / item</th></tr></thead>
                  <tbody>{factors.map((row) => <tr key={row.category}><th scope="row">{row.category}</th><td>{row.factor}</td><td>{row.displacement}</td><td>{row.retention}</td><td>{row.handling}</td></tr>)}</tbody>
                </table>
              </div>
              <div className="method-notes">
                <div><span>n = 24</span><p>Demonstration displacement sample size stored with each factor.</p></div>
                <div><span>n = 18</span><p>Demonstration retention sample size stored with each factor.</p></div>
                <div><span>0 retained</span><p>A “no answer” outcome is conservatively not counted as retained.</p></div>
              </div>
            </div>
          </div>
        </section>

        <section className="section method-policy-section">
          <div className="container method-grid">
            <div className="method-side"><span>03</span><p>Policy</p></div>
            <div className="policy-grid">
              <article><p className="eyebrow">Observed vs modeled</p><h3>Custody is evidence. Climate benefit is an estimate.</h3><p>Uploads, timestamps, weight reconciliation, item decisions, and hash-linked audit events are operational records. The climate figure remains modeled from explicit assumptions.</p></article>
              <article><p className="eyebrow">Retention</p><h3>Unknown does not quietly become success.</h3><p>IN_USE and PASSED_ON are retained outcomes. RETURNING and NO_ANSWER remain in the denominator and are not retained. Current certificates use fixed scenario rates; kiosk outcomes do not retroactively change them.</p></article>
              <article><p className="eyebrow">Disposal comparison</p><h3>No factor, no disposal-emissions claim.</h3><p>The demo exposes quantity-only comparison inputs. Because no disposal factor is configured, EcoDrops does not calculate or imply a disposal counterfactual benefit.</p></article>
              <article><p className="eyebrow">Certification</p><h3>Certified means workflow gates passed.</h3><p>It does not mean a third party authenticated every document or audited the climate model. The receiver must be different from the uploader, with evidence and variance gates satisfied.</p></article>
            </div>
          </div>
        </section>

        <section className="section sources-section">
          <div className="container method-grid">
            <div className="method-side"><span>04</span><p>Sources</p></div>
            <div>
              <div className="section-heading section-heading--compact"><p className="eyebrow">Referenced source families</p><h2>Follow the source, not just the number.</h2></div>
              <div className="source-links">
                <a href="https://www.epa.gov/warm" rel="noreferrer" target="_blank"><span><strong>EPA WARM</strong><small>Waste Reduction Model · source family reference</small></span><Arrow /></a>
                <a href="https://www.epa.gov/land-research/us-environmentally-extended-input-output-useeio-models" rel="noreferrer" target="_blank"><span><strong>US EPA USEEIO</strong><small>Environmentally extended input-output models · source family reference</small></span><Arrow /></a>
              </div>
              <p className="source-disclosure">Source families are referenced; category factors, displacement, retention, and handling values remain explicit EcoDrops demo assumptions. Version: <code>proxy-factor-2026.1</code>.</p>
            </div>
          </div>
        </section>

        <section className="method-disclaimer">
          <div className="container method-disclaimer__inner">
            <div><p className="eyebrow eyebrow--light">Plain-language disclaimer</p><h2>An estimate is not an instrument.</h2></div>
            <p>This is an estimated avoided-emissions record, not a carbon credit, offset, Scope 3 deduction, tax record, or third-party audit. Uploaded documents are consistency-checked and physically reconciled; they are not authenticated by EcoDrops.</p>
          </div>
        </section>

        <section className="mini-cta"><div className="container mini-cta__inner"><div><p className="eyebrow">See the projection boundary</p><h2>Verify a public record.</h2></div><Link className="button button--dark" href="/verify/ECD-SYNTHETIC-0001">Open seeded record <Arrow /></Link></div></section>
      </main>
      <SiteFooter />
    </>
  );
}
