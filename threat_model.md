# ShowUp threat model

## September 17, 2026 payment-mode and capacity update

| Threat | Control | Residual risk |
| --- | --- | --- |
| Final-seat race | Capacity count and hold insert run in one immediate database transaction. | One service database remains the serialization boundary. |
| Browser falsifies availability | Server calculates available seats from confirmed reservations and active holds. | Display may be stale until refreshed, but cannot allocate a seat. |
| Expired hold later pays | Verification records the actual credit, creates refund recovery, and never restores the seat. | Participant waits for refund finality. |
| Organizer changes price, mode, window, capacity, or policy | Opening records a terms digest and freeze time. Service and SQL trigger reject later edits. | Database administrator compromise remains a custody risk. |
| Paid ticket check-in accidentally refunds | Payment mode is stored on the event and verified credit. Check-in branches explicitly to `TICKET_CONSUMED`. | A code defect is bounded by tests and low pilot caps. |
| Event cancellation retains admissions | Cancellation creates refund obligations for verified credits in both modes. | Worker or signer outage can delay settlement. |
| Shared QR is treated as attendance proof | QR only identifies a revocable venue challenge. Wallet-specific signature and exact reservation binding are required. | A participant can share a live QR. The wallet signature proves participation in the protocol, not physical location. |
| Replayed or cross-scoped proof | Canonical message binds domain, action, network, event, reservation, wallet, venue digest, nonce, issue time, and expiry. Consumption is atomic and single-use. | Compromised wallet control remains outside the app. |
| Rotated or closed venue remains usable | Rotation and closure set `revoked_at`; redemption and acceptance recheck it. | Host operational error can close check-in early and requires policy handling. |
| Reward pool consumes participant money | Reward policy is disabled. Future design requires separate prefunding and liabilities. | Future implementation needs independent solvency tests. |
| Chance-based incentive violates rules | No raffle, lottery, draw, or random allocation exists. Equal attendance rewards are deterministic and deferred. | Legal review still depends on operating jurisdiction. |

GPS, biometrics, and personal identity collection remain outside scope. Paid admission does not weaken exact sender, recipient, memo, amount, execution, network, proof, and finality verification.

Phase 1, September 15, 2026. Proposed NIM custodial pilot. These mitigations are requirements to implement and test, not controls already deployed.

## Assets and trust boundaries

Assets: participant principal, organizer fee/reward reserve, fixed refund destinations, signing authority, session credentials, unused challenges, seat inventory, attendance records, and receipt integrity/privacy.

Boundaries:

1. Participant browser/WebView to Nimiq Pay. The frontend is untrusted. Sensitive wallet actions require native approval. ShowUp never receives the participant's private key.
2. Browser to HTTPS application server. Every business mutation requires wallet-authenticated session ownership and role checks. Authentication bootstrap is necessarily public but narrowly scoped, origin-checked, rate-limited, and creates no financial entitlement before a valid signature.
3. Application server to database. Transactions enforce invariants and append events. SQL constraints protect against application mistakes but not a database administrator deliberately bypassing them.
4. Public app to isolated refund signer. The signer accepts narrowly scoped obligations from an authenticated worker, enforces caps, and verifies the persisted intent/evidence. The app process has no signer key. A malicious authorized operator remains a custody risk.
5. Worker to chain RPC. An independent RPC is independent of the wallet's claim, not independent consensus verification. Validate schema, network, hash, successful execution, and finalized block evidence. Use a second independent source to corroborate money movement and freeze on disagreement.
6. Venue QR display to participants. QR possession is relayable. Wallet signing binds possession to a key, not physical location.
7. Private evidence to public receipt. Any public transaction link can expose wallet addresses. Redaction must happen server-side before serialization.

Assume attackers can craft requests, race calls, alter the frontend, share QRs, submit arbitrary hashes/signatures, and trigger network delays. Do not assume organizer honesty, uninterrupted servers, stable RPC service, or a perfectly funded signer.

## Threats, controls, and residual risk

| Threat | Attack or failure | Required mitigation and test | Residual risk |
| --- | --- | --- | --- |
| Signature replay | Reuse accepted proof on another request, event, origin, or network | Versioned canonical challenge includes domain, action, wallet, event ID, reservation ID, nonce, issued time, expiry, network, and action payload digest. Verify stored exact bytes and atomically consume. Race the same nonce across workers. | Stolen unused proof can race its owner until expiry. Restrict session and intent binding. |
| Challenge substitution | Client submits different IDs, amount, action, or expiry than displayed | Server issues and stores complete payload. Verification accepts challenge ID, public key, signature only, never client-reconstructed authority fields. Mutate each field in tests. | Compromised frontend may deceive users into approving a real harmful action. Human-readable signing and strict server policy limit impact. |
| Nonce burning/DoS | Invalid signature consumes another user's challenge | Verify signature first, then atomically consume with expiry and state predicates. Rate limit issuance and validation, cap outstanding challenges and body size. | Flooding can still impair availability. No IP-only identity policy. |
| Duplicate check-in | Two scans or workers both accept attendance | Unique attendance reservation key, single-use challenge, transactionally create attendance + refund entitlement + receipt. Exact request retry returns saved result; new attempt returns DUPLICATE_CHECK_IN. | Two wallets can still represent one person. |
| QR sharing/relay | Attendee sends current QR to someone elsewhere | Short-lived high-entropy QR, authenticated issuance, redemption limits, per-wallet derived challenges, one check-in per reservation, supervised low-value event. Test expired redemption and rapid sharing behavior. | Real-time relay is accepted residual risk. No proof of physical presence claim, no high-value automated rewards. |
| Wrong-wallet check-in | Another valid key signs the reservation challenge | Require session wallet = reservation wallet = signer proven by SignatureProof. Revalidate on every mutation. Test valid signature from wrong key and stale session after wallet switch. | Wallet key sharing cannot be detected. Lost-wallet recovery isn't automatic. |
| Fake or reused hash | Attacker supplies any successful transaction or guesses another's hash | Lookup independently, compare requested/returned/computed hash, bind network, sender, destination, exact amount, memo, success and finality. Unique network+hash credit. Never create verified credit from a pending claim. | Correlated dishonest RPCs remain possible without local consensus verification. |
| Failed included payment | Transaction charged fees but principal transfer failed | Preserve execution outcome from node schema and require success before credit. Test an included failure, not just unknown hash. | If RPC cannot establish execution/finality, verification must stop. |
| Underfunding/overpayment | Too little/too much NIM or numeric overflow | Decimal-string parsing to integer Luna, safe bounds, exact amount gate, separate actual-received liabilities. Reject fractions/exponents/NaN/overflow. Refund surplus or mismatched incoming payments only after payer verification. | Unsolicited transfers may require operator recovery and cannot be prevented on chain. |
| Contract sender confusion | Attribute an HTLC spend to its sender field or return funds to a contract that cannot receive them usefully | Never use resolveOriginator as authorization. Initially require basic sender equality. Device gate must resolve whether Pay's real spending path meets this rule. Any contract support needs validated transaction proof and historical contract context. | Unsupported sender funds can be quarantined. This is a launch blocker if normal users hit it. |
| Concurrent refunds | Two calls share refund row but both send | Unique obligation, atomic claim with lease/fencing token, durable signed transaction and deterministic hash before send, signer-side same-obligation deduplication. Test separate processes and distinct obligations against one wallet. | A fencing token alone cannot retract an already signed transaction. Recovery must use the stored bytes/hash. |
| Unknown broadcast | Node accepts send, response lost, process crashes | Mark outcome unknown. Reconcile stored hash and canonical chain before action. Never make a fresh transfer because a request timed out. Only rebroadcast identical persisted bytes under a tested policy. | RPC outage or missing durable record requires manual review. Refund can be delayed. |
| Misleading history adoption | Match an incoming/spoofed memo or overlook older outgoing tx | No memo-only adoption. Require complete expected tuple and stored hash. Paginate history for discovery only. Absence in 50/100 results isn't proof of no payment. | Full-history unavailability can prevent automatic reconciliation. |
| Organizer abuse | Change terms, veto check-in, cancel selectively, empty escrow, falsely declare no-show | Freeze terms at OPEN, role authorization, no organizer key access or early withdrawal, automatic accepted-attendance refunds, operator-reviewed no-show rules with timeout default refund. Test cancellation/check-in/settlement races. | Organizer and operator collusion can defeat off-chain policy. Custody disclosure must say so. |
| Disappearance | Organizer or service vanishes | Organizer absence/cancellation creates refund eligibility independent of organizer. Durable scheduled worker, backups, operator runbook and recovery owner. Stop new deposits on degraded service. | Complete operator/signer loss has no unilateral chain recovery under A. |
| Server compromise | RCE steals signer key or issues fraudulent obligations | Separate signer identity/key store, minimal permissions, fixed destination policy, balance/exposure/daily limits, evidence validation, patched dependencies, authenticated worker, emergency stop of new obligations. | A signer or policy administrator compromise can lose funds. Isolation is not trustlessness. |
| Insolvency/fee exhaustion | Rewards or other events consume refundable principal | Dedicated ShowUp wallet, per-purpose liability accounting, fees separately reserved, outbound queue, cap total exposure, pause intake on shortfall. Test parallel different-reservation refunds and depleted fees. | Fees and infrastructure failures can delay settlement. No promise of guaranteed instant refund. |
| Cross-site mutation/session theft | CSRF, XSS or long-lived stolen cookie issues actions | Secure HttpOnly SameSite cookie, bounded lifetime/revocation, origin and CSRF checks, CSP, no raw HTML, fresh action challenge for high-impact mutations. Session never allows changing a refund wallet. | Same-origin compromise can act through the victim's session. |
| Data privacy | Public receipt/order enumeration reveals phone, wallet or attendance | No phone/name collection for MVP, opaque receipt tokens, server-side redacted projection, no public raw proof, no QR/challenge in access logs, private export with access checks. Test IDs and public serializers. | On-chain records are public. A willingly shared tx hash links addresses. |
| Receipt tampering | Change status without log or rewrite past events | State+event transaction, monotonic sequence, unique transition key, app-role append-only policy, digest chain with externally saved checkpoints, encrypted backups. Test rollback of state when event insert fails. | DB owner can rewrite history without independent checkpoints. |
| Capacity race/late payment | Two last-seat claims or payment arrives after hold released | Atomic seat allocation and release, fixed reservation expiry, late-payment refund liability separate from seat state. Race payment verification with cancellation/expiry. | A participant can pay near expiry and receive a refund instead of a seat. Explain before payment. |

## Canonical signed challenges

Use a stable, versioned ASCII-labelled message, with a canonical serialization specification. Fields include `version`, `domain`, `action`, `wallet`, `eventId`, `reservationId`, `nonce`, `issuedAt`, `expiresAt`, `network`, and `payloadDigest`. Check-in also binds `venueChallengeId` and its redemption time. Event-level actions use reservationId `none`. Authentication uses eventId/reservationId `none`. These explicit sentinels avoid omitted fields and aren't interpreted as wildcard authorization.

The configured public origin is the domain authority. Never derive it from an unchecked Host header. The server chooses timestamps and network. A challenge must satisfy issuedAt <= now < expiresAt and the action's state/window predicates at commit. The nonce has at least 128 bits of cryptographic entropy. Signature/key hex lengths are bounded and parsed before cryptographic work.

Use Trove's single signed-message encoding only after confirming it with current Nimiq Pay fixtures. Require exact public-key ownership and proof validity. The verification endpoint returns a stable result code, not low-level cryptographic diagnostics or raw backend errors.

## Money invariants

- No accepted payment before authenticated reservation ownership and independent successful, finalized evidence.
- A network+transaction hash creates at most one incoming credit, even across payment attempts and reservations.
- Actual inbound funds remain liabilities even if the business attempt is rejected, late, cancelled, or duplicated.
- Refund principal cannot exceed the corresponding verified recoverable incoming credit. Each incoming credit has at most one principal-disposition obligation.
- Refund and no-show forfeiture are mutually exclusive dispositions. Attendance acceptance, cancellation, timeout default refund, and forfeiture decision race on the same disposition guard.
- No new broadcast without a persisted unique obligation and exact signed transaction. Unknown outcome never clears that obligation.
- Sum of unsettled refund liabilities, unsettled principal awaiting disposition, organizer payables, reward liabilities, and reserved fees must not exceed available backing under the conservative ledger view. Confirmed outflows reduce both cash and their matched liabilities atomically in accounting. Pending outgoing amounts remain reserved.
- No reward draws from attendee principal. Rewards never gate principal refunds.
- A payment marked INCLUDED is not automatically VERIFIED. Nimiq describes failed included transactions and macro-block finality. [Protocol transaction reference](https://nimiq.dev/protocol/transactions)

## Incident and recovery policy

On chain disagreement, unresolved broadcast, signer balance shortfall, or stale reconciliation heartbeat, stop accepting new deposits and flag affected obligations. Continue read-only receipts and safe reconciliation. Refund obligations are not erased by pausing intake.

For each unknown send, load the persisted transaction/hash, inspect expected fields and network, and query independent sources. If successfully finalized, settle that exact obligation. If still pending, keep waiting or rebroadcast identical bytes under the validated policy. If the transaction has definitively expired and complete canonical history establishes it never succeeded, an operator may authorize one replacement linked to the same obligation with a new attempt ID. No replacement based only on a not-found response. Missing evidence stays in MANUAL_REVIEW.

Backups must preserve obligations, signed-attempt records, and append-only events together. Recovery from an old backup starts in no-send mode and reconciles all chain movements after the backup watermark before enabling signing. Do not rotate/delete claim records to repair the UI. Key compromise requires intake shutdown and a separately authorized incident response, never automatic movement of funds to an unreviewed address.

Private evidence retention proposal: 90 days after final settlement, then delete raw signed challenges/signatures unless a dispute requires retention and users were informed. Retain minimal financial ledger/digests for the approved maintenance period. Exact legal obligations depend on operating jurisdiction and must be settled before real-money release. Public chain data cannot be deleted by ShowUp.

## Acceptance gates and unresolved risks

Before real-money release, demonstrate attack tests for every critical row, two-worker refund races, crash at each send boundary, successful/failed transaction distinction, real-device sender attribution, cancellation without organizer cooperation, receipt access isolation, and backup recovery without double send. No original project tests were executed during Phase 1.

The three largest remaining risks are operator custody/liveness, weak physical-attendance assurance, and insufficient time to validate the money path and actual mobile wallet behavior. Low caps reduce financial impact but don't fix those risks. A knowledgeable operator must explicitly accept the residual risk and the user must approve the architecture before implementation.
