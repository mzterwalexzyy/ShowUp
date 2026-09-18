# ShowUp architecture audit

## Approved architecture update, September 17, 2026

The implemented single-service custody architecture now supports immutable capacity and two payment modes without changing the verified Nimiq payment or refund primitives. `REFUNDABLE_DEPOSIT` remains the primary competition path. `PAID_ADMISSION` reuses exact payment verification and reservation ownership, then records `TICKET_CONSUMED` instead of creating an attendance refund. Event cancellation feeds both modes into the same durable refund worker.

Capacity is allocated inside the existing serialized `BEGIN IMMEDIATE` write transaction. The transaction expires old unpaid holds, counts confirmed seats and active holds, and inserts one new hold. This prevents two final-seat requests from both succeeding. Public availability is a database projection at read time.

Opened terms are frozen by both service checks and a database trigger. A canonical terms digest and freeze time cover payment mode, amount, capacity, dates, check-in window, cancellation policy, settlement policy, and disabled reward fields. Existing testnet databases receive additive migrations before the expanded immutability trigger is installed.

Venue challenges are rotating server records with digested tokens, short expiry, and revocation time. Issuing a new challenge revokes the prior active challenge. Closing the venue revokes every active challenge. Participant proofs bind the venue token digest and fail after venue revocation. The mechanism proves control of the reservation wallet and acceptance of an event-scoped check-in. It does not independently prove location or identity.

The future `EQUAL_ATTENDANCE_POOL` is separated from participant principal by design and disabled in validation. Enabling it requires a separate prefunded balance, deterministic equal-share and remainder rules, dedicated liabilities, and new safety gates. No random selection is allowed. This keeps refunds independent and avoids the competition's prohibited chance-based functionality.

The September 15 analysis below is retained as historical decision evidence. Statements that implementation was awaiting approval are superseded by this update and the completed testnet milestone.

Historical audit context, September 15, 2026. At that time the recommendation was awaiting approval and no application work had begun. The approved September 17 update above records the current architecture.

## Decision

Choose A, a NIM-only custodial deposit/refund service, limited to one allowlisted organizer and small events. Reuse selected Trove primitives, rebuild the financial workflow, and borrow AirNim's dependency-injection and lifecycle concepts. Do not fork either application wholesale. Defer USDT and optional rewards until the deposit/check-in/refund path passes its gates.

This recommendation is conditional on accepting server custody, funding operations for 12 months, and passing real-device sender-binding and crash-recovery tests. It is not a finding that either existing escrow is production-safe. If those gates cannot pass before submission, defer the refundable product or explicitly approve D as a different product. Do not advertise an unfinished refund service.

## Scope and evidence

Static source audit of `../nimiq-bounty` and `../AirNim`, including wallet composables, auth, payment verification, payout/refund services, database schema source, relevant API handlers, receipt components, and test script source. Line references below refer to the working files inspected on this date, not a pinned Git revision. No runtime or device tests were run. Comments claiming earlier device tests are historical assertions, not fresh evidence.

No `.env`, database contents, credential files, private keys, logs, installed dependencies, or local build output were opened. Test scripts were read, not executed. In particular, Trove's concurrency script reads `.env` and broadcasts transactions, so executing it would violate this audit's scope. Root/project AGENTS.md and system_architecture.md files were absent at the checked paths. The user's supplied instructions apply.

## Current official requirements

Cycle II is listed as August 24 through September 18. On September 15 there are about three calendar days left, not a fresh four-week cycle. Exact closing time and timezone still need confirmation in the submission dashboard. A working Mini Apps integration, meaningful NIM or USDT use, public GitHub source under MIT, and attribution are required. Reused work must be significantly differentiated. [Rules](https://miniappscompetition.com/rules)

The scoring weights remain 45 functionality/reliability/usefulness, 25 Nimiq integration, 15 real usage, 10 design/UX, and 5 promotion. The recommendation concentrates effort in the first two categories, but cannot compensate for missing real users. These are rubric weights, not predicted points. [Scoring](https://miniappscompetition.com/scoring)

The competition FAQ expects winners to maintain the app for at least 12 months. It also describes Nimiq use beyond accepting payment as part of the integration score. [Competition FAQ](https://miniappscompetition.com/faq) Prize milestones occur over three months and require continued operation and improvements. [Payout](https://miniappscompetition.com/payout)

The framework supports backends and the two wallet providers. This does not certify a backend's custody design. [Overview](https://nimiq.dev/mini-apps), [API overview](https://nimiq.dev/mini-apps/api-reference)

## SDK compatibility

Both manifests target Mini App SDK 0.1.0. The npm `latest` metadata returned 0.1.0 during this audit. Its published archive was inspected in memory, without reading local node_modules. Registry gitHead: `15f9c92d0ae4c9a86bec31a25684714c7442047b`. Trove uses `^0.1.0`, AirNim pins `0.1.0`. Installed/resolved versions were not inspected. [Published metadata](https://registry.npmjs.org/@nimiq%2fmini-app-sdk/latest)

The package exports `init({ timeout })`, `getHostLanguage`, and the NimiqProvider type. Its declarations support `listAccounts`, `sign`, and `sendBasicTransactionWithData` as used by both projects. Signing returns public-key/signature hex. Payments return a hash and accept integer Luna plus text data. The declarations include returned ErrorResponse objects, while the FAQ describes thrown errors. Handle both, preserve typed error codes, and verify actual host behavior. [Nimiq API](https://nimiq.dev/mini-apps/api-reference/nimiq-provider), [Technical FAQ](https://nimiq.dev/mini-apps/faq)

Provider caveats:

- Trove caches a rejected init promise forever. Reset it after failure so a later retry can work.
- Both use host-language/window.nimiq presence to decide whether to initialize. `window.nimiq` is declared in the published package, so its existence is not invented, but immediate detection can race delayed injection. Always obtain the provider through bounded `init()`.
- AirNim marks initialization successful before init completes and stores readiness globally while the shallowRef is local to a composable instance. A later instance can report initialized with no provider. Remove that split state.
- Retain AirNim's avoidance of deep reactive proxies around SDK instances. Trove's module-level provider similarly avoids this problem.
- No documented payment sender selector or NIM chain-switch method was found in the methods used here. `getNetwork()` in the package returns the ecosystem string `nimiq`, not mainnet/testnet identity. Never use it as a chain check.
- `listAccounts()[0]` does not establish that a payment came from that account. The same-wallet requirement needs independent transaction evidence.
- Neither account enumeration nor the native approval dialog authenticates a request to ShowUp's backend. A server-verified signature is required.
- The public Mini Apps sign reference does not fully specify signed-message prefix bytes. Trove uses SHA-256 over the Nimiq prefix, UTF-8 byte length, and message. The older official Hub reference supports the general convention, but current Hub examples differ in whitespace/length details. Retain one canonical encoding and require fresh ASCII and Unicode device fixtures. Do not accept several encodings to hide uncertainty. [Hub signing reference](https://nimiq.github.io/api-reference/sign-message), [Current Hub guide](https://nimiq.dev/hub/guide/transactions)

The local mini-apps skill prohibits third-party payment services, while the current official FAQ permits some. That stale instruction does not affect ShowUp, which uses NIM exclusively. Official provider documentation controls architecture claims.

## Findings from Trove

| Severity | Evidence | Finding and disposition |
| --- | --- | --- |
| High | `server/utils/nonces.ts:25`, `server/api/auth/verify.post.ts:21`, `server/utils/nimiq.ts:88` | Atomic nonce consumption and SignatureProof address binding are useful. Signed text contains only a Trove label and nonce, omitting domain, network, wallet, action scope, event/reservation, and signed expiry. Rewrite challenge format. |
| Medium | `server/utils/nonces.ts:31` | Consuming before signature verification prevents reuse but permits challenge-burning denial of service. Validate first, then atomically consume with authorization/state change. Expiry must be checked inside that transaction. |
| High | `server/api/bounties/[id]/fund.post.ts:89` | Sender matching is deliberately bypassed. Permissive third-party bounty funding does not satisfy ShowUp's wallet-bound deposit rule. `resolveOriginator` reads a contract's sender field as an informational heuristic, not verified spending authority. Reject this authorization shortcut. |
| High | `server/utils/nimiq.ts:137`, `server/api/bounties/[id]/fund.post.ts:96` | Independent RPC, escrow recipient, memo, minimum amount, and inclusion checks exist. No returned-hash equality, explicit network binding, execution-success check, or finality gate. Dropping success/network/proof fields in normalization prevents later checks. |
| High | `server/utils/escrow.ts:99`, `:212`, `:506` | History adoption matches memo only across 50 transactions. Payout verification omits expected sender, returned hash, network, and execution result. An incoming transaction with the expected memo can poison adoption and stall payment. Never treat memo alone as proof. |
| High | `server/utils/escrow.ts:289`, `:345`, `:366` | Insert-before-send stops concurrent duplicate calls per bounty. Signed bytes/hash are not persisted before broadcast. A crash leaves a claim without a recoverable hash, and the next call exits on that claim before history adoption. Safe refusal exists, automatic recovery does not. |
| High | `server/utils/escrow.ts:325` | Shared-wallet balance checks don't reserve aggregate liabilities or fees across different bounties. Sequential winner/referral calls don't serialize other requests. Zero fee is assumed. Replace with a bounded signer queue and ledger reservations. |
| Medium | `server/api/bounties/[id]/fund.post.ts:126` | Funding row, bounty transition, and lifecycle log are separate commits. Conditional update helps concurrency but crashes can leave incomplete receipt history. Two distinct payments for one bounty need explicit surplus handling. |
| Medium | `server/api/bounties/[id]/payout.get.ts:18` | Public GET changes financial state through verification. ShowUp GETs must be read-only, with worker-authenticated reconciliation. |
| Medium | `server/utils/nimiq.ts:155` | Every RPC failure becomes null/pending, concealing infrastructure outages. Adapt AirNim's distinction between unknown hash and unavailable RPC. |
| Medium | `server/utils/nimiq.ts:8`, `server/api/bounties/index.post.ts:36` | Stored balances are integer Luna, but input conversion uses floating multiplication and rounding without a safe-integer maximum. Reject for money input. |
| Medium | `server/db/schema.ts:42`, `:176` | Useful unique hashes and payout primary keys. Many statuses/amounts lack SQL CHECK constraints. Append-only logging is a convention and writes are not atomic with state changes. |
| Medium | `app/components/ProofOfReward.vue:38` | Promised versus funded is useful, but wording such as secured escrow overstates what chain receipt alone proves. Rewrite as funds held by ShowUp operator. |

`server/utils/session.ts` supplies a useful sealed-cookie boundary. Make HttpOnly, expiry, revocation, network scope, trusted-origin checks, and CSRF protection explicit. `auth/verify.post.ts:56` also returns `check.attempted`, which is not in SignatureCheck. Remove that stale diagnostic field. No fresh typecheck was run.

## Findings from AirNim

| Severity | Evidence | Finding and disposition |
| --- | --- | --- |
| Critical for reuse | `server/services/orders.ts:229` | Two calls can read no refund hash, both unconditionally set broadcasting, then both broadcast. INSERT OR IGNORE creates one refund record but does not give one worker exclusive ownership. A process restart in broadcasting can repeat the send. Reject refund executor. |
| High | `server/api/orders/index.post.ts:6`, `orders/[id]/confirm.post.ts:5` | No wallet signature/session authorization in these routes. Caller-supplied wallet is only address-validated. Knowledge of order ID permits lifecycle advancement. Reject as ShowUp authorization. |
| High | `server/api/orders/index.get.ts:6`, `server/services/orders.ts:287` | Public query by wallet returns order details, including phone, full wallet, and payment data. Reject public serializer and access policy. |
| High | `server/services/nimiq.ts:87`, `:141` | Receipt lookup, recipient, memo, minimum incoming amount, and exact refund amount exist. Sender/network/hash/execution/finality binding gaps match Trove. Refund destination uses the inferred originator, unsafe for unrecognized contracts. |
| High | `server/services/nimiq.ts:106` | Memo-only recovery across 100 history entries, with swallowed lookup errors. Bounded history absence is not evidence of non-broadcast. |
| Medium | `server/services/orders.ts:52`, `:122` | Explicit allowed predecessor states and injected dependencies are good concepts. State changes, payment persistence, and event recording aren't consistently atomic. |
| Medium | `server/services/orders.ts:178` | Delivery claim does not exclusively guard concurrent createBill calls. Even delivery idempotency depends on external behavior. None of this provider workflow belongs in ShowUp. |
| Medium | `server/services/config.ts:10`, `server/adapters/index.ts:7` | Mock mode is the default. Live adapter presence doesn't establish a working production service. Exclude all delivery adapters, phone handling, and rate conversion. |
| Medium | `server/services/rates.ts:73` | Floating exchange-rate conversion rounds into Luna. ShowUp uses fixed NIM amounts parsed from decimal strings. |
| Medium | `scripts/verify-invariants.ts:49` | Useful deterministic tests, but sequential and mocked. They don't exercise refund races or actual chain verification. `verify-memo-contract.ts` imports @nimiq/utils without a direct manifest dependency. |

## Exact reuse map

REUSE means selected generic helpers, with attribution and tests. ADAPT means significant changes are mandatory, not certification of the current file.

| Source | Decision | ShowUp destination or reason |
| --- | --- | --- |
| Trove `server/utils/nimiq.ts` getNimiqCore | REUSE | `server/nimiq/core.ts`, rename global cache key |
| Trove `server/utils/nimiq.ts` normalizeAddress/addressesMatch | REUSE | `shared/addresses.ts`, only after Core validation |
| Trove `app/composables/useWallet.ts` | ADAPT | `app/composables/useNimiqWallet.ts`, retryable singleton, signing, error codes |
| Trove `server/utils/nimiq.ts` signature helpers | ADAPT | `server/auth/signatures.ts`, fixtures and canonical challenges |
| Trove `server/utils/nonces.ts`, `session.ts`, `server/api/auth/*.ts` | ADAPT | New scoped auth/challenge/session services and routes |
| Trove `server/api/bounties/[id]/fund.post.ts` | ADAPT | Only unique-credit and compare-and-set ideas, new deposit service |
| Trove `server/utils/escrow.ts` | REJECT whole module | Preserve claim-before-send design, rebuild outbox/signer/reconciler |
| Trove `server/db/index.ts` | ADAPT | New isolated database connection, explicit transactions and FK checks |
| Trove `server/db/schema.ts` | REJECT whole schema | New event/reservation/payment/obligation entities |
| Trove `app/components/ProofOfReward.vue`, `TxProgress.vue` | ADAPT later | `ReceiptTimeline.vue`, `TransactionStatus.vue`; include unknown outcomes |
| Trove `app/components/OpenInNimiqPay.vue` | ADAPT later | Preserve event route, remove Trove fallback and raise touch targets |
| Trove `scripts/smoke-auth.mjs`, `audit-concurrency.mjs` | ADAPT test ideas | New isolated tests. Never copy secret-loading or live-spending setup |
| AirNim `server/services/nimiq.ts` nimiqRpc/fetchTransaction | ADAPT | `server/nimiq/rpc.ts`, strict schema and typed failures |
| AirNim `server/services/orders.ts` LifecycleDependencies/transition | ADAPT concepts | `server/domain/transitions.ts`, same-transaction events |
| AirNim `server/db/index.ts` unique payment/refund constraints | ADAPT concepts | New Drizzle migration, not existing database or DDL bootstrap |
| AirNim `scripts/verify-invariants.ts`, `verify-memo-contract.ts` | ADAPT test ideas | Fresh synthetic fixtures, concurrency and strict memo format |
| AirNim wallet Hub branch, all adapters/rates/phone/order routes/publicOrder | REJECT | Wrong scope, authorization/privacy flaws, extra wallet path |
| Trove bounty/winner/referral/reputation/AI routes and components | REJECT | Product coupling and unnecessary surface |

Trove has an MIT LICENSE with Trove contributors attribution. AirNim has no root LICENSE in the inspected tree. User ownership/relicensing rights must be established before literal AirNim code reuse. Independently implementing general patterns avoids copying unlicensed expression.

## Architecture options

Scores are engineering judgments from 1 poor to 5 strong. For effort and operations, 5 means easiest/lightest. Equal-weight totals are comparison aids, not competition scores. Security includes honest custody and operational failure, not just signature algorithms.

| Criterion | A NIM custody | B USDT contract + NIM proof | C direct NIM fee | D free RSVP + organizer-approved NIM reward |
| --- | ---: | ---: | ---: | ---: |
| Nimiq integration | 5 | 4 | 3 | 4 |
| Security | 2 | 3 | 4 | 4 |
| Reliability | 3 | 2 | 5 | 4 |
| Mobile UX | 4 | 2 | 5 | 4 |
| Demo clarity | 5 | 3 | 4 | 4 |
| Implementation effort | 3 | 1 | 5 | 4 |
| Real-user onboarding | 3 | 2 | 3 | 5 |
| Operational burden | 2 | 2 | 5 | 4 |
| Differentiation | 4 | 4 | 2 | 3 |
| 12-month viability | 2 | 3 | 5 | 4 |
| Total / 50 | 33 | 26 | 41 | 40 |
| Preserves required refundable-deposit proof | Yes, with custody | Yes, with oracle trust | No | No |

C and D score higher on simplicity because they remove the hardest requirement. They are product pivots, not interchangeable solutions to this brief. A is preferred among options preserving the promise, not because it wins an arbitrary total.

A: participant deposits are liabilities, not organizer reward funding. The operator holds them and pays the original authenticated wallet. Organizer funds only fees, optional rewards, and reserves. Use a dedicated ShowUp signer and database, never Trove's existing wallet or pooled balances. Cap value and seats, freeze event terms after opening, forbid early organizer withdrawal, and record cancellation/refund rules before accepting deposits. Automatic NIM transfers require an online signing authority under this design. Keep it separate from the public web server with policy limits. That reduces exposure but remains custody and cannot eliminate operator theft or loss.

B: a Polygon contract could enforce claim deadlines and participant fallback withdrawals without an operator holding token keys. Attendance still needs a trusted oracle or a carefully audited NIM-signature verifier and address-linking scheme. The NIM wallet and EVM address must both authorize their relationship. USDT approval, contract security, POL gas, token behavior, RPC availability, chain selection, and attendance attestations add failure modes. Contract-held funds alone don't make attendance trustless. No existing audited ShowUp contract was found. Do not build and market a novel escrow as safe in three days. [EVM provider](https://nimiq.dev/mini-apps/api-reference/ethereum-provider)

C: a direct, clearly nonrefundable NIM reservation fee is simple, but loses the deposit/refund promise and doesn't protect participants from a disappearing organizer.

D: free wallet-bound RSVP with signed check-in and an organizer-approved NIM reward avoids holding attendee funds. The organizer must approve payment in Nimiq Pay, so payment isn't automatic and can be withheld. It is the preferred fallback only if the user approves changing the product.

Nimiq has native HTLC, vesting, and staking contracts. Saying it has no smart contracts at all is inaccurate. It lacks the general programmable event escrow assumed by option B, and the documented Mini Apps methods don't provide a ready attendance-escrow lifecycle. A bespoke HTLC design is not a safe shortcut. [Protocol accounts](https://nimiq.dev/protocol/accounts)

## Mechanism corrections and release blockers

1. Separate event, reservation, attendance, deposit attempt, and refund states. MANUAL_REVIEW is recoverable, not terminal. A rejected check-in or refund request must not destroy an otherwise valid reservation.
2. Require successful execution, not block inclusion alone. Nimiq documents included failed transactions. Require finalized evidence before refund authorization and distinguish inclusion from final settlement. [Transactions](https://nimiq.dev/protocol/transactions)
3. Basic-account sender matching is the initial supported policy. Contract-funded Nimiq Pay payments are a mandatory device gate. If they occur, implement proof-based attribution before accepting those deposits or stop that funding path with recovery. Never infer control from an HTLC sender field alone.
4. A short-lived QR plus signature proves challenge possession and wallet control. Live QR relay remains possible. Keep the pilot supervised and low value. Don't claim cryptographic physical-presence proof.
5. Cancellation creates refunds automatically. An organizer cannot veto already verified attendance. For unresolved/no-show cases use a bounded dispute window and conservative refund default, as specified in product_spec.md. Service disappearance still cannot force on-chain recovery in A.
6. A full competition cycle could support a tested single-organizer pilot. Three remaining days are a much tighter constraint. A production-ready open marketplace, dual-chain escrow, and unattended multi-organizer custody are not credible scope here. A successful testnet walkthrough is not proof of production readiness or mainnet first-use reliability.

## Decisions needed before implementation

- Accept A's custody model, or choose D and change the product promise.
- Identify the operator and real pilot organizer, approve deposit/exposure caps and no-show rules, and commit maintenance funding.
- Confirm rights before literal AirNim reuse. Confirm competition closing time and whether a testnet-only submission would qualify. The reviewed rules don't explicitly settle testnet-only eligibility.
- Rewards are proposed as deferred. If essential for the first demo, they need separate prefunding, obligations, and verified receipts and must not delay principal refunds.
