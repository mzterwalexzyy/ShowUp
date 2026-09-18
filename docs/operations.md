# Supervised pilot operations

Implementation and the required Android testnet device path were completed September 17, 2026. This document specifies the operating procedures for the controlled pilot.

## Custody and access

ShowUp is a capped custodial pilot. The operator controls the treasury key and can technically move its funds. A venue challenge and wallet signature prove acceptance of a check-in challenge, not physical presence. Explain this before a participant deposits.

Keep a dedicated testnet key in server-only configuration. Never reuse a personal wallet key or commit configuration. The allowlisted organizer wallet and operator wallet are separate roles even if one person initially holds both. Enable only network ID 5. Do not accept a network identifier supplied by a browser.

## Before accepting deposits

For every deposit, independently verify the authenticated wallet against the funding transaction proof, memo, exact amount, recipient, network, successful execution and canonical macro finality. The September 17 Android gate passed with an exact 100,000 Luna deposit, signed check-in and settled full-principal refund. A mock or an unrelated public transaction remains insufficient for later releases.

Check treasury cash against every undisposed participant credit, every unsettled refund and every forfeiture still payable. Count each verified credit once. Keep separate fee funding above principal. Unknown transfers remain reserved until reconciled. A surplus balance alone does not prove solvency.

## Unknown transfers and restart

Stop new outbound work when the worker cannot prove backing or reconcile prior work. A prepared record preserves the exact signed bytes and computed hash before the first send. Treat timeout, process interruption during send, an unexpected response hash and unavailable RPC as uncertain outcomes. Inspect the stored hash against the chain. Do not clear the preparation claim, create a replacement or resend blindly.

A PREPARING record without signed bytes needs manual investigation. A not-found result alone does not establish nonexecution. Replacement requires complete stored-hash reconciliation, expiry evidence and an operator decision. Identical-byte rebroadcast is disabled for this milestone.

## Manual encrypted backup and restore

Pause writes and stop the single service. Make a consistent database backup with its SQLite backup facility or copy only after a clean shutdown and completed checkpoint. Include pending transfer records. Encrypt it and store it separately from the server. Back up the signer key through a separate controlled process. Keep neither key material nor unencrypted private receipt data in support logs.

Restore into a separate directory with all outbound sending disabled. Reconcile deposits and every prepared, broadcast or unknown hash since the backup against the chain before enabling the worker. A restored database can omit a transfer that already executed. Never simply resume sending from a stale snapshot. Run a supervised restore drill before production approval.

## Outages and deadline decisions

On RPC or hosting outage, preserve pending states and liabilities. Inform affected participants without exposing other wallets or receipts. Restore verification before accepting new funds. Event cancellation refunds verified deposits. Valid check-in refunds are unconditional. Missing attendance enters NO_SHOW_PENDING. Only the operator can make a timely recorded forfeiture decision. No decision or an unresolved dispute at the deadline defaults to refund.

## Maintenance

Assign an operator for the competition's required twelve-month maintenance period. Check service health, failed verification, pending transfers, liabilities, fee reserve and challenge cleanup daily while events are active. Review dependencies and perform an encrypted backup and restore drill regularly. Keep a documented outage contact and a shutdown plan that reconciles and refunds all remaining participant liabilities.

Hosting purchase, deployment, mainnet access and real spending require separate authorization.
