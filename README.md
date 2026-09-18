# ShowUp

ShowUp is a testnet-only, capped custodial attendance deposit pilot for the Nimiq Mini Apps Competition. Participants reserve with NIM, sign a scoped check-in challenge, and receive their verified principal back. The operator controls the treasury during this supervised pilot. A signed check-in proves acceptance of the challenge, not physical presence.

## Current limits

- Nimiq testnet, network ID 5
- 10 NIM maximum per reservation
- 20 participants and 200 NIM principal maximum per event
- One allowlisted organizer
- Integer Luna only, 100000 Luna equals 1 NIM
- No mainnet operations or production deployment

## Local verification

Use Node 22.19 or newer. Install dependencies, then run:

```text
npm test
npm run test:concurrency
npm run typecheck
npm run build
```

To open the production build to an Android phone on the same network:

```text
node scripts/start-lan.mjs YOUR_LAN_IPV4
```

The local launcher explicitly enables testnet bootstrap. It generates a dedicated key at `.data/testnet-signer.key` with restricted permissions if no key exists. The first wallet that completes a valid login becomes the local operator and organizer. Normal production startup does not allow this bootstrap and requires the values described in `.env.example`.

Fund the displayed treasury with enough testnet Luna to cover participant principal. Complete a real Nimiq Pay login, deposit, finality verification, check-in, and refund before treating the money path as working. The September 17, 2026 Android test completed this path with a 100,000 Luna deposit and full-principal refund.

Compatibility evidence is in `docs/nimiq-compatibility.md`. Recovery and custody procedures are in `docs/operations.md`.

The September 18 completion pass adds durable payment recovery, live status updates, participant cancellation, private receipt export, saved-draft recovery, and scheduled deadline processing. Device rehearsal steps and outstanding external checks are in `docs/demo-runbook.md`. `scripts/product-smoke.py` uses UI fixtures, not real payment evidence.
