# ShowUp testnet rehearsal

Open `http://192.168.1.24:3000` in Nimiq Pay on the same Wi-Fi. This address is current on September 18. If it changes, use `ipconfig` and restart `node scripts/start-lan.mjs NEW_IPV4`. The launcher serves a production build, so source changes require a build and restart.

## Real-device sequence

1. Select Nimiq Testnet in Pay. Use testnet NIM only.
2. Connect the organizer wallet. Account access and sign-in are separate taps and approvals.
3. In Host, create a refundable event. Fill test schedule provides a short rehearsal. Review local dates, cancellation cutoff, capacity and 1 NIM deposit before opening.
4. Copy the attendee link to a second device. If HTTP clipboard access fails, select the displayed fallback text manually.
5. Connect a participant wallet, sign in, reserve, and approve the exact payment. A wallet hash is submission evidence only. Use Verify payment until independent finality verification confirms the seat.
6. During the frozen check-in window, activate the host QR. Scan on the participant phone or paste its code, then tap Sign check-in. Let signing finish before rotating, because rotation revokes derived proofs.
7. Watch the pass or private receipt progress from refund owed to verified settlement. Record the real wait or label edits that skip waiting. Export the private JSON receipt for your records.

## Additional acceptance checks

- Reload during pending verification. Hash recovery must appear without offering a second payment.
- Cancel a separate confirmed refundable reservation before cutoff and observe the refund.
- Use a separate paid-admission event. Check-in consumes the ticket without a refund. Event cancellation must refund it.
- Deny camera permission and use manual code entry. LAN HTTP may make camera APIs unavailable. Manual entry does not establish camera readiness.
- Connect from a pass or receipt page and confirm it loads without reloading. Sign out before switching wallets.
- Exercise expired/rotated codes and wrong-wallet proofs. Keep real rejection evidence separate from mocked browser fixtures.
- Leave a refundable no-show undecided until its deadline and confirm a default refund. The service checks deadlines every 15 seconds while running.

## Unknown payments

The product records an UNKNOWN attempt before opening the wallet. If approval is cancelled, times out, or the app closes, inspect Pay activity. Paste an existing hash to reconcile it. If no transaction appears, ask the operator to investigate before any new send. The app deliberately provides no blind reset of a send attempt. A missing hash or a not-found RPC response is not proof that no payment happened.

## Evidence boundaries and remaining work

The project records an Android deposit/check-in/refund from September 17. September 18 changes require a fresh real-device run, including QR scanning and receipt download inside Pay. Domain tests use isolated databases and synthetic chain evidence. Browser regressions use explicitly mocked API responses and verify controls/layout only.

Remaining human/external work: that fresh Android run, a demo recording, consenting pilot participants, and any competition submission. Hosting purchase, publishing, mainnet, and real spending remain outside this local testnet task. Rewards and other features marked deferred in the specification remain deferred.
