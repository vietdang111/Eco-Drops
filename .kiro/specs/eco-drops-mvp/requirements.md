# EcoDrops MVP Requirements

## Product goal

EcoDrops helps companies route safe, functional surplus to students instead of disposal. The hackathon demo must prove one auditable loop from corporate intake through independent warehouse verification, needs-matched distribution, and outcome-adjusted avoided-emissions reporting.

## Requirements

### R1 — Identity and access

1. WHEN a user signs in, THE SYSTEM SHALL create a hashed, expiring, HTTP-only session and authorize every protected operation by role and organization.
2. THE SYSTEM SHALL support `corp_user`, `warehouse_op`, `campus_admin`, and `admin` demo roles.
3. WHEN a new corporate account is created, THE SYSTEM SHALL validate a strong password and create an isolated organization.
4. THE SYSTEM SHALL never store student names, emails, or payment details.

### R2 — Corporate batch intake

1. WHEN a corporate user creates a batch, THE SYSTEM SHALL collect a six-digit HS code, quantity, unit weight, declared value, invoice identifier, and authority attestation, then derive category server-side from a versioned HS policy.
2. WHEN an invoice is uploaded, THE SYSTEM SHALL verify file type and size, hash its bytes, block duplicate hashes, and record format, consistency, plausibility, and uniqueness checks.
3. WHEN a batch is submitted, THE SYSTEM SHALL assign a green, yellow, or red risk tier from versioned rules.
4. IF a batch is red tier, THEN THE SYSTEM SHALL block shipment and certification.
5. IF a batch is yellow tier, THEN THE SYSTEM SHALL require a compliance attestation before submission.
6. IF an HS code is unknown or a legacy category disagrees with the active policy, THEN THE SYSTEM SHALL fail closed and SHALL NOT allow client input to choose the factor or risk tier.

### R3 — Transparent impact estimation

1. THE SYSTEM SHALL calculate low, base, and high avoided-emissions estimates from a versioned factor, verified or claimed units, displacement rate, retention rate, and handling emissions.
2. THE SYSTEM SHALL label all values as estimates and disclose source, version, assumptions, sample sizes, and formula.
3. WHILE a batch is not certified, THE SYSTEM SHALL display its estimate as unverified and lock exports.
4. THE SYSTEM SHALL use “avoided emissions” and SHALL NOT describe the result as a Scope 3 deduction, tax write-off, legally binding record, authenticated invoice, or third-party audit.

### R4 — Shipment and independent receiving

1. WHEN a shipment is created, THE SYSTEM SHALL assign a tracking reference and maintain chain-of-custody states.
2. WHEN the demo simulator advances a shipment, THE SYSTEM SHALL append the same audit events expected from a signed carrier webhook.
3. WHEN a warehouse operator receives a batch, THE SYSTEM SHALL record gross weight, tare weight, evidence photos, and sample scan count.
4. THE SYSTEM SHALL classify absolute weight variance as `PASS` at or below 5%, `REVIEW` above 5% through 15%, and `REJECT` above 15%.
5. THE SYSTEM SHALL compute verified units as the lesser of claimed units and floor(net weight / unit weight).
6. THE SYSTEM SHALL prevent the uploader from approving their own batch and prevent any red-tier batch from certification.

### R5 — Certification and public verification

1. WHEN all receiving gates pass, THE SYSTEM SHALL certify the batch, recompute impact from verified units, and create immutable snapshot inputs.
2. THE SYSTEM SHALL provide JSON and PDF impact records only for certified batches.
3. THE SYSTEM SHALL expose a public verification page containing only record ID, issue date, status, methodology version, and audit hash.
4. WHEN Warehouse or Platform Admin allocates a certified batch, THE SYSTEM SHALL reserve no more than its remaining physically verified capacity and transition it to `DISTRIBUTING`.
5. THE SYSTEM SHALL count every existing physical item once against allocation capacity regardless of item lifecycle status or circulation count.
6. WHEN the addressed Campus records receipt, THE SYSTEM SHALL create exactly the allocation quantity as category-derived `AVAILABLE` items; before receipt those units SHALL NOT appear in kiosk matching.
7. WHEN all verified units are materialized and no allocation remains pending, THE SYSTEM SHALL transition the batch to `CLOSED`.

### R6 — Needs-matched kiosk

1. WHEN a student starts a kiosk session, THE SYSTEM SHALL create an anonymous, short-lived session.
2. WHEN compatibility and need answers are submitted, THE SYSTEM SHALL match only compatible in-stock items.
3. THE SYSTEM SHALL support category-known and short-list mystery modes, a sponsored free-claim method, and a weekly claim cap.
4. WHEN checkout repeats with one idempotency key, THE SYSTEM SHALL never charge or dispense twice.
5. AFTER reveal, THE SYSTEM SHALL support Keep, Swap, or Return and record each decision exactly once.

### R7 — Outcomes and circular routing

1. THE SYSTEM SHALL record displacement answers and follow-up outcomes (`IN_USE`, `RETURNING`, `PASSED_ON`, `NO_ANSWER`).
2. THE SYSTEM SHALL count unanswered follow-ups conservatively as not retained in the base rate.
3. THE SYSTEM SHALL show kept, returned, recirculated, diverted, and unknown outcomes in aggregate.
4. WHEN an item is dropped back, THE SYSTEM SHALL return it to available inventory without creating a second item identity.

### R8 — Auditability and security

1. EVERY state-changing business event SHALL be appended to a SHA-256 hash chain built from the prior hash and canonical event data.
2. THE SYSTEM SHALL provide a chain verifier that reports the first broken event.
3. THE SYSTEM SHALL reject illegal state transitions with HTTP 409 and malformed requests with a consistent error envelope.
4. THE SYSTEM SHALL enforce same-origin mutation requests, input schemas, least-privilege role checks, and secure response headers.
5. Simulator routes SHALL be unavailable when `DEMO_MODE` is not `true`.

### R9 — Demo and submission readiness

1. THE REPOSITORY SHALL include synthetic seed data, reset tooling, `.env.example`, an MIT license, setup and testing instructions, and the root `.kiro` directory.
2. THE UI SHALL clearly label simulated carrier, scale, and payment actions and distinguish them from sourced methodology.
3. THE primary workflows SHALL be keyboard accessible, responsive, and readable at 200% zoom.
4. PROPERTY TESTS SHALL cover certification gates, variance symmetry, unit limits, estimate monotonicity and retention bounds, hash tamper detection, idempotency, and public-data minimization.
