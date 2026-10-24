"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  ApiClientError,
  apiRequest,
  downloadCertificateJson,
  downloadCertificatePdf,
  idempotencyKey,
  messageForError,
  postJson,
} from "./api-client";
import type {
  AllocationMutationResult,
  AllocationReceiptResult,
  AuditVerification,
  BatchDetail,
  BatchStatus,
  BatchSummary,
  CampusAllocation,
  CampusSummary,
  DashboardReadModel,
  HsPolicyCatalogEntry,
  MethodologyReadModel,
  SafeUser,
  UserRole,
  WorkspaceResponse,
} from "./ecodrops-types";
import { PublicVerificationQr } from "./public-verification-qr";
import {
  Arrow,
  Brand,
  CheckIcon,
  EmptyState,
  InlineNotice,
  LoadingBlock,
  SourceLabel,
  StatusPill,
} from "./site-chrome";

const ROLE_COPY: Record<UserRole, { label: string; short: string; heading: string; intro: string }> = {
  corp_user: {
    label: "Corporate partner",
    short: "Corporate",
    heading: "Move surplus with evidence.",
    intro: "Register functional goods, clear intake gates, and follow custody through independent receiving.",
  },
  warehouse_op: {
    label: "Independent warehouse",
    short: "Warehouse",
    heading: "Reconcile what arrived.",
    intro: "Review incoming batches, record measured weight and evidence, then certify only eligible records.",
  },
  campus_admin: {
    label: "Campus operator",
    short: "Campus",
    heading: "See access become outcomes.",
    intro: "Monitor campus inventory, anonymous decisions, follow-ups, and conservative unknowns.",
  },
  admin: {
    label: "Platform operations",
    short: "Admin",
    heading: "Keep the system honest.",
    intro: "Inspect platform activity, verify the hash-linked event chain, and review active methodology.",
  },
};

const STATUS_OWNER: Record<BatchStatus, string> = {
  DRAFT: "Corporate",
  PENDING_VERIFICATION: "System screening",
  BLOCKED: "System screening",
  IN_TRANSIT: "Corporate",
  DELIVERED: "Carrier",
  RECEIVED: "Warehouse + system",
  UNDER_REVIEW: "System variance",
  REJECTED: "Warehouse + system",
  CERTIFIED: "Warehouse / admin",
  DISTRIBUTING: "Warehouse allocation / Campus receipt",
  CLOSED: "Campus receipt + system",
};

const HS_CODE_OPTIONS = [
  { code: "847130", label: "Laptops" },
  { code: "850440", label: "USB-C adapters" },
  { code: "610910", label: "Apparel" },
  { code: "482010", label: "Study supplies" },
  { code: "902110", label: "Blocked medical products" },
] as const;

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const NUMBER_FORMAT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function formatDate(value: string): string {
  return DATE_FORMAT.format(new Date(value));
}
function formatNumber(value: number): string {
  return NUMBER_FORMAT.format(value);
}
function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}
function shortHash(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-8)}`;
}
function isAuthError(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 401;
}

export function AppDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<SafeUser | null>(null);
  const [dashboard, setDashboard] = useState<DashboardReadModel | null>(null);
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [workspaceAllocations, setWorkspaceAllocations] = useState<CampusAllocation[]>([]);
  const [campuses, setCampuses] = useState<CampusSummary[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [detailReload, setDetailReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "warning" | "danger"; message: string } | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      try {
        const workspace = await apiRequest<WorkspaceResponse>("/workspace");
        if (!active) return;
        const firstBatchId = workspace.batches[0]?.id ?? null;
        setUser(workspace.user);
        setDashboard(workspace.dashboard);
        setBatches(workspace.batches);
        setWorkspaceAllocations(workspace.allocations);
        setCampuses(workspace.campuses);
        setSelectedBatchId(firstBatchId);
        setDetailLoading(firstBatchId !== null);
      } catch (error) {
        if (!active) return;
        if (isAuthError(error)) {
          router.replace("/login?expired=1");
          return;
        }
        setFatalError(messageForError(error));
      } finally {
        if (active) setLoading(false);
      }
    }
    void bootstrap();
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    if (!selectedBatchId) return;

    const controller = new AbortController();
    let active = true;
    apiRequest<BatchDetail>(`/batches/${encodeURIComponent(selectedBatchId)}`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (active) setDetail(result);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (isAuthError(error)) router.replace("/login?expired=1");
        else setNotice({ tone: "danger", message: messageForError(error) });
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [router, selectedBatchId, detailReload]);

  function selectBatch(id: string) {
    if (id === selectedBatchId) return;
    setDetailLoading(true);
    setSelectedBatchId(id);
  }

  async function refresh(preferredBatchId?: string) {
    try {
      const workspace = await apiRequest<WorkspaceResponse>("/workspace");
      setUser(workspace.user);
      setDashboard(workspace.dashboard);
      setBatches(workspace.batches);
      setWorkspaceAllocations(workspace.allocations);
      setCampuses(workspace.campuses);
      const target = preferredBatchId ?? selectedBatchId ?? workspace.batches[0]?.id ?? null;
      if (!target) {
        setSelectedBatchId(null);
        setDetail(null);
        setDetailLoading(false);
      } else if (target === selectedBatchId) {
        setDetailLoading(true);
        setDetailReload((current) => current + 1);
      } else {
        setDetailLoading(true);
        setSelectedBatchId(target);
      }
    } catch (error) {
      if (isAuthError(error)) router.replace("/login?expired=1");
      else setNotice({ tone: "danger", message: messageForError(error) });
      setDetailLoading(false);
    }
  }

  async function logout() {
    setLoggingOut(true);
    try {
      await postJson<{ loggedOut: boolean }>("/auth/logout");
    } catch {
      // Navigating to sign-in is still the safest outcome for a stale session.
    }
    router.replace("/login");
    router.refresh();
  }

  if (loading) return <main className="app-boot" id="main-content"><Brand /><LoadingBlock label="Opening your EcoDrops workspace…" /></main>;
  if (fatalError || !user || !dashboard) {
    return (
      <main className="app-boot" id="main-content">
        <Brand />
        <div className="fatal-panel"><p className="eyebrow">Workspace unavailable</p><h1>We could not load EcoDrops.</h1><p>{fatalError ?? "Your session could not be resolved."}</p><Link className="button button--dark" href="/login">Return to sign in</Link></div>
      </main>
    );
  }

  const role = ROLE_COPY[user.role];
  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <Brand href="/app" inverse />
        <div className="dashboard-sidebar__context">
          <p className="eyebrow eyebrow--light">Current workspace</p>
          <strong>{role.short}</strong>
          <span>{user.organizationName}</span>
        </div>
        <nav className="dashboard-nav" aria-label="Workspace navigation">
          <a href="#overview"><span>01</span>Overview</a>
          <a href="#operations"><span>02</span>Operations</a>
          <a href="#evidence"><span>03</span>Evidence & method</a>
        </nav>
        <div className="dashboard-sidebar__links">
          <Link href="/kiosk">Open kiosk <span aria-hidden="true">↗</span></Link>
          <Link href="/verify/ECD-SYNTHETIC-0001">Public verifier <span aria-hidden="true">↗</span></Link>
          <Link href="/methodology">Methodology <span aria-hidden="true">↗</span></Link>
        </div>
        <div className="dashboard-user">
          <span className="avatar" aria-hidden="true">{user.email.slice(0, 1).toUpperCase()}</span>
          <div><strong>{user.email}</strong><span>{role.label}</span></div>
          <button aria-label="Log out" disabled={loggingOut} onClick={() => void logout()} title="Log out" type="button">↗</button>
        </div>
      </aside>

      <main className="dashboard-main" id="main-content">
        <header className="dashboard-mobile-header"><Brand /><button disabled={loggingOut} onClick={() => void logout()} type="button">Log out</button></header>
        <div className="dashboard-topbar">
          <div><span>EcoDrops / {role.short}</span><span className="dashboard-topbar__time">Snapshot {formatDate(dashboard.dashboard.generatedAt)}</span></div>
          <SourceLabel kind="simulated">Synthetic demo data</SourceLabel>
        </div>
        <div className="dashboard-content">
          {notice ? <div className="dashboard-notice"><InlineNotice tone={notice.tone}>{notice.message}<button aria-label="Dismiss message" onClick={() => setNotice(null)} type="button">×</button></InlineNotice></div> : null}
          <section className="dashboard-intro" id="overview">
            <div><p className="eyebrow">{role.label}</p><h1>{role.heading}</h1><p>{role.intro}</p></div>
            <span className="snapshot-id">Scope / {dashboard.dashboard.scope}</span>
          </section>
          <MetricStrip dashboard={dashboard} role={user.role} />

          {user.role === "corp_user" ? <CorporateWorkspace batches={batches} dashboard={dashboard} detail={detail} detailLoading={detailLoading} onNotice={setNotice} onRefresh={refresh} onSelect={selectBatch} selectedBatchId={selectedBatchId} /> : null}
          {user.role === "warehouse_op" ? <WarehouseWorkspace batches={batches} campuses={campuses} detail={detail} detailLoading={detailLoading} onNotice={setNotice} onRefresh={refresh} onSelect={selectBatch} selectedBatchId={selectedBatchId} /> : null}
          {user.role === "campus_admin" ? <CampusWorkspace allocations={workspaceAllocations} batches={batches} dashboard={dashboard} detail={detail} detailLoading={detailLoading} onNotice={setNotice} onRefresh={refresh} onSelect={selectBatch} selectedBatchId={selectedBatchId} /> : null}
          {user.role === "admin" ? <AdminWorkspace batches={batches} campuses={campuses} dashboard={dashboard} detail={detail} detailLoading={detailLoading} onNotice={setNotice} onRefresh={refresh} onSelect={selectBatch} selectedBatchId={selectedBatchId} /> : null}
        </div>
      </main>
    </div>
  );
}

function MetricStrip({ dashboard, role }: { dashboard: DashboardReadModel; role: UserRole }) {
  const { counts, outcomes } = dashboard.dashboard;
  const metrics = role === "campus_admin"
    ? [
        ["Available now", counts.availableItems, "items"],
        ["Observed claims", counts.claims, "claims"],
        ["Kept", outcomes.kept, "observed"],
        ["Unknown", outcomes.unknown, "not inferred"],
      ]
    : [
        ["Registered batches", counts.batches, "records"],
        ["In the receiving loop", counts.pendingWarehouse, "active"],
        ["Certified", counts.certified, "workflow-complete"],
        ["Available inventory", counts.availableItems, "campus items"],
      ];
  return (
    <section className="metric-strip" aria-label="Workspace snapshot">
      {metrics.map(([label, value, unit], index) => (
        <div key={String(label)}><span className="metric-strip__index">0{index + 1}</span><strong>{formatNumber(Number(value))}</strong><p>{label}</p><small>{unit}</small></div>
      ))}
    </section>
  );
}

interface WorkspaceProps {
  batches: BatchSummary[];
  detail: BatchDetail | null;
  detailLoading: boolean;
  selectedBatchId: string | null;
  onSelect: (id: string) => void;
  onRefresh: (id?: string) => Promise<void>;
  onNotice: (notice: { tone: "success" | "warning" | "danger"; message: string } | null) => void;
}

function CorporateWorkspace(props: WorkspaceProps & { dashboard: DashboardReadModel }) {
  return (
    <>
      <section className="workspace-section" id="operations">
        <SectionTitle number="02" eyebrow="Corporate operations" title="Register a new surplus batch" description="Start with a synthetic demonstration invoice or upload a real PDF. Both paths are explicitly labelled in the resulting provenance." />
        <CreateBatchForm onNotice={props.onNotice} onRefresh={props.onRefresh} />
      </section>
      <section className="workspace-section workspace-section--grid">
        <div>
          <SectionTitle eyebrow="Custody queue" title="Your registered batches" description="Select a row to inspect its gates, custody events, estimate, and exports." />
          <BatchTable batches={props.batches} onSelect={props.onSelect} selectedBatchId={props.selectedBatchId} />
        </div>
        <div id="evidence">
          <BatchInspector detail={props.detail} key={props.selectedBatchId ?? "no-batch"} loading={props.detailLoading} onNotice={props.onNotice} onRefresh={props.onRefresh} role="corp_user" />
        </div>
      </section>
      <DisposalComparison data={props.dashboard.disposalComparisonInputs} />
    </>
  );
}

function DisposalComparison({ data }: { data: DashboardReadModel["disposalComparisonInputs"] }) {
  const surplus = data.functionalSurplus;
  return (
    <section className="workspace-section disposal-panel" aria-labelledby="disposal-title">
      <div className="disposal-panel__heading">
        <div><p className="eyebrow">Comparison boundary</p><h2 id="disposal-title">Functional surplus vs. disposal</h2><p>These inputs are visible so an unavailable counterfactual is never mistaken for a calculated climate benefit.</p></div>
        {data.syntheticDemoInputs ? <SourceLabel kind="simulated">Synthetic demo inputs</SourceLabel> : <SourceLabel kind="sourced">Reported inputs</SourceLabel>}
      </div>
      <div className="disposal-panel__body">
        <dl>
          <div><dt>Claimed</dt><dd>{formatNumber(surplus.claimedUnits)} items</dd></div>
          <div><dt>Verified</dt><dd>{formatNumber(surplus.verifiedUnits)} items</dd></div>
          <div><dt>Verified weight</dt><dd>{formatNumber(surplus.verifiedWeightKg)} kg</dd></div>
          <div><dt>Observed claims</dt><dd>{formatNumber(surplus.observedClaims)}</dd></div>
          <div><dt>Retained follow-ups</dt><dd>{formatNumber(surplus.observedRetainedFollowUps)}</dd></div>
          <div><dt>Returned / diverted</dt><dd>{formatNumber(surplus.returnedItems)} / {formatNumber(surplus.divertedItems)}</dd></div>
        </dl>
        <div className="counterfactual-empty"><span>Not calculated</span><strong>— kgCO₂e</strong><p>No disposal-emissions factor is configured. EcoDrops therefore makes no disposal-emissions comparison or climate-benefit claim here.</p></div>
      </div>
      <p className="disposal-panel__notice">{data.notice}</p>
    </section>
  );
}

function CreateBatchForm({ onRefresh, onNotice }: Pick<WorkspaceProps, "onRefresh" | "onNotice">) {
  const [source, setSource] = useState<"synthetic" | "upload">("synthetic");
  const [hsCode, setHsCode] = useState("847130");
  const [hsPolicy, setHsPolicy] = useState<HsPolicyCatalogEntry | null>(null);
  const [policyState, setPolicyState] = useState<"loading" | "ready" | "error">("loading");
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [policyReload, setPolicyReload] = useState(0);
  const [quantity, setQuantity] = useState("80");
  const [unitWeightKg, setUnitWeightKg] = useState("1.2");
  const [declaredValue, setDeclaredValue] = useState("2400");
  const [invoiceIdentifier, setInvoiceIdentifier] = useState("");
  const [authorityAttested, setAuthorityAttested] = useState(false);
  const [invoice, setInvoice] = useState<File | null>(null);
  const [sampleInvoice, setSampleInvoice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sampleLoading, setSampleLoading] = useState(false);
  const yellowLikely = Number(quantity) > 1000 || Number(quantity) * Number(unitWeightKg) > 1000 || (Number(declaredValue) * 100) / Math.max(1, Number(quantity)) > 50000;
  const resolvedPolicy = hsPolicy?.hsCode === hsCode ? hsPolicy : null;

  function beginPolicyReview(nextHsCode: string) {
    setHsPolicy(null);
    setPolicyError(null);
    setPolicyState("loading");
    setHsCode(nextHsCode);
  }

  function retryPolicyLookup() {
    setHsPolicy(null);
    setPolicyError(null);
    setPolicyState("loading");
    setPolicyReload((current) => current + 1);
  }

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    apiRequest<HsPolicyCatalogEntry>(`/catalog/hs-codes/${encodeURIComponent(hsCode)}`, {
      signal: controller.signal,
    })
      .then((policy) => {
        if (!active) return;
        setHsPolicy(policy);
        setPolicyState("ready");
      })
      .catch((error: unknown) => {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        setPolicyError(messageForError(error));
        setPolicyState("error");
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [hsCode, policyReload]);

  async function loadSampleInvoice() {
    setSampleLoading(true);
    onNotice(null);
    try {
      const response = await fetch("/ecodrops-sample-invoice.pdf", { cache: "no-store" });
      if (!response.ok) throw new Error("The sample invoice could not be loaded.");
      const pdf = await response.blob();
      setSource("upload");
      beginPolicyReview("850440");
      setPolicyReload((current) => current + 1);
      setQuantity("80");
      setUnitWeightKg("0.22");
      setDeclaredValue("2400");
      setInvoiceIdentifier("DEMO-INV-2026-0042");
      setInvoice(new File([pdf], "ecodrops-sample-invoice.pdf", { type: "application/pdf" }));
      setSampleInvoice(true);
      setAuthorityAttested(true);
      onNotice({ tone: "success", message: "Sample PDF and all matching invoice values are ready. HS 850440 will resolve to the authoritative electronics / YELLOW policy." });
    } catch (error) {
      onNotice({ tone: "danger", message: messageForError(error) });
    } finally {
      setSampleLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resolvedPolicy || policyState !== "ready") {
      onNotice({ tone: "danger", message: "Resolve the selected HS code against the active policy before creating this batch." });
      return;
    }
    setBusy(true);
    onNotice(null);
    try {
      const form = new FormData();
      form.set("hsCode", hsCode);
      form.set("category", resolvedPolicy.category);
      form.set("quantity", quantity);
      form.set("unitWeightKg", unitWeightKg);
      form.set("declaredValueCents", String(Math.round(Number(declaredValue) * 100)));
      form.set("invoiceIdentifier", invoiceIdentifier);
      form.set("authorityAttested", String(authorityAttested));
      if (source === "synthetic") form.set("syntheticInvoice", "true");
      else if (invoice) form.set("invoice", invoice);
      if (sampleInvoice) form.set("syntheticSample", "true");
      const created = await apiRequest<BatchSummary & { inputProvenance: { invoice: string; clearlySynthetic: boolean } }>("/batches", { method: "POST", body: form });
      onNotice({ tone: "success", message: `Batch ${created.id} created with ${created.inputProvenance.invoice.toLowerCase().replaceAll("_", " ")} provenance and ${resolvedPolicy.policyVersion} HS policy.` });
      setInvoiceIdentifier("");
      setAuthorityAttested(false);
      setInvoice(null);
      setSampleInvoice(false);
      await onRefresh(created.id);
    } catch (error) {
      onNotice({ tone: "danger", message: messageForError(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="operation-form" onSubmit={submit}>
      <div className="operation-form__source">
        <fieldset className="segmented-fieldset">
          <legend>Invoice evidence</legend>
          <label className={source === "synthetic" ? "is-selected" : ""}><input checked={source === "synthetic"} name="invoice-source" onChange={() => { setSource("synthetic"); setSampleInvoice(false); }} type="radio" /><span><SourceLabel kind="simulated">Synthetic invoice</SourceLabel><small>Generated by EcoDrops for this demo.</small></span></label>
          <label className={source === "upload" ? "is-selected" : ""}><input checked={source === "upload"} name="invoice-source" onChange={() => { setSource("upload"); setSampleInvoice(false); }} type="radio" /><span><SourceLabel kind="sourced">Real PDF upload</SourceLabel><small>PDF only, maximum 10 MB.</small></span></label>
        </fieldset>
        <div className="sample-invoice-demo">
          <div><strong>Ready-made working example</strong><small>80 USB-C adapters · HS 850440 · 0.22 kg each · $2,400 · DEMO-INV-2026-0042</small></div>
          <div className="button-row"><button className="button button--small button--dark" disabled={busy || sampleLoading} onClick={() => void loadSampleInvoice()} type="button">{sampleLoading ? "Loading sample…" : "Load PDF + matching values"}</button><a className="button button--small button--ghost" download href="/ecodrops-sample-invoice.pdf">Download sample PDF</a></div>
        </div>
        {source === "upload" ? <label className="file-drop"><input accept="application/pdf" onChange={(event) => { setInvoice(event.target.files?.[0] ?? null); setSampleInvoice(false); }} required type="file" /><span><strong>{invoice?.name ?? "Choose invoice PDF"}</strong><small>Document is consistency-checked, not authenticated.</small></span></label> : <InlineNotice tone="warning">Synthetic input will be unmistakably marked in the API response and audit trail.</InlineNotice>}
      </div>
      <div className="operation-form__fields">
        <div className="form-row form-row--two">
          <label className="field"><span>Reviewed HS code</span><select aria-describedby="hs-policy-review" onChange={(event) => beginPolicyReview(event.target.value)} value={hsCode}>{HS_CODE_OPTIONS.map((option) => <option key={option.code} value={option.code}>{option.code} — {option.label}</option>)}</select></label>
          <label className="field"><span>Invoice reference</span><input maxLength={120} onChange={(event) => setInvoiceIdentifier(event.target.value)} placeholder="INV-2026-0042" required value={invoiceIdentifier} /></label>
        </div>
        <div className={`hs-policy-card${resolvedPolicy ? ` hs-policy-card--${resolvedPolicy.baselineRisk.toLowerCase()}` : ""}`} id="hs-policy-review" aria-live="polite">
          {policyState === "loading" ? <div className="hs-policy-card__loading"><span aria-hidden="true" className="loading-mark" /><span>Reviewing HS {hsCode} against the active policy…</span></div> : null}
          {policyState === "error" ? <div className="hs-policy-card__error"><InlineNotice tone="danger">{policyError ?? "The HS policy could not be resolved."}</InlineNotice><button className="button button--small button--ghost" onClick={retryPolicyLookup} type="button">Retry policy lookup</button></div> : null}
          {resolvedPolicy ? <><div className="hs-policy-card__heading"><div><p className="eyebrow">Authoritative HS policy</p><h3>{resolvedPolicy.category}</h3></div><div className="hs-policy-card__risk"><span>Baseline risk</span><StatusPill value={resolvedPolicy.baselineRisk} /></div></div><dl><div><dt>Decision</dt><dd>{resolvedPolicy.policyDecision}</dd></div><div><dt>Policy version</dt><dd>{resolvedPolicy.policyVersion}</dd></div><div><dt>Compliance</dt><dd>{resolvedPolicy.requiresComplianceAttestation ? "Required before submission" : "Not required by HS baseline"}</dd></div></dl><p className="hs-policy-card__rationale">{resolvedPolicy.rationale}</p><p className="hs-policy-card__notice">{resolvedPolicy.notice}</p>{resolvedPolicy.policyDecision === "BLOCKED" ? <p className="hs-policy-card__blocked"><strong>Blocked policy.</strong> This known code can be recorded as a draft, but it cannot proceed to shipment or certification.</p> : null}</> : null}
        </div>
        <div className="form-row form-row--three">
          <label className="field"><span>Quantity</span><input inputMode="numeric" max={1000000} min={1} onChange={(event) => setQuantity(event.target.value)} required type="number" value={quantity} /></label>
          <label className="field"><span>Unit weight · kg</span><input inputMode="decimal" max={100000} min="0.001" onChange={(event) => setUnitWeightKg(event.target.value)} required step="0.001" type="number" value={unitWeightKg} /></label>
          <label className="field"><span>Declared value · USD</span><input inputMode="decimal" min={0} onChange={(event) => setDeclaredValue(event.target.value)} required step="0.01" type="number" value={declaredValue} /></label>
        </div>
        {yellowLikely ? <InlineNotice tone="warning"><strong>Potential additional YELLOW intake.</strong> Size, weight, or unit value also triggers compliance review when the draft is submitted.</InlineNotice> : null}
        <label className="check-field"><input checked={authorityAttested} onChange={(event) => setAuthorityAttested(event.target.checked)} required type="checkbox" /><span><strong>I have authority to register this surplus.</strong><small>This is an uploader attestation, not document authentication.</small></span></label>
        <button className="button button--dark" disabled={busy || policyState !== "ready" || !resolvedPolicy || (source === "upload" && !invoice)} type="submit">{busy ? "Creating batch…" : policyState === "loading" ? "Reviewing HS policy…" : policyState === "error" ? "Resolve HS policy to continue" : "Create draft batch"}<Arrow /></button>
      </div>
    </form>
  );
}

function WarehouseWorkspace(props: WorkspaceProps & { campuses: CampusSummary[] }) {
  const delivered = props.batches.filter((batch) => batch.status === "DELIVERED");
  return (
    <>
      <section className="workspace-section" id="operations">
        <SectionTitle number="02" eyebrow="Warehouse operations" title="Incoming custody queue" description={`${delivered.length} delivered batch${delivered.length === 1 ? " is" : "es are"} ready for physical reconciliation. All organizations remain visible to this independent role.`} />
        <div className="queue-layout">
          <BatchTable batches={props.batches} onSelect={props.onSelect} selectedBatchId={props.selectedBatchId} />
          <div>
            {props.detailLoading ? <LoadingBlock label="Loading receiving context…" /> : null}
            {!props.detailLoading && props.detail?.batch.status === "DELIVERED" ? <ReceivingForm key={props.detail.batch.id} detail={props.detail} onNotice={props.onNotice} onRefresh={props.onRefresh} /> : null}
            {!props.detailLoading && props.detail?.batch.status !== "DELIVERED" ? <div className="queue-prompt"><p className="eyebrow">Receiving station</p><h3>Select a delivered batch.</h3><p>Only delivered batches can accept a receiving record. Use the highlighted rows in the queue.</p></div> : null}
          </div>
        </div>
      </section>
      <section className="workspace-section" id="evidence">
        <BatchInspector campuses={props.campuses} detail={props.detail} key={props.selectedBatchId ?? "no-batch"} loading={props.detailLoading} onNotice={props.onNotice} onRefresh={props.onRefresh} role="warehouse_op" />
      </section>
    </>
  );
}

function ReceivingForm({ detail, onRefresh, onNotice }: { detail: BatchDetail } & Pick<WorkspaceProps, "onRefresh" | "onNotice">) {
  const expected = detail.batch.quantity * detail.batch.unitWeightKg;
  const initialTare = Math.max(1, expected * 0.05);
  const [gross, setGross] = useState(String(Number((expected + initialTare).toFixed(3))));
  const [tare, setTare] = useState(String(Number(initialTare.toFixed(3))));
  const [sampleScanCount, setSampleScanCount] = useState(String(Math.min(detail.batch.quantity, 12)));
  const [source, setSource] = useState<"synthetic" | "upload">("synthetic");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const net = Math.max(0, Number(gross) - Number(tare));
  const variance = expected === 0 ? 0 : Math.abs(net - expected) / expected * 100;
  const previewTier = variance <= 5 ? "PASS" : variance <= 15 ? "REVIEW" : "REJECT";

  function applyPreset(tier: "PASS" | "REVIEW" | "REJECT") {
    const multiplier = tier === "PASS" ? 1 : tier === "REVIEW" ? 0.9 : 0.8;
    setGross(String(Number((expected * multiplier + Number(tare)).toFixed(3))));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    onNotice(null);
    try {
      const form = new FormData();
      form.set("batchId", detail.batch.id);
      form.set("grossWeightKg", gross);
      form.set("tareWeightKg", tare);
      form.set("sampleScanCount", sampleScanCount);
      if (source === "synthetic") form.set("syntheticEvidence", "true");
      else files.forEach((file) => form.append("evidence", file));
      const result = await apiRequest<{ varianceTier: string; variancePercent: number; verifiedUnits: number; inputProvenance: { evidence: string; scale: string } }>("/receivings", { method: "POST", body: form });
      onNotice({ tone: result.varianceTier === "REJECT" ? "warning" : "success", message: `Receiving recorded: ${result.varianceTier}, ${formatNumber(result.variancePercent)}% variance, ${result.verifiedUnits} verified units. Evidence: ${result.inputProvenance.evidence.toLowerCase().replaceAll("_", " ")}; scale: ${result.inputProvenance.scale.toLowerCase().replaceAll("_", " ")}.` });
      await onRefresh(detail.batch.id);
    } catch (error) {
      onNotice({ tone: "danger", message: messageForError(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="receiving-card" onSubmit={submit}>
      <div className="receiving-card__head"><div><p className="eyebrow">Receiving / {detail.batch.id}</p><h3>Measured reconciliation</h3></div><StatusPill value={previewTier} /></div>
      <p className="receiving-card__expected">Expected <strong>{formatNumber(expected)} kg</strong> · {detail.batch.quantity} × {detail.batch.unitWeightKg} kg</p>
      <fieldset className="preset-group"><legend>Weight presets</legend><button onClick={() => applyPreset("PASS")} type="button">PASS · exact</button><button onClick={() => applyPreset("REVIEW")} type="button">REVIEW · −10%</button><button onClick={() => applyPreset("REJECT")} type="button">REJECT · −20%</button></fieldset>
      <div className="form-row form-row--three"><label className="field"><span>Gross kg</span><input min="0.001" onChange={(event) => setGross(event.target.value)} required step="0.001" type="number" value={gross} /></label><label className="field"><span>Tare kg</span><input min="0" onChange={(event) => setTare(event.target.value)} required step="0.001" type="number" value={tare} /></label><label className="field"><span>Sample scans</span><input max={1000000} min={1} onChange={(event) => setSampleScanCount(event.target.value)} required type="number" value={sampleScanCount} /></label></div>
      <div className="variance-preview"><div><span>Net</span><strong>{formatNumber(net)} kg</strong></div><div><span>Absolute variance</span><strong>{formatNumber(variance)}%</strong></div><div><span>Preview gate</span><StatusPill value={previewTier} /></div></div>
      <fieldset className="evidence-choice"><legend>Evidence source</legend><label><input checked={source === "synthetic"} name={`evidence-${detail.batch.id}`} onChange={() => setSource("synthetic")} type="radio" /> Synthetic demo image</label><label><input checked={source === "upload"} name={`evidence-${detail.batch.id}`} onChange={() => setSource("upload")} type="radio" /> Real JPEG / PNG</label></fieldset>
      {source === "upload" ? <label className="file-drop file-drop--compact"><input accept="image/jpeg,image/png" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} required type="file" /><span><strong>{files.length ? `${files.length} image${files.length === 1 ? "" : "s"} selected` : "Choose 1–8 evidence images"}</strong><small>Each image must be 5 MB or smaller.</small></span></label> : <InlineNotice tone="warning">Both evidence and scale are marked simulated in demo mode.</InlineNotice>}
      <button className="button button--accent button--full" disabled={busy || net <= 0 || (source === "upload" && files.length === 0)} type="submit">{busy ? "Recording receiving…" : "Record receiving"}<Arrow /></button>
    </form>
  );
}

function CampusWorkspace({ allocations, batches, dashboard, detail, detailLoading, onNotice, onRefresh, onSelect, selectedBatchId }: WorkspaceProps & { dashboard: DashboardReadModel; allocations: CampusAllocation[] }) {
  const { inventory, outcomes } = dashboard.inventoryAndOutcomes;
  const maxInventory = Math.max(1, ...Object.values(inventory.byStatus));
  return (
    <>
      <section className="workspace-section campus-grid" id="operations">
        <div className="campus-kiosk-card"><p className="eyebrow eyebrow--light">Live access point</p><h2>Put inventory within reach.</h2><p>Students match by compatibility and need without creating an account or sharing personal information.</p><Link className="button button--accent" href="/kiosk">Launch campus kiosk <Arrow /></Link><span>Campus / org-synthetic-campus</span></div>
        <div className="inventory-panel"><div className="panel-heading"><div><p className="eyebrow">Inventory composition</p><h2>{inventory.total} campus items</h2></div><SourceLabel kind="simulated">Synthetic demo data</SourceLabel></div><div className="bar-list">{Object.entries(inventory.byStatus).map(([status, value]) => <div key={status}><div><span>{status.replaceAll("_", " ")}</span><strong>{value}</strong></div><span className="bar-track"><i style={{ width: `${value / maxInventory * 100}%` }} /></span></div>)}</div><p className="panel-foot">{inventory.totalCirculations} observed recirculation{inventory.totalCirculations === 1 ? "" : "s"} across current inventory.</p></div>
      </section>
      <InboundCampusAllocations allocations={allocations} onNotice={onNotice} onRefresh={onRefresh} />
      <section className="workspace-section outcome-panel">
        <SectionTitle number="04" eyebrow="Observed outcomes" title="Unknown remains visible" description="Decisions and follow-ups are counted as recorded. Missing responses are not inferred into successful retention." />
        <div className="outcome-grid"><OutcomeDial value={outcomes.kept} total={outcomes.claims} label="Kept" tone="pine" /><OutcomeDial value={outcomes.returned} total={outcomes.claims} label="Returned" tone="coral" /><OutcomeDial value={outcomes.recirculated} total={outcomes.claims} label="Recirculated" tone="cobalt" /><OutcomeDial value={outcomes.diverted} total={outcomes.claims} label="Diverted" tone="yellow" /><OutcomeDial value={outcomes.unknown} total={outcomes.claims} label="Unknown" tone="neutral" /></div>
        <div className="outcome-ledger"><div><span>Decision mix</span><p><strong>{outcomes.decisions.keep}</strong> keep · <strong>{outcomes.decisions.swap}</strong> swap · <strong>{outcomes.decisions.return}</strong> return · <strong>{outcomes.decisions.pending}</strong> pending</p></div><div><span>Follow-up state</span><p><strong>{outcomes.followUps.inUse}</strong> in use · <strong>{outcomes.followUps.passedOn}</strong> passed on · <strong>{outcomes.followUps.returning}</strong> returning · <strong>{outcomes.followUps.noAnswer + outcomes.followUps.notRecorded}</strong> unknown</p></div></div>
      </section>
      <section className="workspace-section workspace-section--grid" id="evidence"><div><SectionTitle eyebrow="Campus-linked batches" title="Inventory provenance" description="Only batches represented in this campus inventory are visible here." /><BatchTable batches={batches} onSelect={onSelect} selectedBatchId={selectedBatchId} /></div><BatchInspector detail={detail} key={selectedBatchId ?? "no-batch"} loading={detailLoading} onNotice={onNotice} onRefresh={onRefresh} role="campus_admin" /></section>
    </>
  );
}

function OutcomeDial({ value, total, label, tone }: { value: number; total: number; label: string; tone: string }) {
  const percentage = total > 0 ? Math.round(value / total * 100) : 0;
  return <div className={`outcome-dial outcome-dial--${tone}`} style={{ "--outcome": `${percentage * 3.6}deg` } as CSSProperties}><div><strong>{value}</strong><span>{percentage}%</span></div><p>{label}</p></div>;
}

function AdminWorkspace(props: WorkspaceProps & { dashboard: DashboardReadModel; campuses: CampusSummary[] }) {
  const router = useRouter();
  const [audit, setAudit] = useState<AuditVerification | null>(null);
  const [methodology, setMethodology] = useState<MethodologyReadModel | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  async function verifyAudit() {
    setBusy("audit");
    try {
      const result = await apiRequest<AuditVerification>("/audit/verify");
      setAudit(result);
      props.onNotice({ tone: result.valid ? "success" : "danger", message: result.valid ? `Audit chain verified across ${result.checkedEvents} events.` : `Audit chain break found at sequence ${result.firstBrokenEvent?.sequence ?? "unknown"}.` });
    } catch (error) { props.onNotice({ tone: "danger", message: messageForError(error) }); }
    finally { setBusy(null); }
  }
  async function loadMethodology() {
    setBusy("method");
    try { setMethodology(await apiRequest<MethodologyReadModel>("/methodology")); }
    catch (error) { props.onNotice({ tone: "danger", message: messageForError(error) }); }
    finally { setBusy(null); }
  }
  async function resetDemo() {
    setBusy("reset");
    try {
      await postJson<{ synthetic: true }>("/admin/reset");
      router.replace("/login");
      router.refresh();
    } catch (error) { props.onNotice({ tone: "danger", message: messageForError(error) }); setBusy(null); }
  }

  return (
    <>
      <section className="workspace-section admin-actions" id="operations">
        <SectionTitle number="02" eyebrow="Platform controls" title="Integrity, method, reset" description="Administrative actions are explicit. Reset replaces the synthetic dataset and invalidates every active session, including yours." />
        <div className="admin-action-grid">
          <article><span className="admin-action-grid__icon">#</span><p className="eyebrow">Audit chain</p><h3>{audit ? (audit.valid ? "Chain intact" : "Break detected") : "Ready to verify"}</h3><p>{audit ? `${audit.checkedEvents} events checked · head ${shortHash(audit.headHash)}` : "Recompute every link from genesis through the current event head."}</p><button className="button button--dark" disabled={busy !== null} onClick={() => void verifyAudit()} type="button">{busy === "audit" ? "Verifying…" : "Verify audit chain"}<Arrow /></button></article>
          <article><span className="admin-action-grid__icon">ƒ</span><p className="eyebrow">Active methodology</p><h3>{methodology?.methodologies[0]?.version ?? "Load current model"}</h3><p>{methodology ? `${methodology.methodologies[0]?.factors.length ?? 0} factor categories · ${methodology.methodologies[0]?.formulaVersion ?? "version unavailable"}` : "Inspect server-projected source, assumptions, factors, and formula version."}</p><button className="button button--ghost" disabled={busy !== null} onClick={() => void loadMethodology()} type="button">{busy === "method" ? "Loading…" : "Inspect methodology"}<Arrow /></button></article>
          <article className="admin-action-grid__danger"><span className="admin-action-grid__icon">↺</span><p className="eyebrow">Demo dataset</p><h3>Reset synthetic state</h3><p>Destructive for demo data and sessions. It does not affect a production dataset.</p>{confirmReset ? <div className="confirm-row"><button className="button button--danger" disabled={busy !== null} onClick={() => void resetDemo()} type="button">{busy === "reset" ? "Resetting…" : "Yes, reset and sign out"}</button><button className="button button--ghost" onClick={() => setConfirmReset(false)} type="button">Cancel</button></div> : <button className="button button--ghost" disabled={busy !== null} onClick={() => setConfirmReset(true)} type="button">Reset demo…</button>}</article>
        </div>
        {methodology ? <div className="method-inspector"><div><p className="eyebrow">Server-projected method</p><h3>{methodology.label}</h3></div><code>{methodology.formula}</code><p>{methodology.disclosure}</p><Link href="/methodology">Open public explanation →</Link></div> : null}
      </section>
      <section className="workspace-section workspace-section--grid" id="evidence"><div><SectionTitle eyebrow="Platform batches" title="Global custody view" description="Admin scope includes all organizations represented in the current dataset." /><BatchTable batches={props.batches} onSelect={props.onSelect} selectedBatchId={props.selectedBatchId} /></div><BatchInspector campuses={props.campuses} detail={props.detail} key={props.selectedBatchId ?? "no-batch"} loading={props.detailLoading} onNotice={props.onNotice} onRefresh={props.onRefresh} role="admin" /></section>
    </>
  );
}

function SectionTitle({ number, eyebrow, title, description }: { number?: string; eyebrow: string; title: string; description: string }) {
  return <div className="workspace-title">{number ? <span>{number}</span> : null}<div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{description}</p></div></div>;
}

function BatchTable({ batches, selectedBatchId, onSelect }: { batches: BatchSummary[]; selectedBatchId: string | null; onSelect: (id: string) => void }) {
  if (batches.length === 0) return <EmptyState title="No batches yet">The first registered surplus batch will appear here.</EmptyState>;
  return (
    <div className="table-scroll batch-table-wrap" tabIndex={0}>
      <table className="data-table batch-table">
        <caption className="sr-only">Select a batch to inspect its current status, owner, evidence, and estimate</caption>
        <thead><tr><th>Batch / organization</th><th>Category</th><th>Units</th><th>Risk</th><th>Status</th><th>Set by</th><th><span className="sr-only">Inspect</span></th></tr></thead>
        <tbody>{batches.map((batch) => {
          const selected = selectedBatchId === batch.id;
          const select = () => onSelect(batch.id);
          return (
            <tr
              aria-label={`View ${batch.id}, ${batch.status}, set by ${STATUS_OWNER[batch.status]}`}
              aria-pressed={selected}
              className={selected ? "is-selected" : ""}
              key={batch.id}
              onClick={select}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  select();
                }
              }}
              role="button"
              tabIndex={0}
            >
              <th scope="row"><span className="batch-row-label"><strong>{batch.id.replace("batch-synthetic-", "")}</strong><small>{batch.organizationName}</small></span></th>
              <td>{batch.category}</td>
              <td>{formatNumber(batch.quantity)}</td>
              <td>{batch.riskTier ? <StatusPill value={batch.riskTier} /> : <span className="muted">Not assessed</span>}</td>
              <td><StatusPill value={batch.status} /></td>
              <td><span className="status-owner">{STATUS_OWNER[batch.status]}</span></td>
              <td><span aria-hidden="true" className="row-arrow">→</span></td>
            </tr>
          );
        })}</tbody>
      </table>
      <p className="batch-table-hint">Select anywhere on a row, or focus it and press Enter, to open that batch.</p>
    </div>
  );
}

function BatchInspector({ detail, loading, role, campuses = [], onRefresh, onNotice }: { detail: BatchDetail | null; loading: boolean; role: UserRole; campuses?: CampusSummary[]; onRefresh?: (id?: string) => Promise<void>; onNotice?: WorkspaceProps["onNotice"] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [compliance, setCompliance] = useState(false);
  const [reviewReason, setReviewReason] = useState("");
  const canManageTransit = role === "corp_user" || role === "admin";
  const canAdvance = role === "corp_user" || role === "warehouse_op" || role === "admin";
  const canCertify = role === "warehouse_op" || role === "admin";

  async function act(action: string, operation: () => Promise<unknown>, success: string) {
    if (!detail || !onRefresh || !onNotice) return;
    setBusy(action);
    try { await operation(); onNotice({ tone: "success", message: success }); await onRefresh(detail.batch.id); }
    catch (error) { onNotice({ tone: "danger", message: messageForError(error) }); }
    finally { setBusy(null); }
  }
  async function exportRecord(kind: "json" | "pdf") {
    if (!detail?.certificate || !onNotice) return;
    setBusy(kind);
    try { if (kind === "json") await downloadCertificateJson(detail.certificate.recordId); else await downloadCertificatePdf(detail.certificate.recordId); onNotice({ tone: "success", message: `${kind.toUpperCase()} export downloaded.` }); }
    catch (error) { onNotice({ tone: "danger", message: messageForError(error) }); }
    finally { setBusy(null); }
  }

  if (loading) return <LoadingBlock label="Loading batch evidence…" />;
  if (!detail) return <EmptyState title="Select a batch">Its custody evidence, estimate, and audit timeline will appear here.</EmptyState>;
  const { batch, estimate } = detail;
  const scenarios = (["low", "base", "high"] as const).map((name) => ({ name, ...estimate.scenarios[name] }));
  const showCertificationGates = batch.status === "RECEIVED" || batch.status === "UNDER_REVIEW";
  const receivingPairReady =
    (batch.status === "RECEIVED" && detail.receiving?.varianceTier === "PASS") ||
    (batch.status === "UNDER_REVIEW" && detail.receiving?.varianceTier === "REVIEW");
  const complianceReady = batch.riskTier === "GREEN" || (batch.riskTier === "YELLOW" && batch.complianceAttested);
  const evidenceReady = (detail.receiving?.evidencePhotoCount ?? 0) > 0 && (detail.receiving?.sampleScanCount ?? 0) > 0;
  const certificationReady = receivingPairReady && complianceReady && evidenceReady;
  const reviewReasonRequired = batch.status === "UNDER_REVIEW";
  const reviewReasonReady = !reviewReasonRequired || reviewReason.trim().length >= 8;

  return (
    <article className="batch-inspector">
      <header className="batch-inspector__header"><div><p className="eyebrow">Batch detail</p><h2>{batch.category}</h2><code>{batch.id}</code><span className="batch-status-owner">Current status set by {STATUS_OWNER[batch.status]}</span></div><div className="pill-stack"><StatusPill value={batch.status} />{batch.riskTier ? <StatusPill value={batch.riskTier} /> : null}</div></header>
      <div className="batch-facts"><div><span>Declared units</span><strong>{formatNumber(batch.quantity)}</strong></div><div><span>Declared weight</span><strong>{formatNumber(batch.quantity * batch.unitWeightKg)} kg</strong></div><div><span>Declared value</span><strong>{formatMoney(batch.declaredValueCents)}</strong></div><div><span>HS code</span><strong>{batch.hsCode}</strong></div></div>

      {(["DRAFT", "PENDING_VERIFICATION", "IN_TRANSIT", "DELIVERED"] as BatchStatus[]).includes(batch.status) && (canManageTransit || canAdvance) ? (
        <section className="inspector-actions"><p className="eyebrow">Available action</p>
          {batch.status === "DRAFT" && canManageTransit ? <div><label className="check-field check-field--compact"><input checked={compliance} onChange={(event) => setCompliance(event.target.checked)} type="checkbox" /><span><strong>Compliance attestation</strong><small>Required if server assessment returns YELLOW. RED cannot proceed.</small></span></label><button className="button button--accent button--full" disabled={busy !== null} onClick={() => void act("submit", () => postJson(`/batches/${encodeURIComponent(batch.id)}/submit`, { complianceAttested: compliance }), "Batch submitted through versioned intake gates.")} type="button">{busy === "submit" ? "Submitting…" : "Submit for verification"}<Arrow /></button></div> : null}
          {batch.status === "PENDING_VERIFICATION" && canManageTransit ? <button className="button button--accent button--full" disabled={busy !== null} onClick={() => void act("ship", () => postJson("/shipments", { batchId: batch.id }), "Simulated shipment created and custody advanced to in transit.")} type="button">{busy === "ship" ? "Creating shipment…" : "Create shipment"}<Arrow /></button> : null}
          {batch.status === "IN_TRANSIT" && detail.shipment?.simulated && canAdvance ? <div><SourceLabel kind="simulated">Simulated carrier event</SourceLabel><button className="button button--accent button--full" disabled={busy !== null} onClick={() => void act("advance", () => postJson(`/demo/shipments/${encodeURIComponent(detail.shipment?.id ?? "")}/advance`), "Simulated carrier marked the shipment delivered.")} type="button">{busy === "advance" ? "Advancing…" : "Advance to delivered"}<Arrow /></button></div> : null}
          {batch.status === "DELIVERED" && canCertify ? <p className="action-note">Complete the receiving station above before certification becomes available.</p> : null}
        </section>
      ) : null}

      {showCertificationGates ? (
        <section className="certification-gates" aria-labelledby={`certification-gates-${batch.id}`}>
          <div className="certification-gates__heading"><div><p className="eyebrow">Certification gates</p><h3 id={`certification-gates-${batch.id}`}>{batch.status === "RECEIVED" ? "Direct PASS path" : "Reasoned REVIEW path"}</h3></div>{detail.receiving ? <StatusPill value={detail.receiving.varianceTier} /> : null}</div>
          <ul className="gate-list">
            <li className={receivingPairReady ? "is-pass" : "is-fail"}><span aria-hidden="true">{receivingPairReady ? "✓" : "×"}</span><div><strong>Receiving state and variance</strong><small>{batch.status} + {detail.receiving?.varianceTier ?? "no receiving record"} {receivingPairReady ? "is an eligible pair" : "cannot certify"}.</small></div></li>
            <li className={complianceReady ? "is-pass" : "is-fail"}><span aria-hidden="true">{complianceReady ? "✓" : "×"}</span><div><strong>Intake risk</strong><small>{batch.riskTier === "YELLOW" ? `YELLOW risk · compliance ${batch.complianceAttested ? "was attested earlier" : "is missing"}` : batch.riskTier === "GREEN" ? "GREEN risk is eligible" : `${batch.riskTier ?? "Unassessed"} risk cannot certify`}.</small></div></li>
            <li className={evidenceReady ? "is-pass" : "is-fail"}><span aria-hidden="true">{evidenceReady ? "✓" : "×"}</span><div><strong>Independent receiving evidence</strong><small>{detail.receiving?.evidencePhotoCount ?? 0} image{detail.receiving?.evidencePhotoCount === 1 ? "" : "s"} · {detail.receiving?.sampleScanCount ?? 0} sample scan{detail.receiving?.sampleScanCount === 1 ? "" : "s"}.</small></div></li>
            <li className={canCertify ? "is-pass" : "is-pending"}><span aria-hidden="true">{canCertify ? "✓" : "→"}</span><div><strong>Independent approval role</strong><small>{canCertify ? "This warehouse/admin session may certify." : "A warehouse or platform administrator must certify."}</small></div></li>
          </ul>
          <p className="certification-gates__clarifier"><strong>YELLOW is a risk tier, not a workflow status.</strong> It is certifiable only when compliance was attested before receiving.</p>
          {canCertify && certificationReady ? <div className="certify-box">{reviewReasonRequired ? <label className="field"><span>Review reason · at least 8 characters</span><textarea aria-describedby={`review-help-${batch.id}`} maxLength={500} minLength={8} onChange={(event) => setReviewReason(event.target.value)} placeholder="Explain why this REVIEW variance is acceptable…" rows={3} value={reviewReason} /><small className="field-hint" id={`review-help-${batch.id}`}>{reviewReason.trim().length}/8 minimum characters</small></label> : <p>All PASS, evidence, intake-risk, and approver gates are ready for direct certification.</p>}<button className="button button--accent button--full" disabled={busy !== null || !reviewReasonReady} onClick={() => void act("certify", () => postJson(`/batches/${encodeURIComponent(batch.id)}/certify`, reviewReasonRequired ? { reviewReason } : {}), "Certified estimate record created with an immutable snapshot.")} type="button">{busy === "certify" ? "Certifying…" : reviewReasonRequired ? "Certify with review reason" : "Certify eligible record"}<Arrow /></button></div> : <p className="certification-gates__result">{certificationReady ? "Gate evidence is ready; certification remains read-only for this role." : "Certification is unavailable until every required gate passes."}</p>}
        </section>
      ) : null}

      {!showCertificationGates && (batch.status === "REJECTED" || batch.riskTier === "RED") ? <section className="certification-stop"><p className="eyebrow">Certification unavailable</p><strong>{batch.riskTier === "RED" ? "RED intake risk cannot be certified." : "Rejected receiving evidence cannot be certified."}</strong><span>A new eligible workflow record is required; this record cannot bypass the gate.</span></section> : null}

      <details className="inspector-section" open><summary><span>Invoice checks</span><span>{Object.values(batch.invoiceChecks).filter(Boolean).length}/4 passed</span></summary><div className="check-grid">{Object.entries(batch.invoiceChecks).map(([label, passed]) => <span className={passed ? "is-pass" : "is-fail"} key={label}><CheckIcon />{label}</span>)}<span className={batch.authorityAttested ? "is-pass" : "is-fail"}><CheckIcon />authority attested</span><span className={batch.complianceAttested ? "is-pass" : "is-neutral"}><CheckIcon />compliance attested</span></div><p className="detail-note">Format and consistency checks are not invoice authentication.</p></details>

      {detail.shipment ? <details className="inspector-section" open><summary><span>Shipment custody</span><StatusPill value={detail.shipment.status} /></summary><div className="shipment-meta"><code>{detail.shipment.trackingReference}</code><SourceLabel kind={detail.shipment.simulated ? "simulated" : "sourced"}>{detail.shipment.simulated ? "Simulated carrier" : "Signed webhook"}</SourceLabel></div><ol className="mini-timeline">{detail.shipment.events.map((event, index) => <li key={`${event.status}-${event.occurredAt}-${index}`}><i /><div><strong>{event.status.replaceAll("_", " ")}</strong><span>{formatDate(event.occurredAt)} · {event.source.replaceAll("_", " ")}</span></div></li>)}</ol></details> : null}

      {detail.receiving ? <details className="inspector-section" open><summary><span>Receiving evidence</span><StatusPill value={detail.receiving.varianceTier} /></summary><div className="receiving-facts"><div><span>Net / expected</span><strong>{formatNumber(detail.receiving.netWeightKg)} / {formatNumber(detail.receiving.expectedWeightKg)} kg</strong></div><div><span>Variance</span><strong>{formatNumber(detail.receiving.variancePercent)}%</strong></div><div><span>Verified units</span><strong>{detail.receiving.verifiedUnits}</strong></div><div><span>Evidence</span><strong>{detail.receiving.evidencePhotoCount} image{detail.receiving.evidencePhotoCount === 1 ? "" : "s"}</strong></div></div>{detail.receiving.reviewReason ? <p className="review-reason"><strong>Review rationale</strong>{detail.receiving.reviewReason}</p> : null}<SourceLabel kind="simulated">Scale simulated in demo mode</SourceLabel></details> : null}

      <details className="inspector-section inspector-section--estimate" open><summary><span>{estimate.label}</span><SourceLabel kind="estimated">{estimate.verified ? "Certified estimate" : "Pre-certification estimate"}</SourceLabel></summary><div className="estimate-scenarios">{scenarios.map((scenario) => <div className={scenario.name === "base" ? "is-base" : ""} key={scenario.name}><span>{scenario.name}</span><strong>{formatNumber(scenario.estimatedAvoidedEmissionsKgCO2e)}</strong><small>kgCO₂e</small><p>{Math.round(scenario.displacementRate * 100)}% displacement · {Math.round(scenario.retentionRate * 100)}% retention</p></div>)}</div><dl className="estimate-meta"><div><dt>Eligible units</dt><dd>{estimate.eligibleUnits}</dd></div><div><dt>Factor version</dt><dd>{estimate.factorVersion}</dd></div><div><dt>Sample sizes</dt><dd>n={estimate.sampleSizes.displacement} / {estimate.sampleSizes.retention}</dd></div><div><dt>Formula</dt><dd>{estimate.formulaVersion}</dd></div></dl><p className="detail-note">Estimated avoided emissions—not a carbon credit, offset, Scope 3 deduction, tax record, or third-party audit.</p></details>

      {detail.certificate ? (
        <section className="certificate-box">
          <div className="certificate-box__mark"><CheckIcon /></div>
          <div className="certificate-box__content">
            <p className="eyebrow">Certified record</p>
            <h3>{detail.certificate.recordId}</h3>
            <p>Issued {formatDate(detail.certificate.issueDate)} · audit {shortHash(detail.certificate.auditHash)}</p>
            <div className="button-row">
              <button className="button button--small button--dark" disabled={busy !== null} onClick={() => void exportRecord("json")} type="button">{busy === "json" ? "Preparing…" : "Download JSON"}</button>
              <button className="button button--small button--ghost" disabled={busy !== null} onClick={() => void exportRecord("pdf")} type="button">{busy === "pdf" ? "Preparing…" : "Download PDF"}</button>
              <Link className="button button--small button--ghost" href={`/verify/${encodeURIComponent(detail.certificate.recordId)}`}>Public view ↗</Link>
            </div>
          </div>
          <Link aria-label={`Open public verification for ${detail.certificate.recordId}`} className="certificate-qr" href={`/verify/${encodeURIComponent(detail.certificate.recordId)}`}>
            <PublicVerificationQr recordId={detail.certificate.recordId} />
            <span>Scan to verify</span>
          </Link>
        </section>
      ) : null}

      <DistributionAndAllocations campuses={campuses} detail={detail} key={batch.id} onNotice={onNotice} onRefresh={onRefresh} role={role} />

      <details className="inspector-section"><summary><span>Audit timeline</span><span>{detail.recentAuditTimeline.length} events</span></summary><ol className="audit-list">{detail.recentAuditTimeline.map((event) => <li key={event.eventId}><span>{event.sequence}</span><div><strong>{event.eventType.replaceAll("_", " ")}</strong><small>{formatDate(event.occurredAt)} · {event.actorRole?.replaceAll("_", " ") ?? "system"}</small><code title={event.hash}>{shortHash(event.hash)}</code></div></li>)}</ol></details>
    </article>
  );
}

interface ReceiptDefaults {
  labelPrefix: string;
  compatibility: Record<string, string>;
  needTags: string[];
}

function receiptDefaultsFor(category: string): ReceiptDefaults {
  switch (category.trim().toLowerCase()) {
    case "electronics":
      return {
        labelPrefix: "USB-C Adapter",
        compatibility: { connector: "usb-c" },
        needTags: ["coursework", "remote-learning"],
      };
    case "apparel":
      return {
        labelPrefix: "Campus Apparel",
        compatibility: {},
        needTags: ["job-search", "coursework"],
      };
    case "study supplies":
      return {
        labelPrefix: "Study Kit",
        compatibility: {},
        needTags: ["coursework", "creative-project"],
      };
    default:
      return {
        labelPrefix: "EcoDrops Item",
        compatibility: {},
        needTags: ["coursework"],
      };
  }
}

function InboundCampusAllocations({ allocations, onRefresh, onNotice }: { allocations: CampusAllocation[] } & Pick<WorkspaceProps, "onRefresh" | "onNotice">) {
  const ordered = [...allocations].sort((left, right) => {
    if (left.status !== right.status) return left.status === "ALLOCATED" ? -1 : 1;
    return right.createdAt.localeCompare(left.createdAt);
  });
  const pending = allocations.filter((allocation) => allocation.status === "ALLOCATED").length;

  return (
    <section className="workspace-section inbound-allocations" aria-label="Inbound campus allocations">
      <div className="inbound-allocations__heading">
        <SectionTitle number="03" eyebrow="Campus receiving" title="Inbound campus allocations" description="Warehouse allocations remain in transit to campus inventory until this campus records receipt. Items become AVAILABLE to the kiosk only after receipt." />
        <div className="inbound-allocations__count"><strong>{pending}</strong><span>awaiting receipt</span></div>
      </div>
      {ordered.length === 0 ? <EmptyState title="No inbound allocations">Certified goods allocated to this campus will appear here for receipt.</EmptyState> : <div className="inbound-allocation-list">{ordered.map((allocation) => <CampusAllocationReceiptCard allocation={allocation} key={allocation.id} onNotice={onNotice} onRefresh={onRefresh} />)}</div>}
    </section>
  );
}

function CampusAllocationReceiptCard({ allocation, onRefresh, onNotice }: { allocation: CampusAllocation } & Pick<WorkspaceProps, "onRefresh" | "onNotice">) {
  const [busy, setBusy] = useState(false);
  const receiptKey = useRef<string | null>(null);
  const defaults = receiptDefaultsFor(allocation.category);

  async function receive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    onNotice(null);
    receiptKey.current ??= idempotencyKey(`receive-${allocation.id}`);
    try {
      const result = await postJson<AllocationReceiptResult>(
        `/allocations/${encodeURIComponent(allocation.id)}/receive`,
        defaults,
        { "Idempotency-Key": receiptKey.current },
      );
      receiptKey.current = null;
      onNotice({ tone: "success", message: `Received ${result.itemsCreated} ${allocation.category} item${result.itemsCreated === 1 ? "" : "s"}. They are now AVAILABLE to this campus kiosk.` });
      await onRefresh(allocation.batchId);
    } catch (error) {
      onNotice({ tone: "danger", message: messageForError(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`inbound-allocation-card${allocation.status === "ALLOCATED" ? " is-pending" : ""}`}>
      <header><div><p className="eyebrow">From {allocation.sourceOrganizationName}</p><h3>{allocation.category}</h3></div><StatusPill value={allocation.status} /></header>
      <dl><div><dt>Batch</dt><dd><code>{allocation.batchId}</code></dd></div><div><dt>Quantity</dt><dd>{formatNumber(allocation.quantity)} items</dd></div><div><dt>Campus</dt><dd>{allocation.campusName}</dd></div><div><dt>Allocated</dt><dd>{formatDate(allocation.createdAt)}</dd></div></dl>
      {allocation.status === "ALLOCATED" ? <form className="campus-receipt-form" onSubmit={receive}><div><strong>Safe kiosk defaults</strong><span>Label “{defaults.labelPrefix}” · {Object.keys(defaults.compatibility).length ? "connector usb-c · " : ""}needs {defaults.needTags.join(" + ")}</span></div><p>Receipt materializes {allocation.quantity} item{allocation.quantity === 1 ? "" : "s"} as AVAILABLE. Nothing reaches kiosk matching before this action.</p><button className="button button--accent" disabled={busy} type="submit">{busy ? "Receiving allocation…" : `Receive ${allocation.quantity} items`}<Arrow /></button></form> : <div className="campus-receipt-complete"><span className="campus-receipt-complete__mark" aria-hidden="true"><CheckIcon /></span><div><strong>{allocation.itemCount} item{allocation.itemCount === 1 ? "" : "s"} received</strong><span>{allocation.receivedAt ? formatDate(allocation.receivedAt) : "Receipt date unavailable"} · available to campus inventory</span></div></div>}
    </article>
  );
}

function DistributionAndAllocations({ detail, role, campuses, onRefresh, onNotice }: { detail: BatchDetail; role: UserRole; campuses: CampusSummary[]; onRefresh?: WorkspaceProps["onRefresh"]; onNotice?: WorkspaceProps["onNotice"] }) {
  const { distribution } = detail;
  const canAllocate = role === "warehouse_op" || role === "admin";
  const allocationState = detail.batch.status === "CERTIFIED" || detail.batch.status === "DISTRIBUTING";
  const committedUnits = distribution.existingItemCount + distribution.pendingAllocationQuantity;
  const committedPercent = distribution.verifiedUnits > 0
    ? Math.min(100, committedUnits / distribution.verifiedUnits * 100)
    : 0;

  return (
    <section className="distribution-panel" aria-labelledby={`distribution-${detail.batch.id}`}>
      <div className="distribution-panel__heading"><div><p className="eyebrow">Campus distribution</p><h3 id={`distribution-${detail.batch.id}`}>Verified capacity and allocation ledger</h3></div>{distribution.fullyDistributed ? <StatusPill value="CLOSED" /> : <StatusPill value={detail.batch.status} />}</div>
      <div className="distribution-capacity" aria-label="Distribution capacity">
        <div><span>Verified</span><strong>{formatNumber(distribution.verifiedUnits)}</strong><small>receiving units</small></div>
        <div><span>Existing items</span><strong>{formatNumber(distribution.existingItemCount)}</strong><small>materialized</small></div>
        <div><span>Pending</span><strong>{formatNumber(distribution.pendingAllocationQuantity)}</strong><small>reserved units</small></div>
        <div><span>Remaining</span><strong>{formatNumber(distribution.remainingCapacity)}</strong><small>allocatable units</small></div>
      </div>
      <div className="distribution-meter" aria-label={`${formatNumber(committedUnits)} of ${formatNumber(distribution.verifiedUnits)} verified units committed`} role="img"><span><i style={{ width: `${committedPercent}%` }} /></span><small>{formatNumber(distribution.receivedAllocationQuantity)} received allocation units · {formatNumber(distribution.totalAllocationQuantity)} total allocated</small></div>
      <p className="distribution-note">Remaining capacity is the server-authoritative balance after materialized items and pending reservations; displayed totals are not added together to recalculate it.</p>

      {canAllocate && allocationState ? <div className="allocation-action"><div><p className="eyebrow">Allocate certified goods</p><h4>Reserve verified units for a campus</h4></div>{distribution.remainingCapacity <= 0 ? <InlineNotice tone="info">No verified capacity remains available for another allocation.</InlineNotice> : campuses.length === 0 ? <InlineNotice tone="warning">No campus directory entries are available.</InlineNotice> : onRefresh && onNotice ? <CampusAllocationForm campuses={campuses} detail={detail} onNotice={onNotice} onRefresh={onRefresh} /> : null}</div> : null}

      <div className="allocation-ledger"><div className="allocation-ledger__heading"><strong>Read-only allocation ledger</strong><span>{detail.allocations.length} allocation{detail.allocations.length === 1 ? "" : "s"} visible to this role</span></div>{detail.allocations.length === 0 ? <p className="allocation-ledger__empty">No campus allocation has been recorded for this batch.</p> : <ul>{detail.allocations.map((allocation) => <li key={allocation.id}><div><strong>{allocation.sourceOrganizationName} <span aria-hidden="true">→</span> {allocation.campusName}</strong><small>{allocation.category} · {formatNumber(allocation.quantity)} items · created {formatDate(allocation.createdAt)}</small></div><div><StatusPill value={allocation.status} /><small>{allocation.status === "RECEIVED" ? `${allocation.itemCount} items · ${allocation.receivedAt ? formatDate(allocation.receivedAt) : "date unavailable"}` : "Awaiting campus receipt"}</small></div></li>)}</ul>}</div>
    </section>
  );
}

function CampusAllocationForm({ campuses, detail, onRefresh, onNotice }: { campuses: CampusSummary[]; detail: BatchDetail } & Pick<WorkspaceProps, "onRefresh" | "onNotice">) {
  const maximum = Math.min(500, detail.distribution.remainingCapacity);
  const [campusOrganizationId, setCampusOrganizationId] = useState(campuses[0]?.id ?? "");
  const [quantity, setQuantity] = useState(String(Math.min(50, maximum)));
  const [busy, setBusy] = useState(false);
  const intent = useRef<{ signature: string; key: string } | null>(null);
  const numericQuantity = Number(quantity);
  const validQuantity = Number.isSafeInteger(numericQuantity) && numericQuantity >= 1 && numericQuantity <= maximum;

  async function allocate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!campusOrganizationId || !validQuantity) {
      onNotice({ tone: "danger", message: `Choose a campus and a whole-number quantity between 1 and ${maximum}.` });
      return;
    }
    const signature = `${detail.batch.id}:${campusOrganizationId}:${numericQuantity}`;
    if (intent.current?.signature !== signature) {
      intent.current = { signature, key: idempotencyKey(`allocate-${detail.batch.id}`) };
    }
    setBusy(true);
    onNotice(null);
    try {
      const result = await postJson<AllocationMutationResult>(
        `/batches/${encodeURIComponent(detail.batch.id)}/allocations`,
        { campusOrganizationId, quantity: numericQuantity },
        { "Idempotency-Key": intent.current.key },
      );
      intent.current = null;
      onNotice({ tone: "success", message: `${numericQuantity} items allocated to ${result.allocation.campusName}. ${result.distribution.remainingCapacity} verified units remain.` });
      await onRefresh(detail.batch.id);
    } catch (error) {
      onNotice({ tone: "danger", message: messageForError(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="campus-allocation-form" onSubmit={allocate}>
      <label className="field"><span>Destination campus</span><select onChange={(event) => setCampusOrganizationId(event.target.value)} required value={campusOrganizationId}>{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}{campus.synthetic ? " · synthetic demo" : ""}</option>)}</select></label>
      <label className="field"><span>Quantity · maximum {maximum}</span><input inputMode="numeric" max={maximum} min={1} onChange={(event) => setQuantity(event.target.value)} required step={1} type="number" value={quantity} /></label>
      <button className="button button--accent" disabled={busy || !validQuantity || !campusOrganizationId} type="submit">{busy ? "Allocating…" : "Allocate"}<Arrow /></button>
      <small>A stable idempotency key protects retries for this campus-and-quantity intent. Campus receipt creates kiosk inventory.</small>
    </form>
  );
}
