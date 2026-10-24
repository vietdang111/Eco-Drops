# EcoDrops

EcoDrops is a hackathon demonstration of a surplus-to-campus reuse loop: a corporate partner registers safe, functional goods; an independent warehouse reconciles custody and weight; a campus kiosk matches inventory without student accounts; and EcoDrops publishes transparent low/base/high **estimated avoided-emissions** records with explicit assumptions and a privacy-minimized public verifier. **Hackathon track: Climate Tech & Clean Energy.**

## Live Demo and Demo Video

- **Live Demo:** `TO ADD BEFORE SUBMISSION`
- **Demo Video:** `TO ADD BEFORE SUBMISSION`

No public URL is claimed in this repository yet.

## Demo access

Open [http://localhost:3000/login](http://localhost:3000/login). Each card signs in with one click; all four synthetic accounts share `DemoPass!2026`.

| Demo role | Email | Password | What to inspect |
| --- | --- | --- | --- |
| Corporate (`corp_user`) | `corp@demo.ecodrops.local` | `DemoPass!2026` | Batch intake, risk gates, custody, estimates |
| Warehouse (`warehouse_op`) | `warehouse@demo.ecodrops.local` | `DemoPass!2026` | Receiving, variance, evidence, certification |
| Campus (`campus_admin`) | `campus@demo.ecodrops.local` | `DemoPass!2026` | Inventory and aggregate anonymous outcomes |
| Platform admin (`admin`) | `admin@demo.ecodrops.local` | `DemoPass!2026` | Audit-chain check, methodology, demo reset |

**Public verifier (no login):** [http://localhost:3000/verify/ECD-SYNTHETIC-0001](http://localhost:3000/verify/ECD-SYNTHETIC-0001)  
**Public API projection:** [http://localhost:3000/api/v1/public/certificates/ECD-SYNTHETIC-0001](http://localhost:3000/api/v1/public/certificates/ECD-SYNTHETIC-0001)

The public response intentionally contains only record ID, issue date, status, methodology version, and audit hash. It does not verify an invoice, expose estimate totals, or represent third-party assurance.

### Ready-made sample invoice

The corporate form includes **Load PDF + matching values**, which loads and uploads [`public/ecodrops-sample-invoice.pdf`](public/ecodrops-sample-invoice.pdf) through the real multipart endpoint. Its matching values are:

| Field | Sample value |
| --- | --- |
| Invoice reference | `DEMO-INV-2026-0042` |
| Category | `electronics` |
| HS code | `850440` |
| Description | USB-C 65W power adapters |
| Quantity | `80` |
| Unit weight | `0.22 kg` |
| Declared value | `$2,400.00` |

The document is visibly marked synthetic and is reproducible with `npm run sample:invoice`. Uploading it a second time without resetting intentionally triggers duplicate-document protection.

## Prerequisites

- **Git:** required to clone; documentation checks used Git `2.39.2`.
- **Node.js:** `>=22.12.0` (declared in `package.json`); documentation checks used `22.18.0`.
- **npm:** `10.9.3` is declared through `packageManager`; the repository commits a lockfile version 3.
- A platform supported by the pinned native `better-sqlite3@13.0.3` package and a writable local filesystem.
- No Docker, external database, API key, or paid service is required for the local demo.

## Fresh clone, install, environment, seed, and run

```bash
git clone https://github.com/vietdang111/Eco-Drops.git
cd Eco-Drops
npm ci
cp .env.example .env.local
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). These commands use the example's default SQLite path, `./data/eco-drops.db`. `npm run db:seed` deterministically **replaces business data** at the path it resolves; use it only for a disposable demo database. The standalone seed/reset scripts do not load `.env.local` themselves, so pass a customized path in the shell, for example `DATABASE_PATH=./data/another-demo.db npm run db:seed`.

A brand-new empty local database can also auto-seed on the first request when demo mode is enabled, but the explicit seed command above makes judging reproducible.

## End-to-end click walkthrough

1. At `/login`, click **Corporate**. Under **Register a new surplus batch**, click **Load PDF + matching values**. HS `850440` is resolved by the server to `electronics / YELLOW`; review the PDF and fields, then click **Create draft batch**.
2. In the selected draft, check **Compliance attestation** because the electrical HS policy is YELLOW, then click **Submit for verification**, **Create shipment**, and **Advance to delivered**. Carrier movement is visibly simulated.
3. Sign in as **Warehouse**. Select the new `DELIVERED` batch, choose **PASS · exact**, keep **Synthetic demo image**, click **Record receiving**, then **Certify eligible record**.
4. On that `CERTIFIED` batch, use **Campus distribution** to allocate its verified units to **Synthetic Demo Campus**. The batch becomes `DISTRIBUTING`; the reserved units are not yet visible at the kiosk.
5. Sign in as **Campus**. Under **Inbound campus allocations**, click **Receive N items**. The system creates one `AVAILABLE` item record per received unit, applies category-safe kiosk tags, and closes the batch when all verified units are materialized.
6. Open `/kiosk` without a student account. Choose the allocated category and matching need, select one of the newly available items, complete sponsored checkout and reveal, then choose Keep, Swap, or Return and submit the anonymous outcome.
7. Sign in as **Platform admin** to verify the audit chain and inspect methodology. The certified JSON/PDF and five-field public verifier remain available throughout distribution.

### Who determines a batch status?

No user types a status directly. The server-side state machine derives it from authorized actions and rejects skipped or illegal transitions:

| Status | Trigger / owner |
| --- | --- |
| `DRAFT` | Corporate user creates the batch |
| `PENDING_VERIFICATION` / `BLOCKED` | System applies invoice checks and versioned HS/risk rules when Corporate submits |
| `IN_TRANSIT` | Corporate creates the shipment |
| `DELIVERED` | Carrier event; simulated in this demo |
| `RECEIVED` | Warehouse evidence produces ≤5% absolute weight variance (`PASS`) |
| `UNDER_REVIEW` | Warehouse evidence produces >5% through 15% variance (`REVIEW`) |
| `REJECTED` | Warehouse evidence produces >15% variance |
| `CERTIFIED` | Independent Warehouse operator or Platform admin approves all gates; UNDER_REVIEW also needs a recorded reason |
| `DISTRIBUTING` | Warehouse/Admin allocates certified verified units to a campus |
| `CLOSED` | Campus receipt materializes every verified unit and no allocation remains pending |

`YELLOW` is a **risk tier**, not a status. A YELLOW batch may be certified only after its compliance attestation and all physical receiving gates pass. Campus administrators cannot certify or allocate; they can only receive allocations addressed to their campus. Platform admins cannot bypass risk, evidence, state-pair, capacity, or separation-of-duties rules.

### How products are categorized

The corporate user selects a reviewed six-digit HS code; the server—not the browser—derives category and baseline risk from versioned policy `hs-policy-2026.1`:

| HS code | Demo description | Derived category | Baseline risk |
| --- | --- | --- | --- |
| `847130` | Portable computers | Electronics | YELLOW |
| `850440` | Static converters / power adapters | Electronics | YELLOW |
| `610910` | T-shirts and similar apparel | Apparel | GREEN |
| `482010` | Notebooks and study paper | Study supplies | GREEN |
| `902110` | Orthopaedic/medical class | Medical equipment; blocked | RED |

Unknown codes fail closed. A legacy client-supplied category is accepted only when it matches the catalog and can never select the factor or risk tier. HS classification identifies a product class; it does not prove condition, authenticity, safety, functionality, or recall status.

## What is simulated, sourced, and assumed

| Classification | Current demo behavior |
| --- | --- |
| **Simulated / synthetic** | Demo organizations and accounts, seed timestamps, generated invoice/evidence, carrier updates, scale inputs, sponsored-payment step, batches, inventory, outcomes, and the seeded certificate |
| **Recorded when entered** | User-entered batch fields, custody transitions, receiving weights and scan counts, kiosk decisions, and outcome answers; uploaded files are checked and hashed, but this demo persists metadata rather than durable file bytes |
| **Sourced references** | Official EPA WARM v16 and USEEIO materials are linked as methodology **source families and research context only** |
| **Model assumptions** | Every current category factor number, displacement rate, retention rate, handling deduction, and demonstration sample size |

**The numeric category factors in this application are synthetic EcoDrops proxy assumptions. They were not copied from EPA WARM or USEEIO and must not be represented as EPA factors.** Low/base/high are scenarios, not measured outcomes or confidence intervals. Current production calculations use fixed scenario rates; kiosk outcomes are displayed conservatively but do not currently recalibrate certificates. No disposal-emissions factor is configured, so no disposal counterfactual is claimed. Full boundaries and provenance are in [Methodology](docs/methodology.md).

## Architecture

```text
Next.js App Router pages and client components
                 │
                 ▼
        /api/v1 catch-all route
      same-origin + schemas + auth
                 │
         ┌───────┴────────┐
         ▼                ▼
 transactional service   read models
 RBAC/workflow/idempotency dashboards/methodology
         │                │
         ├── SQLite system of record
         ├── versioned carbon calculator
         ├── SHA-256 hash-linked event log
         └── JSON/PDF certificate projection
```

EcoDrops is a strict-TypeScript Next.js `16.4.3` App Router monolith using React `19.3.1`, SQLite via `better-sqlite3`, Zod validation, `pdf-lib` exports, locally generated verification QR codes via `qrcode`, Vitest, and fast-check. Business rules are framework-independent and transactionally write audit events with state changes.

**UI routes:** `/`, `/login`, `/signup`, `/app`, `/kiosk`, `/methodology`, `/verify/[recordId]`.

**API surface:** auth/session; combined role workspace and scoped batch reads; HS policy lookup; batch creation/submission/impact; shipment creation and demo advance; warehouse receiving and certification; capacity-safe campus allocation and campus receipt; methodology and audit verification; authenticated JSON/PDF records; a five-field public certificate projection; demo reset; and anonymous kiosk session/match/checkout/reveal/decision/survey/drop-back operations. All live under `/api/v1`; the dispatcher is `src/app/api/v1/[...segments]/route.ts`. A production carrier-webhook HTTP route remains roadmap work.

SQLite and process-local state make the current build appropriate for local or single-instance judging, not horizontal serverless scaling.

## Security

Implemented controls include scrypt password hashing with salts, random 256-bit sessions stored only as SHA-256 token hashes, expiring/revocable `HttpOnly` and `SameSite=Lax` cookies (`Secure` in production), server-side role and organization checks, exact-origin checks on mutations, Zod schemas, prepared SQL, upload type/size/signature checks, idempotency keys for kiosk writes, transactional audit events, restrictive API response headers, and a five-field public allowlist. The student flow collects no name, email, student ID, demographics, or payment details.

This remains a hackathon demo: known credentials are public; uploads are not malware-scanned or document-authenticated; the audit chain is internal rather than digitally signed or externally anchored; the weekly cap relies on a browser-held anonymous token (three claims in demo mode, one by default outside demo mode); certificate rows are not protected from a database administrator; and rate limiting, MFA, durable upload storage, production provisioning, and an HTTP carrier webhook are out of scope. See [SECURITY.md](SECURITY.md).

## Test commands and results

```bash
npm run lint          # ESLint
npm run typecheck     # TypeScript, no emit
npm test              # all 63 Vitest tests
npm run test:property # property suites only
npm run check:claims  # reject unsafe positive climate claims in UI source
npm run check:factors # validate factor ordering, rates, and provenance metadata
npm run smoke         # deterministic full business-loop smoke test
npm run build         # production build
npm run check         # every check above in release order
```

Property tests cover estimate non-negativity/monotonicity, retention bounds and `NO_ANSWER`, verified-unit limits, variance symmetry and thresholds, certification gates, legal state transitions, audit-chain tamper detection, kiosk checkout idempotency, weekly-cap behavior, and public-data minimization. Integration tests cover red-tier and certification gates, cross-organization access, additive schema migration, exact HS mappings and fail-closed behavior, successful corporate signup, the committed sample PDF, capacity-safe/idempotent allocations, campus-only receipt, kiosk visibility after receipt, exact-capacity closure, and real Next API error envelopes.

**Final release-gate result (2026-10-24):** `npm run check` passed end to end: ESLint, strict TypeScript, climate-claim scan across 17 UI source files, integrity validation for 4 versioned factor rows, **8 test files / 63 tests**, and a deterministic Corporate → Warehouse certification → campus allocation/receipt → kiosk checkout flow ending with a valid 18-event audit chain and `CLOSED` batch. The clean Next.js production build contains all seven UI routes plus `/api/v1/[...segments]`. Live local probes measured public verification at 5.1 ms, the combined authenticated workspace snapshot at 8.7 ms, and batch detail at 5.5 ms.

## Project documentation

- [Climate methodology, provenance, and limitations](docs/methodology.md)
- [How Kiro supported the spec-driven build](docs/kiro-writeup.md)
- [Public demo video script (under three minutes)](docs/demo-script.md)
- [Submission checklist](docs/submission-checklist.md)
- [Security policy and demo threat boundaries](SECURITY.md)
- [MIT License](LICENSE)

## Deployment guidance and reset

For a production-style **single-instance** run, install dependencies, build, and start:

```bash
npm ci
npm run build
npm run start
```

Set `NEXT_PUBLIC_APP_URL` to the exact HTTPS origin and `DATABASE_PATH` to a durable, writable SQLite volume. A public hackathon demo may explicitly use `DEMO_MODE=true` only with synthetic data and the known credentials above; never put real documents or personal data into that instance. A real environment should use `DEMO_MODE=false`, but the current repository is **not turnkey production software**: privileged-user/factor provisioning, durable object storage, certificate hardening, rate limits, a carrier webhook HTTP route, and a scalable datastore still need implementation. Ephemeral or horizontally scaled serverless filesystems are unsuitable for the current SQLite design.

Reset options are destructive:

```bash
npm run db:reset
```

The CLI refuses `NODE_ENV=production`, paths outside the workspace, and non-SQLite extensions, then replaces demo rows in one SQLite transaction. It does not unlink the database or WAL files, so it cannot strand a running local server on a deleted inode. The admin dashboard's **Reset demo…** action uses the same transactional reset and invalidates every active session. Reset only a disposable demo database, preferably immediately before judging or recording.