# Security policy

## Supported scope

EcoDrops is a hackathon demonstration, not production or compliance software. Security review applies only to the latest repository revision and the synthetic local/single-instance demo described in the README. There are no supported release branches, security SLA, production warranty, or guarantee that a public demo instance retains availability or data.

| Scope | Status |
| --- | --- |
| Latest source revision and synthetic demo workflow | Best-effort review |
| Older revisions, forks, or modified deployments | Not supported |
| Real invoices, personal data, financial use, tax/accounting use, or regulated reporting | Out of scope; do not use |
| Carbon credits, offsets, Scope 3 deductions, or third-party assurance | Not provided |

## Reporting a vulnerability

Please do not disclose an unpatched vulnerability in a public issue.

- **Private reporting contact:** `TO ADD BEFORE PUBLIC RELEASE`
- **Preferred future channel:** enable the repository host's private vulnerability-reporting feature and replace the placeholder above with a monitored security address or advisory link.

Include the affected revision, route/component, reproduction steps, impact, required preconditions, and a minimal proof of concept using only synthetic data. Do not access other users' systems, exfiltrate data, degrade a service, or test against a public deployment without authorization. Receipt and remediation timelines are best effort until a monitored channel is published.

## Implemented controls

- Passwords use Node scrypt with per-user salts; the database stores password hashes, not plaintext passwords.
- Session tokens have 256 bits of random entropy, expire after eight hours, can be revoked, remain in `HttpOnly`/`SameSite=Lax` cookies, use `Secure` in production, and are stored only as SHA-256 hashes.
- Protected service operations re-read the actor's user, role, and organization; corporate/campus data is organization-scoped and cross-organization records are returned as not found.
- Every mutation requires an `Origin` matching `NEXT_PUBLIC_APP_URL`; kiosk write operations also require scoped idempotency keys.
- Zod schemas, parameterized/prepared SQL, database constraints, legal state transitions, and immediate transactions defend core data boundaries.
- Invoice/evidence inputs are capped by type and per-file size, checked against short PDF/JPEG/PNG signatures, hashed, and assigned random storage names.
- State-changing business events are appended in the same transaction to a SHA-256 hash-linked event log; warehouse/admin roles can check the first broken event.
- API responses use no-store, no-referrer, nosniff, frame-denial, and restrictive API content-security headers.
- The public certificate endpoint is an explicit five-field allowlist.
- Anonymous kiosk records omit student name, email, ID, demographic, and payment fields; sessions expire after 30 minutes.
- Demo simulator and reset methods reject use when `DEMO_MODE` is not `true`.

## Demo credential warning

The four accounts and shared password in the README are intentional, public, deterministic fixtures. They provide **no secrecy** and must never be reused for a real environment. A public demo should contain synthetic data only, be isolated from other systems, run with minimal permissions, and be resettable. Do not upload real invoices, photos, corporate values, student information, secrets, or payment data.

`npm run db:seed`, `npm run db:reset`, and the admin **Reset demo…** control replace demo business state. The CLI reset has production/path/extension safeguards; the seed command does not have the same production guard. Confirm `DATABASE_PATH` before either command. Admin reset invalidates all sessions, including the caller's.

## Threat-model limitations

Known limitations include:

- No rate limiting, account lockout, CAPTCHA, MFA, email verification, password recovery, or automated security alerting.
- Multipart parsing occurs before application per-file checks; deployment-level request limits are still required.
- File checks validate declared type, size, and short magic signatures only. There is no malware scanning, OCR, supplier identity validation, invoice authentication, image-content verification, or durable file-byte storage.
- The internal event chain is not digitally signed, trusted-timestamped, or externally anchored. A database administrator can rewrite data, and certificate rows are not protected by database-level immutability. Public lookup is not third-party verification.
- `REVOKED` exists in the schema, but no certificate-revocation operation is exposed.
- The anonymous weekly cap depends on a caller-controlled token stored in browser local storage. Demo mode allows three claims per token/week and offers an explicit next-demo-visitor reset for a shared kiosk; non-demo mode defaults to one. Clearing/changing the token creates another identity bucket, so production enforcement needs a privacy-preserving campus credential.
- API security headers do not demonstrate a global rendered-page header policy.
- SQLite is unencrypted by this application, process-local, and intended for one coordinated instance; ephemeral or horizontally scaled filesystems may lose or split state.
- No HTTP route exposes the production signed-carrier delivery method. There is no privileged-user/factor provisioning flow or durable object storage. Campus allocation and receipt are implemented, but the demo does not integrate a real freight carrier, kiosk hardware, or warehouse management system.
- Climate values are synthetic model assumptions, not measured outcomes. Security/integrity controls do not make the methodology externally validated.

## Deployment boundary

For a public hackathon demonstration, use only an isolated synthetic dataset, a durable writable SQLite volume, one application instance, HTTPS, the exact configured origin, restricted platform access, request-size controls, logging that avoids secrets, and a tested reset/recovery path. `DEMO_MODE=true` intentionally enables publicly documented accounts and simulators; it is unsuitable for real data.

For any real deployment, set `DEMO_MODE=false` and first add production identity provisioning, rate limits, durable evidence storage and scanning, database encryption/backups/migrations, a scalable datastore strategy, certificate signing/revocation, an authenticated carrier webhook, monitoring, incident response, and an independently reviewed climate methodology. The current repository should not be exposed as production software without that work.