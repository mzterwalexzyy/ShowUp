# Nimiq compatibility evidence

The package and public-chain spike was observed September 15, 2026. Reproduce it with `npm run spike`. Detailed results are in nimiq-compatibility-results.json. All 15 spike checks passed. The complete Android Nimiq Pay flow was observed September 17, 2026.

## Published package behavior

The spike downloads integrity-verified SDK 0.1.0 and Core 2.7.1 archives. SDK calls run with a synthetic native adapter. This tests the real JavaScript package, not Android host behavior.

- `init()` times out without injection. A fresh invocation succeeds after injection. The app must reset a failed initialization promise.
- `listAccounts()` returns and caches host accounts. Do not interpret this as chain identity.
- `sign()` forwards exact Unicode text and returns the host public key and signature.
- `sendBasicTransactionWithData()` forwards integer Luna and memo text and returns the host string. The app must validate the hash format and handle both returned and thrown errors.
- `getNetwork()` identifies the Nimiq ecosystem, not testnet. Testnet verification must use independently obtained transaction and block evidence.
- Published transaction types omit `executionResult`. The server must define and validate its own RPC evidence type.

## Actual public testnet observations

Endpoint https://rpc.testnet.nimiqwatch.com/ exposes transaction, canonical block and consensus reads. `getNetworkId` is unavailable. The observed blocks identify TestAlbatross and transactions network ID 5.

Public transaction f22de823140123cfdb1cc15b1263889b925abe8bc301d603832a9f76aef0cbf6 was reconstructed with Core. Its computed hash matched and its proof verified. This was an unrelated public transaction, not our deposit. Its sender was an HTLC contract. Both early-resolution co-signatures independently verified against the transaction content. The contract address alone cannot identify the participant. Only a verified proof key matching the authenticated wallet may authorize a refund beneficiary. Unsupported proof forms must fail closed.

Recipient data was hex-encoded UTF-8. The inclusion block explicitly recorded successful execution. Forty-three checked parent links connected the transaction block to canonical testnet macro block 11522910 with a justification. Block type must be checked, because testnet's genesis offset makes height modulo 60 an incorrect macro test. This trusts the RPC node's canonical-chain assertion. It is not independent consensus validation.

The first ancestry run exposed rate limiting, HTTP 429. Bounded backoff and paced reads passed the same checks. Production verification must preserve pending status on unavailable evidence and limit polling.

## Gate decision

The controlled Android test passed the release gate. Wallet `NQ82 AB7V VBH1 4F58 J541 U8KR 8AE0 L1M6 5A2M` authenticated with a signed login challenge and funded reservation `e05871c6-dc91-43bd-a20d-001ef214fbde`. Deposit transaction `7a52af0a23089e97b87e9b3d02c56979f15f87a7c1efe8ee7c7f99e375552b93` transferred exactly 100,000 Luna to the dedicated treasury with the reservation memo. The backend verified successful execution, proof attribution and canonical testnet finality before moving the reservation to `RESERVED`.

During the event window, the same wallet signed the one-use venue challenge. The reservation moved to `CHECKED_IN` at epoch 1789605677371. The refund obligation was recorded as `VALID_ATTENDANCE`, and transaction `b60e54fb26f80e822d2e6d4474350b9a0f01998dedde910fa43d9d73fe5ab47b` returned the full 100,000 Luna principal. Both the obligation and transfer reached `SETTLED`.

An earlier 100 Luna late-deposit recovery also settled as transaction `993375a9ca541f0b6643017f850c21ee232f827391ed9ad3c4b4eb415530eff7`. This separately exercised the late or extra deposit recovery path.

## Official references

- [Nimiq provider](https://nimiq.dev/mini-apps/api-reference/nimiq-provider)
- [RPC migration and transaction fields](https://nimiq.dev/migration/migration-json-rpc)
- [Canonical block lookup](https://nimiq.dev/rpc/methods/get-block-by-number)
- [Block format and finality](https://nimiq.dev/protocol/consensus/block-format)
- [Transaction execution](https://nimiq.dev/protocol/transactions)

No mainnet operations, original project secrets or original databases were accessed.
