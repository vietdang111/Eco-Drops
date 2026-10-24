import Link from "next/link";
import { Arrow, CheckIcon, PublicHeader, SiteFooter, SourceLabel } from "@/components/site-chrome";

const processSteps = [
  { number: "01", title: "Register", copy: "A corporate partner declares functional surplus, authority, quantity, weight, value, and invoice evidence." },
  { number: "02", title: "Reconcile", copy: "An independent warehouse receives the shipment, checks evidence, and compares measured with expected weight." },
  { number: "03", title: "Match", copy: "Campus inventory is offered through an anonymous, need-and-compatibility-first kiosk—not a student profile." },
  { number: "04", title: "Record", copy: "Eligible batches receive an auditable record with low, base, and high estimated avoided-emissions scenarios." },
];

export default function HomePage() {
  return (
    <>
      <PublicHeader />
      <main id="main-content">
        <section className="hero section-rule">
          <div className="container hero__grid">
            <div className="hero__copy">
              <div className="hero__meta">
                <span>Climate tech · circular access</span>
                <SourceLabel kind="simulated">Hackathon demo</SourceLabel>
              </div>
              <h1>Surplus should<br />land <em>somewhere useful, not landfills.</em></h1>
              <p className="hero__lede">EcoDrops moves functional corporate surplus through independent receiving and into campus inventory, then makes each assumption, handoff, and outcome legible.</p>
              <div className="button-row">
                <Link className="button button--accent" href="/signup">Register surplus <Arrow /></Link>
                <Link className="button button--ghost" href="/kiosk">Find a campus item <Arrow /></Link>
              </div>
              <div className="hero__proof" aria-label="Core product principles">
                <span><CheckIcon /> Independent receiving</span>
                <span><CheckIcon /> Anonymous student flow</span>
                <span><CheckIcon /> Scenario—not certainty</span>
              </div>
            </div>

            <aside className="record-preview" aria-label="Example certified impact record">
              <div className="record-preview__top">
                <div>
                  <p className="eyebrow">Certified record / 006</p>
                  <p className="record-preview__id">ECD-SYNTHETIC-0001</p>
                </div>
                <span className="seal"><CheckIcon /> Chain intact</span>
              </div>
              <div className="record-preview__visual" aria-hidden="true">
                <span className="record-preview__drop" />
                <span className="orbit orbit--one" />
                <span className="orbit orbit--two" />
                <span className="record-preview__figure">79.56</span>
                <span className="record-preview__unit">kgCO₂e · base estimate</span>
              </div>
              <div className="scenario-strip">
                <div><span>Low</span><strong>24.12</strong></div>
                <div className="scenario-strip__base"><span>Base</span><strong>79.56</strong></div>
                <div><span>High</span><strong>202.95</strong></div>
              </div>
              <div className="record-preview__foot">
                <SourceLabel kind="estimated">Estimated avoided emissions</SourceLabel>
                <SourceLabel kind="simulated">Synthetic demo data</SourceLabel>
              </div>
              <Link className="record-preview__link" href="/verify/ECD-SYNTHETIC-0001">Inspect five-field public record <Arrow /></Link>
            </aside>
          </div>
        </section>

        <section className="proof-band" aria-label="EcoDrops model">
          <div className="container proof-band__inner">
            <p>One accountable loop</p>
            <span>Corporate surplus</span><i aria-hidden="true" />
            <span>Independent warehouse</span><i aria-hidden="true" />
            <span>Campus inventory</span><i aria-hidden="true" />
            <span>Student outcome</span>
          </div>
        </section>

        <section className="section process-section" id="how-it-works">
          <div className="container">
            <div className="section-heading section-heading--split">
              <div><p className="eyebrow">How the loop works</p><h2>Evidence at every handoff.<br />Humility in every estimate.</h2></div>
              <p>EcoDrops separates observed custody events from modeled climate estimates. That distinction is visible by design, from upload to public verification.</p>
            </div>
            <ol className="process-list">
              {processSteps.map((step) => (
                <li key={step.number}>
                  <span className="process-list__number">{step.number}</span>
                  <div><h3>{step.title}</h3><p>{step.copy}</p></div>
                  <span className="process-list__line" aria-hidden="true" />
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section stakeholder-section">
          <div className="container">
            <div className="section-heading">
              <p className="eyebrow">Designed around real decisions</p>
              <h2>Value moves in more than one direction.</h2>
            </div>
            <div className="stakeholder-grid">
              <article>
                <span className="stakeholder-grid__index">For 01</span>
                <h3>Corporate teams</h3>
                <p>Replace an ambiguous surplus exit with a traceable batch, custody timeline, reconciliation evidence, and downloadable estimate record.</p>
                <ul><li>Clear intake gates</li><li>Shipment visibility</li><li>Scenario-based reporting</li></ul>
              </article>
              <article className="stakeholder-grid__feature">
                <span className="stakeholder-grid__index">For 02</span>
                <h3>Campus operators</h3>
                <p>See available inventory and observed outcomes without collecting student names, emails, or demographic profiles.</p>
                <ul><li>Inventory by status</li><li>Keep, return, recirculate</li><li>Unknown stays unknown</li></ul>
              </article>
              <article>
                <span className="stakeholder-grid__index">For 03</span>
                <h3>Students</h3>
                <p>Find sponsored items by what works and what is needed, with mystery mode for a lighter-weight choice experience.</p>
                <ul><li>No payment step</li><li>No account required</li><li>Keep, swap, or return</li></ul>
              </article>
            </div>
          </div>
        </section>

        <section className="section trust-section">
          <div className="container trust-grid">
            <div className="trust-intro">
              <p className="eyebrow eyebrow--light">Trust is a product surface</p>
              <h2>No black box.<br />No inflated claim.</h2>
              <p>We show what came from a source family, what was entered or observed, and what is simulated for this demonstration.</p>
              <Link className="button button--light" href="/methodology">Read the full methodology <Arrow /></Link>
            </div>
            <div className="trust-ledger">
              <div className="trust-row">
                <SourceLabel kind="sourced">Sourced reference</SourceLabel>
                <div><strong>Methodology family</strong><p>EPA WARM v16 and USEEIO are referenced as source families.</p></div>
              </div>
              <div className="trust-row">
                <SourceLabel kind="estimated">Model assumption</SourceLabel>
                <div><strong>Factors and rates</strong><p>Low, base, and high factors, displacement, retention, and handling are explicit proxy assumptions.</p></div>
              </div>
              <div className="trust-row">
                <SourceLabel kind="simulated">Simulated action</SourceLabel>
                <div><strong>Demo operations</strong><p>Carrier updates, scale readings, payment, and time actions are visibly simulated.</p></div>
              </div>
              <div className="trust-row trust-row--formula">
                <span>Formula</span>
                <code>max(0, weight × factor × displacement × retention − handling) × eligible units</code>
              </div>
            </div>
          </div>
        </section>

        <section className="section access-section">
          <div className="container access-grid">
            <div>
              <p className="eyebrow">Access without extraction</p>
              <h2>Need is enough.<br />Identity is not required.</h2>
            </div>
            <div>
              <p className="large-copy">The campus kiosk asks only for category, compatibility, and need tags. A locally stored anonymous token helps enforce the weekly claim cap; it is not a student profile.</p>
              <div className="access-points"><span>Keyboard operable</span><span>Large-type mode</span><span>High-contrast mode</span><span>44 px controls</span></div>
              <Link className="text-arrow-link" href="/kiosk">Open the anonymous kiosk <Arrow /></Link>
            </div>
          </div>
        </section>

        <section className="closing-cta">
          <div className="container closing-cta__inner">
            <p className="eyebrow">A better destination for useful goods</p>
            <h2>Turn surplus into a<br /><em>traceable second use.</em></h2>
            <div className="button-row button-row--center">
              <Link className="button button--accent" href="/signup">Start with a batch <Arrow /></Link>
              <Link className="button button--outline-light" href="/login">Explore seeded roles</Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
