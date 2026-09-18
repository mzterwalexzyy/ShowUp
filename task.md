# ShowUp backend milestone checklist

Approved September 15, 2026. Testnet only, no deployment or real spending.

- [x] Read approved decisions and corrections.
- [x] Rewrite plan for the single-service architecture.
- [x] Create checklist.
- [x] Run current-package and official-documentation compatibility spike.
- [x] Verify read-only testnet sender/memo/execution/finality evidence.
- [x] Record compatibility findings and gate decision.
- [x] Scaffold only after compatibility supports the design.
- [x] TDD authentication and scoped one-use challenges.
- [x] TDD immutable events, reservation uniqueness and last-seat race.
- [x] TDD exact deposit verification and late-fund recovery.
- [x] TDD check-in/rejections/cancellation race.
- [x] TDD durable preparation, concurrency, restart, unknown broadcasts and solvency.
- [x] TDD private receipt access and redacted projection.
- [x] Run typecheck, unit tests, concurrency tests and production build.
- [x] Add plain diagnostic page after backend tests pass.
- [x] Operate actual Nimiq Pay testnet deposit/check-in/refund.
- [x] Document manual operation/recovery.
- [x] Report evidence, blockers, UI readiness and time remaining.

Package-adapter tests, synthetic chain tests, actual public-testnet reads and actual Pay transactions are distinct evidence. Never mark completion without observed output.

## Approved product extension, September 17, 2026

- [x] Add immutable capacity, payment mode, amount, cancellation, check-in, settlement, and terms-freeze fields.
- [x] Allocate final-seat holds atomically and expose server-calculated availability.
- [x] Mark expired holds and route late verified payments to refund recovery.
- [x] Add `REFUNDABLE_DEPOSIT` and `PAID_ADMISSION` settlement behavior.
- [x] Refund both modes when the event is cancelled.
- [x] Enforce the frozen paid-admission participant cancellation policy.
- [x] Rotate and close venue challenges and reject derived revoked proofs.
- [x] Bind participant challenges to the venue digest and exact wallet/event/reservation scope.
- [x] Add disabled future fields for deterministic `EQUAL_ATTENDANCE_POOL` funding.
- [x] Confirm the extension has no raffle, lottery, random draw, or participant-principal reward funding.
- [x] Add requested domain and concurrency coverage.
- [x] Verify additive migration against the existing ShowUp testnet database.
- [x] Run final typecheck, full tests, concurrency tests, and production build.

## Product completion audit, September 18, 2026

Authorized: complete outstanding work within the approved testnet pilot.

- [x] Prevent repeat payment prompts after submission or an unknown wallet outcome, and expose hash recovery.
- [x] Refresh private pages after login and keep pass, receipt, and organizer status current.
- [x] Expose participant cancellation and private receipt export.
- [x] Correct organizer availability, include drafts, and allow opening a saved draft.
- [x] Handle camera/decoder absence, QR expiry, and clipboard restrictions on LAN HTTP.
- [x] Disable registration for closed events and show frozen cutoff/check-in terms.
- [x] Run deadline transitions in the background worker and prevent overlapping ticks.
- [x] Separate account-access and sign-in approvals into distinct user actions.
- [x] Verify domain regressions, typecheck, full tests, build, and mobile browser flows.
- [x] Document demo procedure and remaining device-only validation.
- [x] Restart the LAN server with the verified build.
