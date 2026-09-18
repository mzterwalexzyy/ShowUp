# ShowUp product specification

## Approved product revision, September 17, 2026

ShowUp supports organizer-configured events with 1 to 20 seats and two immutable payment modes. The competition demo remains centered on `REFUNDABLE_DEPOSIT`. `PAID_ADMISSION` is a secondary supported mode. The organizer sets capacity, amount, payment mode, dates, check-in window, participant cancellation policy, settlement policy, and any reward policy before opening registration. Opening freezes a digest of those terms.

`REFUNDABLE_DEPOSIT` uses a participant deposit. Verified payment confirms the seat. A valid wallet-signed event check-in creates one unconditional principal refund. Event cancellation and participant cancellation before the cutoff create refunds. A no-show enters `NO_SHOW_PENDING`, and the existing time-bounded operator decision with default refund applies.

`PAID_ADMISSION` uses a ticket price. Verified payment confirms the seat. A valid check-in consumes the ticket without refunding the admission price. Event cancellation always refunds. Participant cancellation follows the frozen `REFUND_BEFORE_CUTOFF` or `NON_REFUNDABLE` policy.

Seat allocation is server-authoritative and atomic. Active unexpired holds plus confirmed reservations consume capacity. Expired unpaid holds become `HOLD_EXPIRED` and release one seat. A payment verified after expiry becomes a refund liability and never overbooks the event. Public availability is calculated from committed reservations and live holds, never from a browser counter.

The host activates a short-lived venue QR challenge. Scanning only redeems that venue challenge. The server then issues a participant-specific canonical challenge bound to domain, action, network, event, reservation, wallet, venue digest, nonce, issue time, and expiry. Nimiq Pay signs it, and the server verifies the exact wallet and consumes it once with the attendance transition. The host may rotate or close the venue challenge. Rotation revokes earlier venue challenges and participant proofs derived from them. This is a wallet-signed event check-in. It does not prove physical presence by itself.

`EQUAL_ATTENDANCE_POOL` is a deferred design only. It would use a separately prefunded fixed reward pool, equal integer-Luna shares for accepted attendees, and a frozen deterministic remainder policy. It cannot draw from deposits or ticket revenue, gate refunds, select winners randomly, or enter the MVP money path. The application currently rejects attempts to enable it. ShowUp has no raffle, lottery, random prize draw, or chance-based distribution, consistent with the competition's [prohibition on gambling and randomness-determined games of chance](https://miniappscompetition.com/rules).

Use `deposit` for refundable events, `ticket price` or `admission payment` for paid events, `reservation` before payment verification, and `ticket` or `confirmed seat` after verification. Do not describe these payments as staking.

### State model

The shared lifecycle is `DRAFT -> OPEN -> HOLD_CREATED -> PAYMENT_SUBMITTED -> PAYMENT_VERIFIED -> CONFIRMED -> CHECK_IN_OPEN -> CHECKED_IN -> COMPLETED`. Some intermediate states are append-only lifecycle events while the reservation row stores its durable state.

The refundable settlement branch is `CHECKED_IN -> REFUND_OBLIGATION_CREATED -> REFUND_PREPARED -> REFUND_BROADCAST -> REFUND_VERIFIED -> COMPLETED`. Paid admission uses `CHECKED_IN -> TICKET_CONSUMED -> COMPLETED`. Exceptional states are `SOLD_OUT`, `HOLD_EXPIRED`, `CANCELLED`, `NO_SHOW_PENDING`, `REFUND_PENDING`, and `MANUAL_REVIEW`.

### Data model additions

Events store `capacity`, `payment_mode`, `amount_luna`, `participant_cancellation_policy`, `check_in_opens_at`, `check_in_closes_at`, `settlement_policy`, `terms_digest`, and `terms_frozen_at`. Reward policy, pool, and remainder fields exist but remain disabled. Reservations store hold expiry, seat-counting state, attendance, and settlement state. Verified transactions store payment mode and principal state so refundable liabilities and retained admission revenue remain explicit.

Historical Phase 1 baseline from September 15, 2026 follows. Architecture A was later approved and implemented. The September 17 revision above controls where the sections differ.

## Target user and problem

One trusted community host running small, capacity-limited workshops or meetups for people who can use Nimiq Pay. Free RSVPs make it difficult to estimate attendance and allocate scarce seats. Whether deposits actually reduce no-shows is a hypothesis to measure, not a proven product claim.

ShowUp lets a participant reserve a seat with a small NIM deposit, sign a venue challenge using the reservation wallet, and track repayment to that wallet. The operator holds deposits in custody. Payment and refund evidence are checked independently of the wallet response.

Proposed pitch: Refundable event deposits with wallet-signed check-in and verifiable NIM refunds.

Remove instant rewards from the MVP promise until separately funded rewards are implemented and verified. Refund submission can be fast, but chain confirmation and finality timing must remain visible.

## MVP boundaries and proposed defaults

These are proposed policy settings for approval, not observed deployment values.

- One allowlisted organizer, one active event, maximum 20 seats.
- Default deposit 100,000 Luna, equal to 1 NIM. Initial per-seat maximum 1,000,000 Luna. Maximum unsettled participant exposure 20,000,000 Luna across the pilot. These small amounts may be too weak an incentive, so validate with users before increasing them.
- Fixed NIM amount, no fiat conversion, no percentage fee taken from the returned principal.
- Organizer/operator prefunds outbound network fees and an operational reserve separately. Participant pays any inbound wallet fee disclosed at approval.
- No third-party funding or transferable reservations initially. Refund address is the authenticated reservation wallet, never a form field.
- Ten-minute unpaid seat hold. Once it expires, a late payment creates a recoverable financial liability but does not silently take another person's seat.
- Event includes an immutable UTC start, end, check-in window, and cancellation cutoff. Display local times explicitly. The cancellation cutoff is 24 hours before start, or the opening time if the event is created later.
- QR rotates every 30 seconds. Redeeming it while valid issues a wallet-specific challenge valid for up to 120 seconds, bounded by check-in close. This lets the user finish the native signing dialog without racing QR rotation.
- One authenticated participant can have one reservation per event. Multiple wallets remain possible and aren't treated as unique humans.
- Testnet and production use separate deployments, databases, signers, origins, and receipts. No mocked money paths in either runnable experience.

## Participant journey

1. Open an event link inside Nimiq Pay. Review deposit, time, custody, cancellation/no-show policy, network, and fees before reserving.
2. Tap Connect, approve account access, then explicitly approve the sign-in challenge. The backend verifies the signer and establishes a session.
3. Request a seat hold. The backend snapshots the wallet, event terms, amount, recipient, network, memo, and expiry and returns a reservation ID.
4. Tap Pay deposit. Send the server's exact amount and memo through the provider. A hash means submitted, not paid.
5. The backend verifies transaction identity, sender control, recipient, amount, memo, network, execution, and finality. Show pending until the evidence is sufficient. The pass becomes reserved only after this gate.
6. At the venue, tap Scan check-in QR. The QR identifies a server-issued venue challenge, not the participant. Redeem it for a challenge bound to this reservation and wallet.
7. Approve signing. The server verifies the exact issued bytes and consumes the nonce atomically with attendance and refund-obligation creation.
8. The worker sends the refund without needing another organizer approval. The receipt progresses from refund owed to submitted to verified. The participant can close the app and resume later.
9. A second fresh check-in attempt is rejected as duplicate, with the original receipt available. Exact transport retries return the original successful result. Wrong-wallet and expired-challenge attempts produce clear rejection receipts without changing attendance.

Wallet switching requires reauthentication. A cached session cannot authorize a different wallet's signature or change the fixed refund destination. Outside Nimiq Pay, browsing and help work, with a clear way to open the event in Pay. Do not add Hub checkout for this MVP.

## Organizer journey

1. Authenticate with an allowlisted Nimiq wallet. Create a draft containing title, venue, capacity, times, amount, and policy.
2. Prefund the operator's fee reserve through a separate intent and verified receipt. Participant deposits are not the reserve. No event opens if liability caps or funding requirements fail.
3. Open the event and share its direct link. Monetary terms and refund destinations cannot change after opening. Material time/venue changes require cancellation and fresh reservations.
4. Display the rotating challenge on a separate venue screen. A private organizer session authorizes issuing the QR. No signing key appears in the QR.
5. Observe reservation/check-in counts and exceptions. Valid attendance automatically creates a refund entitlement. The organizer cannot select who receives an already earned refund.
6. Close check-in at the scheduled time. Review unresolved attendance with the operator. Cancellation refunds everyone who paid. No early withdrawal of attendee funds is available.

## State model

The brief's linear list mixes several objects. Model them independently and compute the user-facing overall status.

| Object | States |
| --- | --- |
| Event | DRAFT, OPEN, CHECK_IN_OPEN, CLOSED, CANCELLED |
| Reservation | RESERVATION_PENDING, RESERVED, CANCELLED, EXPIRED, NO_SHOW, COMPLETED |
| Deposit attempt | DEPOSIT_SUBMITTED, DEPOSIT_INCLUDED, DEPOSIT_VERIFIED, DEPOSIT_REJECTED, DEPOSIT_UNKNOWN |
| Attendance | NOT_CHECKED_IN, CHECK_IN_SIGNED, ATTENDANCE_VERIFIED |
| Refund obligation | REFUND_CLAIMED, REFUND_PREPARED, REFUND_BROADCAST, REFUND_INCLUDED, REFUND_VERIFIED, MANUAL_REVIEW |
| Request outcome | ACCEPTED, REJECTED, including REFUND_REJECTED for an ineligible request |
| Optional reward, deferred | PROMISED, FUNDED, CLAIMED, BROADCAST, VERIFIED, MANUAL_REVIEW |

CHECK_IN_SIGNED records receipt of a signature attempt, not accepted attendance. Invalid attempts get a rejection event and do not advance attendance. An accepted signature, ATTENDANCE_VERIFIED, and REFUND_CLAIMED are committed together.

| Transition | Required evidence or condition |
| --- | --- |
| DRAFT to OPEN | Organizer authorization, valid fixed terms, capacity/exposure limits, fee reserve |
| OPEN to CHECK_IN_OPEN | Server time inside fixed window and authorized venue activation |
| OPEN/CHECK_IN_OPEN to CANCELLED | Organizer or operator authorization, immutable cancellation reason, refund obligations created for verified payments |
| RESERVATION_PENDING to RESERVED | Matching finalized successful deposit, unexpired hold, event still accepting reservations |
| RESERVATION_PENDING to EXPIRED | Hold timeout, seat released once, any later funds still reconciled |
| RESERVED to COMPLETED | Accepted attendance and REFUND_VERIFIED |
| RESERVED to CANCELLED | Timely participant cancellation or event cancellation; settlement remains separately visible |
| RESERVED to NO_SHOW | Window closed, no accepted attendance, grace period elapsed; not automatic authorization to keep funds |
| Refund CLAIMED to PREPARED | Unique entitlement, solvency/fee checks, one leased signer, signed bytes and hash durably recorded |
| PREPARED to BROADCAST | Submission acknowledged for the stored transaction |
| BROADCAST to INCLUDED to VERIFIED | Independent successful chain evidence followed by finality |
| Any uncertain money attempt to MANUAL_REVIEW | Timeout, crash gap, conflicting evidence, or unsupported sender proof |
| MANUAL_REVIEW to known state | Reconciled evidence and audited authorized decision, never a blind resend |

CANCELLED, EXPIRED, and NO_SHOW terminate reservation eligibility, not repayment duties. REFUND_REJECTED terminates a particular request, not the underlying deposit. MANUAL_REVIEW is deliberately recoverable. This corrects the proposed requirement to treat every listed state as terminal.

## Cancellation, no-shows, and disappearance

Proposed default policy:

- Before the cancellation cutoff, participant cancellation creates a full-principal refund and releases the seat.
- After the cutoff, a participant may mark cancellation but is told that no-show settlement rules apply. Funds remain a liability until disposition.
- Event cancellation, an event that never opens check-in, or verified attendance creates an immediate full-principal refund entitlement. Settlement still depends on the worker and chain.
- No signed check-in at closing time enters a grace/dispute period ending 24 hours after the scheduled event end. A participant can submit a private refund dispute. The organizer cannot make the final decision.
- For the supervised pilot, only the independent ShowUp operator may confirm a no-show forfeiture, with evidence that the event actually ran and check-in was available. The organizer cannot unilaterally keep funds. Forfeited value becomes a separately recorded organizer payable after the dispute window, never silently becomes free signer balance.
- If evidence is insufficient, the organizer disappears, or the operator misses that decision deadline, the scheduled policy refunds the deposit. Disputes unresolved at the deadline also default to refund. This favors participant recovery and allows some abusive claims. Record that tradeoff rather than pretending to solve attendance arbitration.
- Organizer payout of finalized forfeitures is an audited operator process with a unique obligation and the same transaction journal, not a public withdrawal endpoint. A zero-forfeiture pilot is acceptable only if advertised accurately.
- If ShowUp's server or signer disappears, the deadline policy cannot execute itself on Nimiq. Participants have a custodial claim and exported receipt, not a unilateral on-chain escape hatch. The operator's maintenance/recovery commitment is essential.

## Failure and recovery paths

| Failure | Participant explanation | Recovery |
| --- | --- | --- |
| Wallet permission denied | Request cancelled in wallet | Return to the relevant action, no auto-prompt loop |
| Provider initialization failed | Open in Nimiq Pay or retry connection | Clear failed initialization promise |
| Payment dialog timed out | Payment outcome unknown, checking before another payment | Reconcile matching chain transfer, no automatic second send |
| RPC unavailable | Verification temporarily unavailable | Retain attempt, bounded retries and operator alert |
| Fake/foreign hash | Payment doesn't match this reservation | Rejection receipt, permit a new correctly scoped attempt |
| Under/overpayment | Received amount differs from requested deposit | Do not reserve, record actual liability and refund supported payer; never erase money because the attempt failed |
| Wrong or unsupported sender | Payer doesn't match the reserved wallet | No credit. Quarantine funds and use proof-based recovery, never refund a guessed HTLC party |
| Late/double payment | Extra payment received, no extra seat granted | Unique liability per actual transfer, refund extra principal |
| Wrong memo or unsolicited transfer | Payment could not be linked automatically | Operator reconciliation with proof of control, no credit based on memo similarity |
| Wrong network | Payment isn't on this event's network | No credit. Separate network recovery, no automatic cross-chain refund |
| Camera denied/unavailable | Camera access is unavailable | Retry permission or enter the same short-lived venue code with rate limits; device scanning remains a release gate |
| QR expired before redemption | This venue code expired | Scan the current code |
| Signature challenge expired | Signing time expired | Fresh wallet-specific challenge, no reuse |
| Wrong-wallet signature | Use the wallet that reserved this place | Reauthenticate correct wallet, preserve reservation |
| Duplicate check-in | Already checked in | Show original attendance/refund receipt |
| Refund broadcast timeout | Refund is being reconciled | Query stored hash and transaction, never recreate blindly |
| Fee reserve depleted | Refund queued, operator notified | Stop new deposits, replenish fees, preserve liabilities |

## Receipt model

Every reservation, payment attempt, accepted signature, rejected attempt, refund, optional reward, and policy decision gets an inspectable lifecycle receipt. Receipts state their evidence level: promised, submitted, included, finalized/verified, rejected, or unknown.

Store receipt ID, schema version, object IDs, server timestamp, actor role, before/after state, reason code, evidence digest, network, monetary units, applicable transaction hash/block/finality evidence, and correlation/idempotency key. Append events in the same transaction as the state change. Never overwrite rejection history when a later attempt succeeds.

Keep promised deposit, submitted claim, actual verified incoming value, refund owed, refund submitted, refund verified, and reward amounts separate. A displayed total must not add the same principal across these stages.

Private receipt: available to the participant and scoped operator, links exact challenge bytes, signature/public key, deposit, and refund. The organizer sees only the minimum attendance status needed. Public receipt: opt-in redacted projection, without names, contact details, exact location, full wallet, raw signature/challenge, or private IDs. By default expose evidence digests and coarse status only. Linking a transaction publicly reveals its addresses through the explorer, so hash/link publication requires an explicit privacy choice. Never call a shortened address anonymous.

Public receipts can show a server attestation but cannot independently prove the entire private attendance bundle. The participant can export that bundle or choose to share it. A hash chain makes later modification detectable relative to a saved checkpoint, not impossible for a compromised operator. Reject attempts with no legitimate reservation receive an opaque support ID, not another participant's data.

## Success path and demo

Success requires an actual Nimiq Pay deposit, independently verified execution, a wallet-bound attendance signature, a refund transaction to that wallet, and a linked receipt. No mocked transfer or simulated confirmation counts.

An 85-second storyboard, rehearsed on real devices:

| Time | Moment |
| --- | --- |
| 0-10s | Show event, deposit/custody/network, reserve with an already authenticated demo wallet |
| 10-25s | Approve real deposit, show submitted and independently verified evidence |
| 25-45s | Scan venue QR, sign wallet-specific challenge |
| 45-65s | Show attendance accepted, refund submitted, then verified receipt |
| 65-85s | Show duplicate, wrong-wallet, and expired-code rejection examples with their receipts |

Chain finality may exceed these timing slots. If it does, use an honestly edited recording with elapsed waits labelled, or show a previously finalized receipt alongside the current pending transfer. Do not shorten settlement gates for the video. Negative examples can use separate prepared reservations and devices, with a replayable test procedure. Optional rewards are excluded from the default demo.

## Real-user validation and deferred features

Pilot target: one real host and 5-10 consenting participants, measured separately from builder/test wallets. Record reservation completion, verified deposits, attendance rate, refund success/latency, rejected/recovered attempts, and user feedback. Compare no-show rates with the host's prior events only as exploratory evidence, with small-sample limitations. No fabricated usage or claim of proven no-show reduction.

Defer public event discovery, organizer self-service onboarding, USDT, contracts, staking, AI, referrals, transferable passes, multiple tickets per wallet, fiat pricing, automatic rewards, GPS/biometrics, offline acceptance, and sophisticated attendance fraud detection. Availability targets, financial limits, custody, and fallback refund rules must be approved before implementation.
