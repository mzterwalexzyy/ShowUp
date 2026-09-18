# September 18 completion audit

## Reproduced and repaired

- Host availability omitted unexpired seat holds. A failing domain test reproduced the incorrect free-seat count.
- Private receipts omitted the frozen cancellation cutoff. A failing domain test reproduced the missing field.
- The pass used verified credits to choose its payment action, so an unverified submitted transaction still offered a new payment. Durable UNKNOWN send intents and hash recovery now prevent repeat sends from both product and diagnostic pages.
- Session-dependent pages loaded only on mount. They now refresh on wallet changes and periodically while visible.
- A single settled refund incorrectly implied all refunds were settled. Pass status now requires all obligations to settle.
- Draft events were absent from host groups, and cancelled past events could appear twice. Groups are now exclusive and saved drafts can be opened.
- Creation followed by a failed open could encourage duplicate event creation. The user now goes to the saved draft.
- Closed events still offered registration, and participant cancellation was missing from the pass. These controls now follow frozen terms.
- The camera could open with no QR decoder and remain active indefinitely. Unsupported-camera/decoder cases now use a clear code-entry fallback, with stream cleanup.
- Expired venue codes remained labelled active. Expired QR/token content is now hidden.
- Clipboard errors were unhandled on HTTP. Host controls now provide selectable fallback text.
- Deadline logic existed but was never called by the background service. The scheduled tick now advances deadlines before refund work and cannot overlap itself.
- Wallet account access immediately triggered signing. The product now requires a separate sign-in tap and supports signing out to change wallets.

## Verification

- Original UI fixtures reproduced missing registration, recovery, cancellation, export, and draft controls at four viewport widths.
- First full domain run: 60 tests passed, zero failures.
- Additional deadline scheduler and concurrency run: 4 tests passed, zero failures. Two were new scheduler tests.
- Typecheck passed before the final small diagnostic/CSS changes.
- Production build: passed. The first cleanup was blocked by the old server's locked native module. After stopping that stale process, the clean build completed with generated `.output/server/index.mjs` and the payment-intent route.
- Final browser fixtures: passed at 320, 375, 430 and 1280 pixels, with no page errors or horizontal overflow. The fixtures cover closed registration, unknown-payment recovery, cancellation, receipt export, drafts, saved-draft opening, two-step sign-in, and manual QR fallback.

## Mini-app checklist

PASS: Nimiq operations use the installed SDK's `init()` helper.
PASS: Provider initialization errors are caught and displayed.
PASS: Product account access and sign-in approvals have separate user actions.
PASS: Product pages do not open wallet approvals on load or polling.
PASS: Client source does not read private keys or use wallet internal state.
PASS: Payments and signatures go through native provider approvals.
PASS: API/RPC failures retain recoverable payment state instead of triggering a new send.
PASS: NIM amounts use integer Luna, with five-decimal input validation.
PASS: Camera and clipboard have manual fallbacks for LAN HTTP.
PASS: The LAN launcher binds all interfaces and configures its exact public origin.
SKIP: Ethereum provider, ERC-20 decimals, ABI encoding, EVM chain switching, and EIP-712, because this pilot uses NIM only.
SKIP: Nimiq logo sourcing, because the product uses ShowUp assets.
FAIL: A fresh Nimiq Pay Android run for this revision has not been observed. Perform the device sequence in `demo-runbook.md`, including actual QR scanning and receipt download.

10 passed, 1 failed, 2 skipped categories. Responsive browser evidence is recorded separately after the build.

No deployment, mainnet use, competition submission, real-user study, or new real-device transaction is claimed by this audit.
