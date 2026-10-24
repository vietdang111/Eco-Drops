"use client";

import { useRef, useState, type FormEvent } from "react";
import { ApiClientError, idempotencyKey, messageForError, postJson } from "./api-client";
import type { ClaimResult, DecisionResult, KioskMode, KioskSession, MatchedItem, RevealedClaim } from "./ecodrops-types";
import { Arrow, CheckIcon, FieldHint, InlineNotice, SourceLabel } from "./site-chrome";

const CAMPUS_ID = "org-synthetic-campus";
const WEEKLY_TOKEN_STORAGE_KEY = "ecodrops-anonymous-weekly-token";
type Stage = "profile" | "matches" | "checkout" | "reveal" | "decision" | "survey" | "complete";
type Decision = "KEEP" | "SWAP" | "RETURN";

function weeklyToken(): string {
  const existing = window.localStorage.getItem(WEEKLY_TOKEN_STORAGE_KEY);
  if (existing && existing.length >= 16) return existing;
  const created = `anonymous-weekly-${crypto.randomUUID()}`;
  window.localStorage.setItem(WEEKLY_TOKEN_STORAGE_KEY, created);
  return created;
}

export function KioskExperience() {
  const [stage, setStage] = useState<Stage>("profile");
  const [category, setCategory] = useState("electronics");
  const [connector, setConnector] = useState("usb-c");
  const [needTags, setNeedTags] = useState<string[]>(["coursework"]);
  const [mystery, setMystery] = useState(false);
  const [session, setSession] = useState<KioskSession | null>(null);
  const [matches, setMatches] = useState<MatchedItem[]>([]);
  const [selected, setSelected] = useState<MatchedItem | null>(null);
  const [claim, setClaim] = useState<ClaimResult | null>(null);
  const [revealed, setRevealed] = useState<RevealedClaim | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [surveyDisplacement, setSurveyDisplacement] = useState<"YES" | "NO" | "UNSURE">("UNSURE");
  const [surveyOutcome, setSurveyOutcome] = useState<"IN_USE" | "RETURNING" | "PASSED_ON" | "NO_ANSWER">("NO_ANSWER");
  const [droppedBack, setDroppedBack] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capReached, setCapReached] = useState(false);
  const [largeType, setLargeType] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const operationKeys = useRef<Record<string, string>>({});

  function keyFor(operation: string): string {
    operationKeys.current[operation] ??= idempotencyKey(operation);
    return operationKeys.current[operation];
  }

  function toggleNeed(tag: string) {
    setNeedTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  }

  function handleError(caught: unknown) {
    const isCap = caught instanceof ApiClientError && caught.code === "BUSINESS_GATE_FAILED" && caught.message.toLowerCase().includes("weekly claim cap");
    if (isCap) setCapReached(true);
    setError(messageForError(caught));
  }

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("match");
    setError(null);
    setCapReached(false);
    try {
      const mode: KioskMode = mystery ? "MYSTERY_SHORTLIST" : "CATEGORY_KNOWN";
      const compatibility = category === "electronics" && connector !== "any" ? { connector } : {};
      const nextSession = await postJson<KioskSession>("/kiosk/sessions", {
        campusOrganizationId: CAMPUS_ID,
        mode,
        requestedCategories: [category],
        compatibility,
        needTags,
        weeklyClaimToken: weeklyToken(),
      });
      setSession(nextSession);
      if (nextSession.weeklyClaimsRemaining === 0) {
        setCapReached(true);
        setError(`This anonymous demo visitor has used all ${nextSession.weeklyClaimCap} claims for ${nextSession.weekKey}.`);
        return;
      }
      const result = await postJson<{ items: MatchedItem[] }>("/kiosk/matches", { token: nextSession.token });
      setMatches(result.items);
      setStage("matches");
    } catch (caught) { handleError(caught); }
    finally { setBusy(null); }
  }

  function choose(item: MatchedItem) {
    setSelected(item);
    setStage("checkout");
    setError(null);
  }

  async function checkout() {
    if (!session || !selected) return;
    setBusy("checkout");
    setError(null);
    try {
      const result = await postJson<ClaimResult>("/kiosk/checkout", { token: session.token, itemId: selected.itemId }, { "Idempotency-Key": keyFor(`checkout-${selected.itemId}`) });
      setClaim(result);
      setStage("reveal");
    } catch (caught) { handleError(caught); }
    finally { setBusy(null); }
  }

  async function reveal() {
    if (!session || !claim) return;
    setBusy("reveal");
    setError(null);
    try {
      const result = await postJson<RevealedClaim>("/kiosk/reveal", { token: session.token, claimId: claim.claimId }, { "Idempotency-Key": keyFor(`reveal-${claim.claimId}`) });
      setRevealed(result);
      setStage("decision");
    } catch (caught) { handleError(caught); }
    finally { setBusy(null); }
  }

  async function decide(nextDecision: Decision) {
    if (!session || !claim) return;
    setBusy(nextDecision);
    setError(null);
    try {
      await postJson<DecisionResult>("/kiosk/decision", { token: session.token, claimId: claim.claimId, decision: nextDecision }, { "Idempotency-Key": keyFor(`decision-${claim.claimId}-${nextDecision}`) });
      setDecision(nextDecision);
      setStage("survey");
    } catch (caught) { handleError(caught); }
    finally { setBusy(null); }
  }

  async function submitSurvey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !claim) return;
    setBusy("survey");
    setError(null);
    try {
      await postJson("/kiosk/survey", {
        token: session.token,
        claimId: claim.claimId,
        displacementAnswer: surveyDisplacement,
        followUpOutcome: surveyOutcome,
      }, { "Idempotency-Key": keyFor(`survey-${claim.claimId}`) });
      setStage("complete");
    } catch (caught) { handleError(caught); }
    finally { setBusy(null); }
  }

  async function dropBack() {
    if (!session || !claim) return;
    setBusy("drop-back");
    setError(null);
    try {
      await postJson("/kiosk/drop-back", { token: session.token, claimId: claim.claimId }, { "Idempotency-Key": keyFor(`drop-back-${claim.claimId}`) });
      setDroppedBack(true);
    } catch (caught) { handleError(caught); }
    finally { setBusy(null); }
  }

  function restart() {
    setStage("profile");
    setSession(null);
    setMatches([]);
    setSelected(null);
    setClaim(null);
    setRevealed(null);
    setDecision(null);
    setDroppedBack(false);
    setError(null);
    setCapReached(false);
    operationKeys.current = {};
  }

  function startNextDemoVisitor() {
    window.localStorage.removeItem(WEEKLY_TOKEN_STORAGE_KEY);
    restart();
  }

  const remainingAfterClaim = session
    ? Math.max(0, session.weeklyClaimsRemaining - (claim ? 1 : 0))
    : 0;
  const step = stage === "profile" ? 1 : stage === "matches" ? 2 : ["checkout", "reveal"].includes(stage) ? 3 : ["decision", "survey"].includes(stage) ? 4 : 5;
  return (
    <div className={`kiosk-experience${largeType ? " kiosk-experience--large" : ""}${highContrast ? " kiosk-experience--contrast" : ""}`}>
      <div className="kiosk-toolbar">
        <div><span className="privacy-dot" /> No account · no student PII</div>
        <div><button aria-pressed={largeType} onClick={() => setLargeType((value) => !value)} type="button">Aa Large type</button><button aria-pressed={highContrast} onClick={() => setHighContrast((value) => !value)} type="button">◐ High contrast</button></div>
      </div>
      <div className="kiosk-progress" aria-label={`Step ${step} of 5`}><span>0{step}</span><div>{[1, 2, 3, 4, 5].map((item) => <i className={item <= step ? "is-active" : ""} key={item} />)}</div><small>05</small></div>

      {error ? <div className="kiosk-error"><InlineNotice tone={capReached ? "warning" : "danger"}><strong>{capReached ? "Weekly cap reached." : "This step needs attention."}</strong> {error}</InlineNotice>{capReached ? <div><p>This browser token represents one anonymous demo visitor. Returns still count toward the cap; use the button below only to simulate the next person at a shared kiosk.</p><button className="button button--ghost" onClick={startNextDemoVisitor} type="button">Start as next demo visitor</button></div> : null}</div> : null}

      {stage === "profile" ? (
        <form className="kiosk-stage kiosk-profile" onSubmit={start}>
          <div className="kiosk-stage__heading"><p className="eyebrow">Step 01 · Find your fit</p><h2>What would be useful<br /><em>right now?</em></h2><p>Choose only practical details. We do not ask for your name, email, student ID, demographic information, or payment.</p></div>
          <div className="kiosk-question"><fieldset><legend>Choose a category</legend><div className="choice-grid choice-grid--three">{[["electronics", "Electronics", "Laptop-ready items"], ["apparel", "Apparel", "Everyday essentials"], ["study supplies", "Study supplies", "Tools for coursework"]].map(([value, title, copy]) => <label className={category === value ? "is-selected" : ""} key={value}><input checked={category === value} name="category" onChange={() => setCategory(value)} type="radio" /><span className="choice-grid__mark" /><strong>{title}</strong><small>{copy}</small></label>)}</div></fieldset></div>
          {category === "electronics" ? <div className="kiosk-question"><label className="field"><span>Connector compatibility</span><select onChange={(event) => setConnector(event.target.value)} value={connector}><option value="usb-c">USB-C</option><option value="usb-a">USB-A</option><option value="any">No preference</option></select><FieldHint>The seeded demo inventory currently matches USB-C.</FieldHint></label></div> : null}
          <div className="kiosk-question"><fieldset><legend>What need should it support? <span>Choose any</span></legend><div className="tag-choices">{[["coursework", "Coursework"], ["remote-learning", "Remote learning"], ["job-search", "Job search"], ["creative-project", "Creative project"]].map(([value, label]) => <label className={needTags.includes(value) ? "is-selected" : ""} key={value}><input checked={needTags.includes(value)} onChange={() => toggleNeed(value)} type="checkbox" />{label}</label>)}</div></fieldset></div>
          <label className="mystery-toggle"><input checked={mystery} onChange={(event) => setMystery(event.target.checked)} type="checkbox" /><span className="mystery-toggle__switch" /><span><strong>Mystery shortlist</strong><small>Hide item details until after sponsored checkout. Compatibility is still enforced.</small></span></label>
          <button className="button button--accent button--large" disabled={busy !== null || needTags.length === 0} type="submit">{busy === "match" ? "Matching…" : "Show compatible items"}<Arrow /></button>
        </form>
      ) : null}

      {stage === "matches" ? (
        <section className="kiosk-stage">
          <div className="kiosk-stage__heading"><p className="eyebrow">Step 02 · Compatible inventory</p><h2>{matches.length ? `${matches.length} match${matches.length === 1 ? "" : "es"}, ready to choose.` : "No match in stock yet."}</h2><p>{mystery ? "Details stay hidden until reveal; every option passed the compatibility and need filters." : "Availability is checked again at sponsored checkout."}</p></div>
          {matches.length ? <div className="match-list">{matches.map((item, index) => <button key={item.itemId} onClick={() => choose(item)} type="button"><span className="match-list__index">0{index + 1}</span><span className="match-list__visual" aria-hidden="true"><i /></span><span className="match-list__copy"><SourceLabel kind={item.mystery ? "estimated" : "sourced"}>{item.mystery ? "Mystery match" : item.category ?? "Compatible"}</SourceLabel><strong>{item.displayLabel}</strong><small>{item.mystery ? "Compatibility confirmed · details concealed" : `${Object.entries(item.compatibility).map(([key, value]) => `${key}: ${String(value)}`).join(" · ")} · ${item.needTags.join(" · ")}`}</small></span><span className="match-list__arrow">Choose →</span></button>)}</div> : <div className="no-match"><span aria-hidden="true">○</span><h3>Try a broader need or another category.</h3><p>The kiosk will not offer an incompatible item just to fill the screen.</p></div>}
          <button className="text-button kiosk-back" onClick={restart} type="button">← Change my answers</button>
        </section>
      ) : null}

      {stage === "checkout" && selected ? (
        <section className="kiosk-stage kiosk-confirm">
          <div className="kiosk-stage__heading"><p className="eyebrow">Step 03 · Sponsored checkout</p><h2>Reserve this match<br />at <em>no cost.</em></h2></div>
          <div className="checkout-ticket"><div className="checkout-ticket__item"><span>{selected.mystery ? "Mystery item" : selected.category}</span><strong>{selected.displayLabel}</strong><code>{selected.itemId}</code></div><dl><div><dt>Item cost</dt><dd>$0.00</dd></div><div><dt>Method</dt><dd>Sponsored free</dd></div><div><dt>Identity collected</dt><dd>None</dd></div><div><dt>Weekly demo cap</dt><dd>{session?.weeklyClaimCap ?? 3} claims · {session?.weeklyClaimsRemaining ?? 0} available</dd></div></dl><div className="checkout-ticket__total"><span>Total due</span><strong>$0</strong></div></div>
          <p className="idempotency-note"><CheckIcon /> Retrying this exact action safely reuses one idempotency key; it will not create a duplicate claim.</p>
          <div className="button-row"><button className="button button--accent button--large" disabled={busy !== null} onClick={() => void checkout()} type="button">{busy === "checkout" ? "Reserving…" : "Confirm sponsored checkout"}<Arrow /></button><button className="button button--ghost" onClick={() => setStage("matches")} type="button">Back</button></div>
        </section>
      ) : null}

      {stage === "reveal" && claim ? (
        <section className="kiosk-stage kiosk-reveal-ready"><div className="reveal-orbit" aria-hidden="true"><span>?</span><i /><i /></div><div className="kiosk-stage__heading"><SourceLabel kind="simulated">Sponsored payment simulated</SourceLabel><p className="eyebrow">Checkout complete · reveal ready</p><h2>Your match is reserved.</h2><p>Claim <code>{claim.claimId}</code> is checked out. Reveal the item before choosing whether to keep, swap, or return it.</p></div><button className="button button--accent button--large" disabled={busy !== null} onClick={() => void reveal()} type="button">{busy === "reveal" ? "Revealing…" : "Reveal my item"}<Arrow /></button></section>
      ) : null}

      {stage === "decision" && revealed ? (
        <section className="kiosk-stage">
          <div className="reveal-card"><div className="reveal-card__visual" aria-hidden="true"><span><CheckIcon /></span></div><div><SourceLabel kind="sourced">Inventory record</SourceLabel><p className="eyebrow">Step 04 · Revealed match</p><h2>{revealed.itemLabel}</h2><p>{revealed.category} · {Object.entries(revealed.compatibility).map(([key, value]) => `${key}: ${String(value)}`).join(" · ")}</p><code>{revealed.itemId}</code></div></div>
          <fieldset className="decision-grid"><legend>What would you like to do?</legend><button disabled={busy !== null} onClick={() => void decide("KEEP")} type="button"><span>01</span><strong>Keep</strong><small>This works for me. Mark it distributed.</small><Arrow /></button><button disabled={busy !== null} onClick={() => void decide("SWAP")} type="button"><span>02</span><strong>Swap</strong><small>Return this item; staff can help with another match.</small><Arrow /></button><button disabled={busy !== null} onClick={() => void decide("RETURN")} type="button"><span>03</span><strong>Return</strong><small>Put this item back into available inventory.</small><Arrow /></button></fieldset>
        </section>
      ) : null}

      {stage === "survey" && decision ? (
        <form className="kiosk-stage kiosk-survey" onSubmit={submitSurvey}>
          <div className="kiosk-stage__heading"><p className="eyebrow">Step 04 · Outcome check</p><h2>One small survey.<br /><em>No identity attached.</em></h2><p>Your answer improves aggregate outcome counts. “No answer” stays unknown and is not treated as retention.</p></div>
          <fieldset className="survey-question"><legend>Would you otherwise have obtained a comparable item?</legend><div className="choice-row">{(["YES", "NO", "UNSURE"] as const).map((value) => <label className={surveyDisplacement === value ? "is-selected" : ""} key={value}><input checked={surveyDisplacement === value} name="displacement" onChange={() => setSurveyDisplacement(value)} type="radio" />{value === "YES" ? "Yes" : value === "NO" ? "No" : "Unsure"}</label>)}</div></fieldset>
          <fieldset className="survey-question"><legend>What best describes the item now?</legend><div className="choice-row choice-row--four">{(["IN_USE", "RETURNING", "PASSED_ON", "NO_ANSWER"] as const).map((value) => <label className={surveyOutcome === value ? "is-selected" : ""} key={value}><input checked={surveyOutcome === value} name="outcome" onChange={() => setSurveyOutcome(value)} type="radio" />{value.replaceAll("_", " ")}</label>)}</div></fieldset>
          <button className="button button--accent button--large" disabled={busy !== null} type="submit">{busy === "survey" ? "Saving outcome…" : "Submit anonymous outcome"}<Arrow /></button>
        </form>
      ) : null}

      {stage === "complete" ? (
        <section className="kiosk-stage kiosk-complete"><div className="complete-mark"><CheckIcon /></div><p className="eyebrow">Step 05 · Complete</p><h2>{droppedBack ? "Back in circulation." : decision === "KEEP" ? "Ready for a second use." : "Return is ready."}</h2><p>{droppedBack ? "The same item identity is available again, with its circulation count incremented." : decision === "KEEP" ? "Your item is recorded as distributed. Thank you for reporting an outcome without creating a profile." : "Your item is marked return pending. Drop it at the campus station now to make it available again."}</p>
          {decision !== "KEEP" && !droppedBack ? <button className="button button--accent button--large" disabled={busy !== null} onClick={() => void dropBack()} type="button">{busy === "drop-back" ? "Recording drop-back…" : "Confirm optional drop-back"}<Arrow /></button> : null}
          <div className="complete-receipt"><span>Claim</span><code>{claim?.claimId}</code><span>Decision</span><strong>{decision}</strong><span>Follow-up</span><strong>{surveyOutcome.replaceAll("_", " ")}</strong></div>
          {remainingAfterClaim > 0 ? <button className="text-button" onClick={restart} type="button">Claim another item · {remainingAfterClaim} remaining this demo week</button> : null}
          <button className="text-button" onClick={startNextDemoVisitor} type="button">Finish and start the next demo visitor</button>
        </section>
      ) : null}

      {session ? <p className="session-expiry">Anonymous session expires {new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(session.expiresAt))}. Finish decisions and drop-back before expiry.</p> : null}
    </div>
  );
}
