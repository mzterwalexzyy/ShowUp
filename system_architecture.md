# ShowUp system architecture

One Nuxt/Nitro Node service owns the API, local libSQL database, diagnostic page, testnet RPC client and in-process refund worker. All monetary values are integer Luna. Network ID 5 is fixed at each boundary.

`server/domain/service.ts` is the transaction boundary for authentication, events, reservations, attendance and liability disposition. External cryptography and RPC calls occur before a short database commit that rechecks current state. Every accepted transition and rejection appends a lifecycle event.

`server/nimiq/verify.ts` independently reconstructs transactions, verifies proofs, binds a cryptographic signer to the authenticated beneficiary, checks exact recipient/value/memo/network/execution and follows canonical parent links to an actual macro block. RPC evidence is a trusted-node assertion, not independent consensus verification.

`server/worker/refunds.ts` claims one obligation, signs outside the database transaction, durably records exact bytes and computed hash, and then grants a single broadcaster. Unknown sends enter manual review. Restarts reconcile the stored hash and never prepare a replacement automatically.

`server/nimiq/signer.ts` accepts only testnet, the pilot's fixed zero-Luna fee, an integer principal of at most 10 NIM and a valid beneficiary. Its private key is server-only. `.data`, `.env`, build output and dependencies are excluded from source control.

The local LAN launcher has an explicit testnet bootstrap mode. It can generate a dedicated local testnet key and bind the first successfully authenticated wallet as operator. Production startup requires explicit key and wallet configuration.

September 18: `beginPayment` records an UNKNOWN attempt atomically before a product wallet send. Existing attempts require hash reconciliation and never trigger automatic resending. Unknown approvals with no hash require operator investigation.

`useLiveRefresh` updates read-only projections after session changes and every ten seconds while visible, with non-overlapping reads and timer teardown. Account access and sign-in signatures have separate user actions. Refund completion requires every obligation to be settled.

`createWorkerTick` advances deadlines before refund recovery and preparation. Its per-process guard prevents overlapping ticks and releases after errors. Database claims continue to protect refund exclusivity.
