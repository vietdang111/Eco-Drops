# EcoDrops estimated avoided-emissions methodology

## Scope and claim boundary

EcoDrops models **estimated avoided emissions** for safe, functional surplus routed toward reuse. It does not measure atmospheric outcomes and does not create a carbon credit, offset, Scope 3 deduction, tax record, authenticated invoice, legally binding record, or third-party audit. A result becomes “certified” only after EcoDrops' internal workflow gates pass; that word does not imply external assurance.

> **Critical provenance statement:** every current numeric category factor, displacement rate, retention rate, handling deduction, and sample size is a synthetic EcoDrops proxy assumption created for this demonstration. **None of the current category factor numbers was copied from or published by EPA WARM or USEEIO.** EPA materials are referenced only as official source families and technical context for future methodology work.

## Formula

For each scenario `s ∈ {low, base, high}`:

```text
embodied_new_per_item_s = unit_weight_kg × factor_kgCO2e_per_kg_s
avoided_per_item_s = max(
  0,
  embodied_new_per_item_s × displacement_rate_s × retention_rate_s
    − handling_kgCO2e_per_item
)
estimated_avoided_emissions_s = avoided_per_item_s × eligible_units
```

The zero floor prevents a negative avoided-emissions result. Values are rounded to six decimal places. Rates must be between 0 and 1, quantities are non-negative integers, and weights/factors/handling values must be finite and non-negative.

Before receiving, `eligible_units` is claimed quantity. After receiving it is:

```text
verified_units = min(claimed_units, floor(net_weight_kg / unit_weight_kg))
```

Only a `CERTIFIED` batch is labelled as a certified estimate. Certification recomputes from verified units.

## Low, base, and high scenarios

Low/base/high vary three inputs together: embodied-new proxy factor, displacement rate, and retention rate. The same category-specific handling deduction is applied in each scenario. These values are **scenario bounds for product demonstration**, not probability distributions, measured ranges, statistical confidence intervals, EPA category averages, or a promise that every reused item avoids production.

Current synthetic assumptions (`proxy-factor-2026.1`) are:

| Category | Factor kgCO2e/kg L/B/H | Displacement L/B/H | Retention L/B/H | Handling kgCO2e/item | Demo n (displacement / retention) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Electronics | 8 / 12 / 18 | 35% / 55% / 75% | 55% / 70% / 85% | 0.30 | 24 / 18 |
| Apparel | 10 / 15 / 22 | 30% / 50% / 70% | 50% / 68% / 82% | 0.08 | 24 / 18 |
| Study supplies | 1.8 / 2.7 / 4 | 35% / 55% / 72% | 55% / 70% / 85% | 0.04 | 24 / 18 |
| Other fallback | 2 / 4 / 7 | 25% / 45% / 65% | 45% / 65% / 80% | 0.10 | 24 / 18 |

For the seeded electronics record (`12` eligible units at `1.5 kg/item`), those assumptions produce `24.12 / 79.56 / 202.95 kgCO2e`. This is a deterministic synthetic example, not a real-world impact result.

## Displacement, retention, and no-answer treatment

- **Displacement** represents the assumed chance that a reused item substitutes for obtaining a comparable item.
- **Retention** represents the assumed chance that the item remains in use or is passed on.
- `IN_USE` and `PASSED_ON` are positive retained outcomes.
- `RETURNING` and `NO_ANSWER` are not positive retention outcomes; missing/no-answer results remain visible as unknown in dashboards rather than being inferred as success.

The code includes a smoothed-rate helper with a one-positive/one-negative default prior. Its denominator includes all outcomes, so `RETURNING` and `NO_ANSWER` lower the inferred rate. **That helper is currently exercised by property tests but is not wired into production certificate calculations.** Current certificates use the fixed scenario retention/displacement rates in the factor table. Kiosk responses are recorded and aggregated, but do not retroactively update estimates. Therefore the current build must not be described as empirically outcome-adjusted.

No disposal-emissions factor is configured. EcoDrops consequently shows “not calculated” and makes no disposal counterfactual benefit claim.

## Factor provenance and official references

The current numbers above are synthetic model assumptions. They use broad source-family labels to make future replacement with researched, reviewable factors possible; the labels do not confer EPA endorsement or data provenance.

Official technical references:

- [EPA — Versions of the Waste Reduction Model (WARM), including v16](https://www.epa.gov/waste-reduction-model/versions-waste-reduction-model)
- [EPA — WARM v16 Electronics documentation (PDF)](https://www.epa.gov/system/files/documents/2023-12/warm_electronics_v16_dec.pdf)
- [EPA — U.S. Environmentally-Extended Input-Output (USEEIO) technical content](https://www.epa.gov/land-research/us-environmentally-extended-input-output-useeio-technical-content)

These references can inform system boundaries, material categories, and future factor research. EcoDrops has not mapped its broad demo categories to those EPA factor datasets, reproduced their factors, performed supplier-specific life-cycle analysis, or obtained EPA review. Content was rephrased for compliance with licensing restrictions.

## HS-code categorization boundary

EcoDrops uses internal policy `hs-policy-2026.1` to map five reviewed six-digit HS codes into `electronics`, `apparel`, `study supplies`, or a blocked medical class. The server derives category and baseline GREEN/YELLOW/RED risk; a browser-provided category cannot select the factor or bypass policy. Unknown codes fail closed. This mapping is an EcoDrops demo screening policy—not a customs ruling—and HS classification does not prove product condition, authenticity, functionality, electrical safety, or recall status.

## Receiving and certification gates

A warehouse operator or platform admin can issue a record only when:

1. the batch is in `RECEIVED` or `UNDER_REVIEW`;
2. risk is not red;
3. the approver is not the uploader;
4. at least one evidence image and one sample scan are recorded;
5. absolute weight variance is `PASS` at `≤5%`, or `REVIEW` at `>5%` and `≤15%` with a reason; and
6. a `REJECT` variance (`>15%`) is not present.

These are workflow and custody controls. Uploaded PDFs/images receive size, MIME, short file-signature, hash, uniqueness, and consistency checks; EcoDrops does not authenticate issuers, verify invoice truth, scan for malware, perform OCR, or retain durable file bytes in the current demo.

## Certificate wording and verification boundary

Use this description:

> **An internally workflow-certified record of estimated avoided emissions, calculated from versioned synthetic proxy assumptions and verified-unit inputs.**

Do not use “verified climate impact,” “EPA factor,” “carbon credit,” “offset,” “Scope 3 deduction,” “tax record,” “authenticated invoice,” “third-party verified,” “tamper-proof,” or “immutable proof.”

Authenticated JSON/PDF exports include the estimate, methodology and factor versions, scenario inputs, sample sizes, receiving snapshot, audit hash, and disclaimer. The unauthenticated public verifier exposes exactly five fields:

1. record ID;
2. issue date;
3. status;
4. methodology version; and
5. audit hash.

The SHA-256 event chain detects changes to event rows when checked against the same database. It is not digitally signed or externally anchored. Certificate rows have no database-level immutability control, and a database administrator could rewrite stored state; public presence therefore confirms an allowlisted internal record, not the underlying invoice or external climate assurance.

## Dataset and model versioning

Current identifiers are intentionally separate:

| Layer | Current version |
| --- | --- |
| SQLite schema | `2` |
| Synthetic seed dataset | `synthetic-2026.1` |
| HS intake policy | `hs-policy-2026.1` |
| Methodology | `demo-methodology-2026.1` |
| Proxy factor set | `proxy-factor-2026.1` |
| Formula | `avoided-emissions-v1` |
| Intake risk rules | `risk-v2` |

A batch stores a factor ID at intake; while uncertified, calculation requires an active methodology and can fall back to the active exact-category or `other` factor if the pinned methodology is deactivated. At certification, EcoDrops stores a point-in-time JSON snapshot and the calculated totals.

There is no single signed dataset manifest or migration history in this demo. A production release process should issue new immutable factor/methodology versions rather than silently overwrite values, record derivation and citations per factor, publish change notes and effective dates, preserve prior versions for recalculation, bind certificate contents cryptographically, and independently review the model before decision use.

## Limitations

- Broad categories do not capture product model, age, condition, geography, energy mix, repair, rebound effects, logistics detail, or supplier-specific embodied emissions.
- Static handling deductions are not measured logistics inventories.
- Demonstration sample sizes are assumptions, not samples from a documented study.
- Low/base/high ordering follows seed choices but the calculator validates each scenario independently rather than enforcing ordering.
- Student outcomes are anonymous and the weekly cap depends on a browser-held token; neither is identity-grade measurement.
- Campus allocation is bounded by physically verified units. Items become kiosk-visible only after the addressed campus records receipt; real freight, warehouse, and kiosk-hardware integrations remain outside the demo.
- Recycling remains the recommended path for broken, unsafe, recalled, or low-demand goods. EcoDrops targets safe, functional surplus only.
- The model is suitable for explaining product mechanics in a hackathon demo, not for financial, tax, regulatory, procurement, or greenhouse-gas inventory decisions.