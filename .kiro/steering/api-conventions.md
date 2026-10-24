# API conventions

- Version business endpoints under `/api/v1` and return JSON unless a documented PDF endpoint is requested.
- Success responses use `{ "data": ... }`. Errors use `{ "error": { "code": string, "message": string, "details"?: unknown } }`.
- Use `400` for malformed input, `401` for missing identity, `403` for insufficient role or organization, `404` for absent/scoped-away records, `409` for illegal transitions or duplicate/idempotency conflicts, and `422` for a valid request that fails a business gate.
- State-changing operations append an audit event in the same database transaction.
- Checkout and reveal/refund operations require an `Idempotency-Key` and replay the original result for a repeated key.
- Parse money as integer cents and carbon as numeric kilograms. Never trust client-computed totals, roles, states, or estimates.
