# ShowUp reduced implementation plan

## Product completion, September 18, 2026

User authorized all outstanding work. Complete the existing testnet product without enabling deferred rewards, mainnet, or deployment.

- [MODIFY] `app/utils/flow.ts`, `tests/flow.test.ts`: payment recovery, registration eligibility, and exclusive host groups.
- [MODIFY] `server/domain/service.ts`, `tests/product-rules.test.ts`: count active holds in host availability and return cancellation terms in private receipts.
- [NEW] `app/composables/useLiveRefresh.ts`: session-aware, non-overlapping read refresh with teardown.
- [MODIFY] participant, receipt, home, and host pages: use refresh, show recovery/cancellation/export, expose drafts and opening, and preserve failed draft creation.
- [MODIFY] scanner, venue panel, wallet and confirmation components: explicit error/expiry handling and prevent duplicate actions.
- [NEW] `scripts/product-smoke.py`, `docs/demo-runbook.md`: browser regression coverage and honest device/demo gates.
- [NEW] `server/worker/tick.ts`, `tests/worker-tick.test.ts`; [MODIFY] `server/plugins/refund-worker.ts`: wire the existing deadline handler into scheduled work with an overlap guard.
- [NEW] `server/api/reservations/[id]/payment-intent.post.ts`; [MODIFY] diagnostic wallet sending: record an unknown attempt before opening any payment dialog.

Validate with failing regression tests first, typecheck, full domain/concurrency tests, production build, and browser checks. Restart the existing LAN process only after the new build passes.

## Approved extension, September 17, 2026

The milestone now includes server-authoritative capacity and explicit `REFUNDABLE_DEPOSIT` and `PAID_ADMISSION` modes. The refundable path remains the demo and safety baseline. Paid admission shares authentication, atomic holds, exact on-chain verification, event cancellation refunds, and wallet-signed check-in. Its successful check-in records `TICKET_CONSUMED` and retains the admission payment.

Implementation order for this extension:

1. Expand event terms and additive migrations with payment mode, amount, participant cancellation policy, check-in window, settlement policy, terms digest/freeze time, and disabled reward fields.
2. Make durable reservation states explicit as `HOLD_CREATED`, `HOLD_EXPIRED`, `CONFIRMED`, `CHECKED_IN`, refund states, and paid settlement states.
3. Expire holds and count seats inside the reservation allocation transaction. Return server-calculated availability.
4. Branch check-in settlement by frozen payment mode. Keep event cancellation refunds common to both modes and apply the frozen paid cancellation policy.
5. Rotate and close venue challenges. Bind participant challenges to the venue token digest and reject revoked proofs at acceptance time.
6. Keep `EQUAL_ATTENDANCE_POOL` disabled. Document its separate-funding and deterministic-remainder requirements without implementing transfers.
7. Run domain, concurrency, migration, type, and production-build gates before visual work.

The existing Nimiq compatibility decision remains valid. These rules do not require a new provider method, a different proof format, or a weaker money-safety invariant.

Approved revision, September 15, 2026. Replaces the original Phase 1 plan. The user's approval overrides conflicting earlier proposals in architecture_audit.md, product_spec.md, and threat_model.md.

## Approved scope

Option A, NIM-only custodial pilot. User is initial operator. One allowlisted organizer. Testnet only until all money gates pass. Maximum 10 NIM per reservation, 20 participants and 200 NIM participant principal per event, represented as integer Luna. Refund wallet permanently equals the authenticated wallet proven to have funded the reservation.

Valid check-in unconditionally creates a refund obligation. Event cancellation refunds all verified deposits. Timely participant cancellation refunds. Missing attendance becomes NO_SHOW_PENDING. Only the operator may confirm forfeiture before the deadline. No decision or unresolved dispute defaults to refund.

Remove rewards, USDT, Polygon, discovery, self-service organizers, AI, referrals, reputation and multiple organizers. Trove/AirNim code reuse with attribution is approved. Never copy or read secrets, databases, credentials, logs or generated output. Deployment budget is accepted in principle. No purchase, deployment, mainnet transaction or real spending is authorized.

## Architecture

One Nuxt/Nitro Node application, one dedicated ShowUp database, one background refund worker within that Node service. A narrow server-only signer module uses a dedicated ShowUp key and strict destination, amount, fee and testnet policy. No separate signer process/IPC, full accounting ledger, broad dispute subsystem, public sharing or production backup automation.

Baseline: Nuxt 4.5.1, Vue 3.5.40, TypeScript 5.9.2, @nimiq/mini-app-sdk 0.1.0, @nimiq/core 2.7.1, @libsql/client 0.17.4, tsx 4.20.3. Verify current package types and exact runtime compatibility before scaffold. Use direct libSQL transactions and SQL constraints. One database per network, disposable databases for tests. Node 24 target, checked locally. No source-project database is opened.

## Minimum data model

| Table | Purpose and constraints |
| --- | --- |
| organizers | Canonical allowlisted wallet, role, enabled |
| events | Organizer, network, status, fixed times/cutoff/deadline/policy/amount/capacity, occupied seats/version |
| reservations | UNIQUE(event_id,participant_wallet), hold expiry, state, immutable beneficiary; accepted attendance fields stored here |
| auth_challenges | Login/action/check-in canonical bytes, all scope fields, nonce, issued/expiry/consumed times; one use |
| venue_challenges | Event, random token digest, expiry/revocation |
| payment_attempts | Reservation, claimed hash/unknown outcome, expected tuple, outcome, request key |
| verified_transactions | UNIQUE(network,transaction_hash), exact chain evidence/value, deposit reference, liability classification and principal disposition |
| refund_obligations | Unique verified deposit, fixed beneficiary and evidence-derived amount, state and exclusive preparation claim |
| transfer_attempts | Obligation, exact signed bytes/computed hash/fields, validity window and observed state; one active attempt per obligation |
| lifecycle_events | Append-only accepted/rejected transitions, reason, actor, scope, evidence digest and request key/result |
| operator_decisions | Small operator-only refund/forfeiture decision with evidence, timestamp and deadline |
| sessions | Token digest, wallet, expiry/revocation if database-backed |

Merge attendance into reservations and principal disposition/liability into verified_transactions. No generic ledger, attendance, sharing or idempotency table. Request-key results may live in lifecycle_events with a unique scope key. Actual received funds remain liabilities even if a booking expires or payment attempt is rejected.

Solvency uses sum of undisposed verified participant credits, unsettled refunds, and forfeitures still payable, counting each credit once. Reserve outbound fees separately from participant principal. Confirmed cash minus pending outflows must cover liabilities and reserved fees. If this cannot be proved under concurrent tests, introduce only the minimal additional liability structure needed.

## Invariants and state rules

- UNIQUE(event_id,participant_wallet), UNIQUE(network,transaction_hash), one accepted attendance per reservation, one principal disposition per deposit, one active prepared transfer per obligation.
- Challenges contain version, configured domain, action, wallet, event ID, reservation ID, nonce, issued time, expiry, network and payload digest. Use explicit none scopes for login. Check-in includes venue challenge reference.
- No database transaction stays open during wallet approval, RPC, signing or broadcast. Verify externally, then recheck state/time/version within the commit.
- Every accepted transition and rejection creates a sanitized lifecycle record. Exact transport retries return the recorded result. Malformed requests get a security event without disclosing another user's data.
- Immutable opened terms include deposit, cutoff, capacity, policy and event times. Organizer cannot suppress valid attendance refunds.
- Accept payment only after independent hash, sender, recipient, exact amount, network, memo, successful execution and finality verification.
- No hash-only acceptance, memo-only attribution, missing-field success defaults or guessed contract ownership.
- Late received deposits go directly to refund recovery. Extra actual transfers don't create extra seats or disappear.
- Browser refund destination and amount are ignored. Evidence fixes both.
- Check-in/cancellation/disposition races resolve atomically to one refund. NO_SHOW_PENDING isn't a final forfeiture.
- Unknown broadcasts enter MANUAL_REVIEW. Never erase a claim or blindly resend.

## Worker preparation protocol

1. Atomically claim an obligation and insert PREPARING attempt. Exactly one preparer wins. No automatic takeover can prepare a different transaction.
2. Fetch balance/height outside the transaction, verify backing and fee policy. Sign outside a transaction.
3. Persist exact signed bytes, computed hash and immutable fields under the unchanged claim before broadcasting. Failure to persist prevents sending.
4. One conditional transition selects broadcaster. Response hash must equal the computed hash. Timeout becomes MANUAL_REVIEW.
5. Independently reconcile stored hash to successful finality, then settle liability and lifecycle events atomically.
6. Restart inspects PREPARING/PREPARED/BROADCAST/MANUAL_REVIEW before new work. A PREPARING crash without signed bytes requires manual investigation, not automatic resigning.
7. Lease expiry or a not-found response never permits replacement. Any replacement requires complete stored-hash reconciliation, proof of nonexecution and expiry, and operator decision. Identical-byte rebroadcast is disabled unless explicitly validated.

## API contracts

Business POSTs require authenticated session, ownership/role, origin/CSRF checks, schema validation and idempotency key. Auth bootstrap is public but bounded and grants no financial authority without signature. Cookies are HttpOnly, expiring, revocable and Secure outside local development. GETs are read-only.

| API | Behavior |
| --- | --- |
| POST /api/auth/challenge, /verify, /logout | Scoped login proof and session lifecycle |
| GET /api/me | Authenticated wallet/role |
| POST /api/events, /api/events/:id/open | Allowlisted organizer creates and opens immutable event |
| GET /api/events/:id | Safe public event projection |
| POST /api/events/:id/reservations | Atomic seat hold, exact payment intent |
| POST /api/reservations/:id/payment | Owner submits hash or unknown result, queues independent verification |
| GET /api/reservations/:id | Private state and receipt |
| POST /api/events/:id/venue-challenge | Organizer issues short-lived venue code |
| POST /api/reservations/:id/check-in-challenge | Owner redeems venue code for scoped proof |
| POST /api/reservations/:id/check-in | Verify exact proof, atomically accept attendance/create refund |
| POST /api/events/:id/cancel, /api/reservations/:id/cancel | Policy-bound cancellation |
| POST /api/operator/reservations/:id/decision | Operator-only time-bounded disposition |
| GET /api/receipts/:id | Owner/operator private receipt |
| GET /api/demo-receipt | One redacted labelled demo fixture, no sharing platform |
| GET /api/health | Coarse operational health |

Return integer-Luna strings, stable result codes, current state and opaque receipt/request IDs. Never log private receipt payloads, secrets, sessions or signed transaction bytes. The auth shorthand paths in the table share /api/auth.

## Compatibility spike before scaffolding

Check current official docs, actual published package types and executed package behavior. Record SDK version, init and retry, accounts, signing, memo payments/hash results, errors, sender attribution, memo bytes, RPC success and finality in docs/nimiq-compatibility.md.

Separate actual-package tests with a synthetic adapter, read-only actual-testnet observations, and real Nimiq Pay device transactions. The former two cannot prove native host sender selection or a real ShowUp deposit/refund.

No invented provider/RPC methods. If sender attribution or finality fails the approved invariant, stop money implementation and propose the smallest correction. No model tests used to hide incompatibility. Scaffold only when the findings support the design.

## Exact proposed files

| Mark | Files | Purpose/source |
| --- | --- | --- |
| NEW | task.md, docs/nimiq-compatibility.md, scripts/compatibility-spike.mjs | Checklist and reproducible read-only evidence |
| NEW | package.json, package-lock.json, nuxt.config.ts, tsconfig.json, .gitignore, .env.example, LICENSE, THIRD_PARTY_NOTICES.md, README.md | Minimal scaffold after compatibility gate |
| NEW | server/db/index.ts, server/db/schema.sql | Dedicated database, compact invariants |
| ADAPT | server/nimiq/core.ts, server/auth/signatures.ts | Trove Core/signature primitives with fresh fixtures |
| ADAPT | server/nimiq/rpc.ts | AirNim typed-error concept with strict evidence |
| NEW | server/nimiq/verify.ts, server/nimiq/signer.ts | Full predicate and narrow server-only signer |
| NEW | server/domain/money.ts, challenges.ts, events.ts, reservations.ts, attendance.ts, refunds.ts, receipts.ts | Compact test-first domain services, all in server/domain |
| ADAPT | server/auth/session.ts, server/auth/authorize.ts | Trove ownership/session foundation with explicit checks |
| NEW | server/worker/refunds.ts, server/plugins/refund-worker.ts | Worker within the single service |
| NEW | server/api route files matching the API table | Thin authorized handlers |
| ADAPT | app/composables/useNimiqWallet.ts | Trove retryable flow and AirNim non-proxy holder, no Hub branch |
| NEW | app/app.vue, app/pages/index.vue | Plain diagnostic interface after backend tests |
| NEW | tests/auth.test.ts, money.test.ts, state.test.ts, payment.test.ts, concurrency.test.ts, refund.test.ts, privacy.test.ts | Disposable databases, all tests under tests |
| NEW | docs/operations.md | Manual backup/restore, solvency, custody and recovery procedures |
| REJECT | IPC signer, full ledger, broad disputes, public shares, deployment/backup automation | Removed from sprint |
| REJECT | Original secrets/databases/credentials/logs/build output and unrelated modules | Never read or copied |

## Dependency order and tests

1. Revise plan/checklist, run spike and record gate result.
2. Scaffold if supported. Write and execute failing tests before implementing money/auth/state/concurrency.
3. Auth tests: nonce replay, mutated payload, expiry, wallet mismatch.
4. Reservations: duplicate, last-seat race, immutable event terms.
5. Payments: fake hash, wrong network/sender/recipient/amount/memo, failed/pending, duplicate claim, late deposits, liabilities.
6. Attendance: duplicate, shared QR/wrong wallet, expired QR, cancellation race, exactly one obligation.
7. Refunds: simultaneous invocations, timeout after network acceptance, prepared/unknown restart, insufficient balance/fee, no second preparation.
8. Receipt authorization and public privacy projection. Check lifecycle record for every accepted/rejected path.
9. Run typecheck, unit/concurrency tests and production build. Only then add diagnostic controls and repeat checks.
10. Complete one actual Nimiq Pay testnet deposit/check-in/refund before claiming the money path works.

## Reporting and operations

Report implemented flow/files, exact executed tests/build, actual device/testnet evidence, blockers, UI readiness and time remaining before September 18. Mocked tests never stand in for the real flow.

Document manual encrypted backups, restore in no-send mode, post-backup reconciliation, operator-owned key custody, liability/balance checks, outage response and a 12-month service procedure. No automated production backup work, purchases or deployment in this sprint.
