# Security and privacy rules

- Authenticate and authorize on the server for every protected action; hiding a button is not authorization.
- Scope corporate and campus records to the current organization. Warehouse and admin cross-organization access must be explicit by role.
- Store only password hashes and session-token hashes. Use secure, HTTP-only, same-site cookies and expire/revoke sessions.
- Validate untrusted input with Zod, cap upload size, check content signatures, randomize stored names, and never interpolate values into SQL.
- Require same-origin browser mutations and idempotency keys for checkout/refund-like operations.
- Do not collect student PII. Anonymous kiosk sessions contain only compatibility and need answers and must expire.
- Keep secrets in environment variables; `.env` is ignored while `.env.example` contains placeholders only.
- Public projections must be allowlists and must never expose corporate values, filenames, student data, or internal audit payloads.
