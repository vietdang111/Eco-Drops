# How Kiro supported EcoDrops

EcoDrops used a spec-driven Kiro workflow to turn a climate-tech idea into a bounded, testable demo. The repository preserves requirements, architecture, task decomposition, and steering under `.kiro/`; it does not preserve chat transcripts or per-agent identity logs, so this write-up describes the workflow and resulting artifacts rather than claiming independently auditable agent authorship.

## Repository-aware Kiro tools

Kiro's repository tools were used to navigate and search the TypeScript codebase, inspect symbols and execution paths, make constrained file edits, and run local validation. Context-gathering agents traced routes, roles, data boundaries, climate calculations, test coverage, and spec alignment before documentation was written. Terminal tools then ran ESLint, a no-write TypeScript check, and Vitest. This reduced the risk of documenting an imagined API or polished-but-nonexistent feature.

## Specification before implementation

The source of truth is split into three reviewable artifacts:

- `.kiro/specs/eco-drops-mvp/requirements.md` defines nine requirement groups and concrete acceptance criteria.
- `.kiro/specs/eco-drops-mvp/design.md` records the App Router/SQLite architecture, state machine, security boundaries, climate formula, privacy choices, and deployment rationale.
- `.kiro/specs/eco-drops-mvp/tasks.md` decomposes delivery into foundation, backend, UI, testing, and submission work.

The task ledger is now fully checked against the implemented code and final release gate; detailed limitations remain explicit in the submission checklist rather than being hidden behind task completion.

## Four agent work streams

The implementation work was organized into four bounded, agent-sized streams reflected by the task and module boundaries:

1. **Specification and foundation:** define user roles, acceptance criteria, architecture, stack, schema direction, and product-language boundaries before feature work.
2. **Domain, data, and API:** implement SQLite schema/seed, sessions and RBAC, workflow transitions, carbon calculation, audit chain, idempotency, read models, and `/api/v1` handlers.
3. **Product journeys:** build public pages, authentication, four role-specific workspaces, intake/receiving/certification controls, anonymous kiosk, exports, verifier, and methodology UI.
4. **Verification and submission:** exercise example/property tests, audit security and claims, verify commands/routes, and assemble transparent judging documentation.

Scopes were defined by artifacts and acceptance criteria rather than by “make it look done” prompts. The repository records the outputs of these streams, not their conversation history.

## Steering as persistent guardrails

Three project steering files constrained decisions across streams:

- `api-conventions.md`: `/api/v1`, success/error envelopes, HTTP semantics, same-transaction audit events, idempotency, integer money, and server-owned calculations.
- `product-language.md`: “estimated avoided emissions,” required low/base/high disclosure, conservative no-answer treatment, simulation labels, and prohibited credit/tax/assurance claims.
- `security-and-privacy.md`: server authorization and organization scope, hash-only credentials, cookie/session rules, upload controls, same-origin writes, no student PII, secret handling, and public allowlists.

These rules are visible repository context, so an agent can re-check language and security boundaries without relying on a transient prompt.

## Hooks: implemented project automation

Three Kiro hooks were created with the Hook UI/tool and are committed under `.kiro/hooks/`:

- `type-and-claims-on-save.json` runs `npm run typecheck && npm run check:claims` after TypeScript source saves. It catches compile regressions and unsafe positive climate-claim language close to the edit.
- `tests-after-spec-task.json` runs the full Vitest suite after a spec task completes, keeping task status tied to behavioral evidence.
- `factor-integrity-on-stop.json` runs `npm run check:factors` when an agent execution stops. It validates low/base/high ordering, bounded rates, HTTPS source metadata, proxy disclosure, and conservative no-answer treatment.

The hooks become active from the next Kiro session start. Their commands were also run directly during this session, and the aggregate `npm run check` release gate invokes the same claim and factor validators so CI or a non-Kiro reviewer receives equivalent protection.

## Property-based tests

Instead of testing only happy-path examples, fast-check generates inputs for system invariants. Fixed seeds and explicit run counts make failures reproducible. The four property suites cover:

- **carbon:** non-negative estimates, monotonic eligible units/retention, bounded rates, and conservative `NO_ANSWER`;
- **workflow:** verified-unit floors, symmetric variance thresholds, complete certification gates, and the legal state-transition matrix;
- **audit:** intact chains plus payload/hash/link tampering and first-broken-event reporting; and
- **service and HTTP:** checkout idempotency, bounded anonymous weekly claims, exact five-field public projection, successful signup, and structured 400/401/404/409/422 route errors.

A separate integration suite checks red-tier shipping/certification blocks, cross-organization privacy, seed cap integrity, and the real Next route boundary. On 2026-10-24, all 6 files / 46 tests passed. Property tests provide strong invariant evidence, but they do not replace browser accessibility checks, production load testing, or external methodology review.

## MCP and AppDeploy Power exploration

The AppDeploy Power was activated during the documentation pass to explore an MCP-backed deployment path. Activation reported the `appdeploy` server but **exposed no deployment tools**. No app was published, no deployment URL was generated, and EcoDrops makes no deployment claim. The Power's guidance files may inform a later human-led deployment, but they are not evidence of a live service.

## Experiments and decisions

Key decisions were made as explicit trade-offs:

- **Next.js monolith over distributed services:** one pinned TypeScript stack enabled shared types and a judge-friendly local run.
- **SQLite over hosted infrastructure:** deterministic local setup without credentials won for the hackathon; persistent single-instance limits are documented rather than hidden.
- **Server sessions over browser bearer storage:** opaque random tokens stay in HTTP-only cookies and only hashes enter SQLite.
- **No student account:** the kiosk retains compatibility/need answers and a browser-held weekly key, not identity fields.
- **Scenario model over a single impressive number:** low/base/high and a zero floor expose sensitivity; all current numbers remain synthetic proxies.
- **Simulation over fake integrations:** carrier, scale, payment, and time actions are labelled simulated rather than presented as external systems.
- **Five-field verifier over data-rich publicity:** public lookup minimizes corporate, evidence, estimate, and student data.
- **Property invariants over screenshot confidence:** core gates are exercised across generated inputs, while manual UX checks remain explicit submission tasks.

The audit also surfaced decisions still required: durable uploaded-file storage, a production carrier webhook route, privileged provisioning, certificate hardening, outcome-to-factor calibration, rate limiting, real freight/kiosk integrations, and a scalable datastore. Post-certification allocation and campus receipt are now implemented with verified-capacity and role-scoping gates.

## Why this is not ad-hoc vibe coding

Ad-hoc vibe coding optimizes for immediate visual output and often retrofits requirements after behavior has drifted. EcoDrops instead starts with written acceptance criteria and a state machine, keeps domain rules outside UI components, uses persistent language/security steering, version-tags calculations, tests invariants with generated data, and documents gaps discovered during repository-wide review. The result is still a hackathon demo—not production software—but its claims, boundaries, and next steps are inspectable rather than implied.