# EcoDrops submission checklist

This checklist mirrors the repository spec and the current documentation brief. It separates machine-verifiable work from actions that require a human owner or an external service.

**Legend:** ✅ complete/verified · 🧪 automated check passed on 2026-10-24 · ⚠️ partial or limitation to disclose · 👤 human/external action required

## Public submission package

| Status | Rule | Evidence / next action |
| --- | --- | --- |
| ✅ | Identify the project and **Climate Tech & Clean Energy** track in the opening README paragraph. | `README.md` opening paragraph |
| 👤 | Add a real public **Live Demo** URL without inventing one. | README says `TO ADD BEFORE SUBMISSION`; deploy and test signed out first. |
| 👤 | Record and add a real public **Demo Video** under 3 minutes. | README placeholder; follow `docs/demo-script.md`, verify duration and signed-out playback. |
| 👤 | Make the source repository public and submit its final URL. | Remote is configured, but this local repository currently has no commit-backed project history; review, commit, push, and verify visibility. |
| 👤 | Complete team/member, eligibility, consent, track, and submission-form fields. | No team roster or external portal rules are stored in the repo; the team must verify the current organizer rules and deadline. |
| ✅ | Provide four demo roles, credentials, and a no-login verifier. | README; seed uses four aliases and `ECD-SYNTHETIC-0001`. |
| ✅ | Provide versioned prerequisites and exact clone/install/env/seed/dev commands. | README commands match `package.json`, `.env.example`, and scripts. |
| ✅ | Provide a short role/click walkthrough and exact timed video path. | README + `docs/demo-script.md` |
| ✅ | Disclose simulated, sourced, recorded, and assumed inputs. | README + `docs/methodology.md` |
| ✅ | Explain architecture, API surface, security, tests/results, deployment, and reset. | README + `SECURITY.md` |
| ✅ | Link methodology, Kiro write-up, demo script, checklist, security policy, and license. | README project-documentation section |
| ✅ | Include official EPA WARM v16 versions, electronics, and USEEIO links plus licensing-compliance note. | `docs/methodology.md` |
| ✅ | State unambiguously that all current category numbers are synthetic proxy assumptions, not copied EPA factors. | README + methodology |
| ✅ | Cover Kiro tools, spec-driven work, four streams, steering, hook status, property tests, decisions, and contrast with ad-hoc vibe coding. | `docs/kiro-writeup.md` |
| ✅ | Report AppDeploy exploration truthfully. | Power activated; no deployment tools exposed; no deployment or URL claimed. |
| ✅ | Add MIT license for 2026 EcoDrops contributors. | `LICENSE` |
| ✅ | Add supported demo scope, reporting placeholder, controls, credential warning, and threat limitations. | `SECURITY.md` |
| ✅ | Avoid claims of deployment, real measured outcomes, invoice authentication, tax treatment, Scope 3 deduction, and third-party verification. | Documentation consistency check |
| ✅ | Keep `.kiro/` at repository root and out of `.gitignore`. | Specs, three steering files, and three hooks are present; final Git checks verify the directory is not ignored. |
| 👤 | Replace the security reporting placeholder. | Choose a monitored private channel before public launch. |

## Spec acceptance criteria (R1–R9)

### R1 — Identity and access

- ✅ **R1.1:** sign-in creates a hashed, expiring, HTTP-only session; protected service operations enforce role and organization.
- ✅ **R1.2:** seeded `corp_user`, `warehouse_op`, `campus_admin`, and `admin` roles exist.
- ✅ **R1.3:** corporate signup validates a strong password and creates an isolated organization.
- ✅ **R1.4:** the student kiosk schema and UI avoid names, emails, and payment details.

### R2 — Corporate batch intake

- ✅ **R2.1:** intake collects a six-digit HS code, quantity, unit weight, declared value, invoice ID, and authority attestation; the server derives category from active policy `hs-policy-2026.1`.
- ⚠️ **R2.2:** PDF type/size/signature, hash, duplicate, format, consistency, plausibility, and uniqueness checks exist; file bytes are not durably stored and the document is not authenticated.
- ✅ **R2.3:** submission combines versioned HS baseline and quantitative green/yellow/red risk rules.
- 🧪 **R2.4:** red-tier shipment and certification are blocked; integration tests passed.
- ✅ **R2.5:** yellow-tier submission requires compliance attestation.
- 🧪 **R2.6:** unknown HS codes fail closed and mismatched client categories cannot choose the factor or risk tier.

### R3 — Transparent impact estimation

- 🧪 **R3.1:** low/base/high use a versioned factor, claimed/verified units, displacement, retention, and handling; calculation properties passed.
- ✅ **R3.2:** UI/exports disclose estimate label, source-family label, versions, assumptions, sample sizes, and formula.
- ✅ **R3.3:** uncertified estimates are marked unverified and exports require a certified record.
- ✅ **R3.4:** docs/UI prohibit Scope 3, tax, authenticated-invoice, and third-party-audit claims.

### R4 — Shipment and independent receiving

- ✅ **R4.1:** shipment creation assigns tracking and maintains custody states.
- ⚠️ **R4.2:** demo advancement writes simulated carrier/audit events; a service method for signed delivery exists, but no production carrier webhook HTTP route is exposed.
- ✅ **R4.3:** receiving records gross/tare/net weight, evidence metadata, and sample scans.
- 🧪 **R4.4:** absolute variance thresholds are symmetric: PASS `≤5%`, REVIEW `>5%` through `15%`, REJECT `>15%`.
- 🧪 **R4.5:** verified units equal `min(claimed, floor(net/unit weight))`.
- 🧪 **R4.6:** uploader self-approval, null/RED risk, YELLOW without prior compliance, and inconsistent status/variance pairs are blocked from certification.

### R5 — Certification and public verification

- ⚠️ **R5.1:** certification recomputes from verified units and stores a snapshot, but database-level immutability/digital signing/external anchoring is not implemented; do not claim tamper-proof records.
- ✅ **R5.2:** authenticated JSON and PDF exports are limited to certified records.
- 🧪 **R5.3:** public verification exposes exactly record ID, issue date, status, methodology version, and audit hash; minimization property passed.
- 🧪 **R5.4:** Warehouse/Admin allocation is idempotent and cannot exceed verified units after existing items and pending reservations.
- 🧪 **R5.5:** only the addressed Campus can receive an allocation; item rows are absent before receipt and `AVAILABLE` afterward.
- 🧪 **R5.6:** every materialized item inherits the server-derived category, allocation provenance, and category-safe kiosk defaults.
- 🧪 **R5.7:** exact full materialization with no pending reservation transitions `DISTRIBUTING` to `CLOSED`; partial receipt remains `DISTRIBUTING`.

### R6 — Needs-matched kiosk

- ✅ **R6.1:** anonymous kiosk sessions expire after 30 minutes.
- ✅ **R6.2:** matching returns compatible in-stock items only.
- ⚠️ **R6.3:** category-known/mystery modes, sponsored free claims, and a weekly cap exist. Demo mode allows three claims per anonymous browser token/week and a clearly labelled next-demo-visitor reset; non-demo mode defaults to one. The token is not identity-grade enforcement.
- 🧪 **R6.4:** repeated checkout with one idempotency key creates one claim/audit event; there is no real charge or payment processor.
- ✅ **R6.5:** reveal supports Keep/Swap/Return and the database permits one decision per claim.

### R7 — Outcomes and circular routing

- ✅ **R7.1:** displacement and `IN_USE`/`RETURNING`/`PASSED_ON`/`NO_ANSWER` are stored.
- ⚠️ **R7.2:** no-answer is conservative in aggregates and in the tested smoothing helper, but production certificates currently use fixed factor-table rates rather than recalculated outcome rates.
- ✅ **R7.3:** kept, returned, recirculated, diverted, and unknown aggregates are shown.
- ✅ **R7.4:** drop-back restores the same item ID and increments circulation.

### R8 — Auditability and security

- 🧪 **R8.1:** state-changing business events are transactionally appended to a SHA-256 event chain; tamper properties passed.
- 🧪 **R8.2:** warehouse/admin verifier reports the first broken event.
- 🧪 **R8.3:** illegal transitions use 409 and generated transition-matrix tests passed; malformed requests use a consistent error envelope.
- ✅ **R8.4:** same-origin mutations, Zod input schemas, role checks, prepared SQL, and API security headers are implemented.
- ✅ **R8.5:** shipment simulation and reset reject use when demo mode is disabled.

### R9 — Demo and submission readiness

- ✅ **R9.1:** synthetic seed, guarded reset, `.env.example`, MIT license, setup/testing docs, and root `.kiro` are present after this documentation pass.
- ✅ **R9.2:** carrier, scale, payment, time, synthetic inputs, source families, and assumptions are visibly distinguished.
- 👤 **R9.3:** semantic/accessibility affordances exist, but keyboard-only flow, target devices, reduced motion, and 200% zoom still need manual acceptance recording.
- 🧪 **R9.4:** properties cover certification gates, variance symmetry, unit/allocation limits, estimate monotonicity, retention bounds/no-answer, chain tampering, idempotency, and public minimization; integrations cover schema migration, HS policy, campus distribution, the real API boundary, signup, and cap regressions; 8 files / 63 tests passed.

## Automated quality snapshot

- 🧪 `npm run lint` — passed.
- 🧪 `npm run typecheck` — passed.
- 🧪 `npm run check:claims` — passed across 17 UI source files.
- 🧪 `npm run check:factors` — passed for 4 versioned factor rows.
- 🧪 `npm test` — 8 files / 63 tests passed.
- 🧪 `npm run smoke` — Corporate → Warehouse certification → campus allocation/receipt → newly materialized kiosk item checkout passed; the batch closed at exact verified capacity and the resulting 18-event audit chain verified.
- 🧪 `npm run build` — clean Next.js production build passed with all required routes and no warnings.
- 🧪 `npm run check` — aggregate release gate passed end to end on 2026-10-24.
- 👤 Browser-only accessibility and deployed-network checks remain human launch tasks.

## Final human launch sequence

1. Review all limitations and choose a monitored private security contact.
2. Commit the implementation, `.kiro`, and documentation; push to the intended public repository without secrets or local databases.
3. Deploy a synthetic-only, single-instance demo on persistent writable storage; set the exact HTTPS origin; confirm no real data is present.
4. Reset the demo and run `npm run check` where build artifacts are allowed, then complete keyboard, responsive, reduced-motion, and 200%-zoom checks.
5. Test every credential, public verifier, JSON/PDF export, reset behavior, and the full click path in a signed-out/private browser.
6. Record from a fresh reset/profile using `docs/demo-script.md`; caption it, export under 3:00, upload publicly, and test anonymous playback.
7. Replace both README `TO ADD BEFORE SUBMISSION` entries with verified public URLs.
8. Confirm current organizer rules, deadline/time zone, team eligibility/consent, required assets, and form fields; submit and save confirmation.