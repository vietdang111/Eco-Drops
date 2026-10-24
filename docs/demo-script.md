# EcoDrops public demo video script

**Target runtime:** 2:50 (hard stop before 3:00)  
**Recording setup:** Run `npm run db:reset`, then `npm run dev`; use a fresh browser profile at `http://localhost:3000` so the anonymous weekly token has no prior claim. Keep the terminal and any real files off-screen. All shown data is synthetic.

| Time | Exact role and click path | Narration / proof point |
| --- | --- | --- |
| **0:00–0:12** | Open `/`. Point to **Hackathon demo**, the low/base/high preview, and **Estimated avoided emissions** / **Synthetic demo data** labels. | “EcoDrops routes safe, functional corporate surplus through independent receiving to anonymous campus access. Climate results are scenarios, not credits or measured outcomes.” |
| **0:12–0:22** | Open `/login`; click **Corporate** (one-click seeded account). | “Four role-scoped workspaces use synthetic demo credentials. Corporate users see only their organization.” |
| **0:22–0:42** | In the batch table choose `batch-synthetic-pending` (`PENDING_VERIFICATION`). In **Available action**, click **Create shipment**, then **Advance to delivered**. | “The pending batch already passed versioned intake gates. The carrier advance is explicitly simulated and every transition appends an audit event.” |
| **0:42–0:51** | Click the sidebar arrow labelled **Log out**. At `/login`, click **Warehouse**. | “Independent warehouse credentials are separate from the corporate uploader.” |
| **0:51–1:18** | Select `batch-synthetic-pending`, now `DELIVERED`. Click **PASS · exact**; leave **Synthetic demo image** selected; click **Record receiving**. In the refreshed inspector click **Certify eligible record**. | “Receiving records gross/tare weight, sample scans, evidence metadata, absolute variance, and verified units. Certification requires non-red risk, evidence, a certifiable variance, and an approver different from the uploader.” |
| **1:18–1:32** | Still as Warehouse, in **Campus distribution**, allocate 50 verified units to **Synthetic Demo Campus**. | “Only verified capacity can be reserved. Allocation changes the batch to DISTRIBUTING, but does not expose items to students yet.” |
| **1:32–1:45** | Log out → **Campus** → **Inbound campus allocations** → **Receive 50 items**. | “The addressed campus confirms receipt. EcoDrops creates 50 canonical apparel item records as AVAILABLE; a partial allocation leaves the batch DISTRIBUTING.” |
| **1:45–2:05** | Open `/kiosk`; choose **Apparel** and **Coursework** → **Show compatible items** → choose **Campus Apparel 01** → checkout → reveal. | “The kiosk can match the newly received items only after campus receipt. There is no student account or payment data, and retries are idempotent.” |
| **2:05–2:19** | Click **Return** → **Unsure** + **NO ANSWER** → submit → optional drop-back. | “No-answer remains unknown, not success. Drop-back returns the same item identity and increments circulation.” |
| **2:19–2:33** | Return to Warehouse or Corporate batch detail; in **Certified record**, click **Public view** and point to its five fields. | “The certificate remains verifiable while goods distribute. Public lookup exposes no organization, invoice, allocation, estimate total, or student data.” |
| **2:33–2:49** | Open `/login`; click **Platform admin** → **Verify audit chain** → **Inspect methodology**. | “Admins see global custody but cannot bypass certification or allocation capacity. Current factors are synthetic EcoDrops proxies; EPA sources are references only.” |
| **2:49–2:58** | End on the batch’s allocation ledger or `/methodology`. | “From HS-derived category to campus receipt and student outcome, every handoff is explicit and every climate value remains an estimate.” |

## Recording safeguards

- Do not show or upload real invoices, evidence images, names, emails beyond the published demo aliases, or personal browser data.
- Do not say “EPA factors,” “verified climate impact,” “authenticated invoice,” “carbon credit,” “offset,” “Scope 3 deduction,” “tax benefit,” “immutable,” or “third-party verified.”
- If an action fails or timing slips, reset and rerecord; do not edit the UI to fabricate success.
- The corporate-to-warehouse path above uses a seeded pending batch to stay under three minutes. To show intake in a longer live demo, use **Register a new surplus batch** with a unique invoice reference and synthetic invoice.
- Add captions, verify readable zoom, remove dead time, and confirm the final exported video duration is below 3:00.
- After upload, test the public video in a signed-out/private browser before replacing `TO ADD BEFORE SUBMISSION` in the README.