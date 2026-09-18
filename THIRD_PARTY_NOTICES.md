# Source attribution

ShowUp is a new implementation for the Nimiq Mini Apps Competition.

- Trove, the user's nimiq-bounty project, informed Nimiq signed-message verification and retryable wallet initialization. Its original source is MIT licensed. No original secrets, databases, logs or generated files are reused.
- AirNim, owned by the user, informed the separation of RPC unavailability from transaction absence and explicit lifecycle transitions. Reuse was expressly authorized by the owner on September 15, 2026.
- Nimiq Core and the Nimiq Mini App SDK remain dependencies with their own license notices distributed in their packages.

The ShowUp domain and database code is written for the approved reduced pilot. The unsafe payout retry and memo-only attribution patterns identified in the audit are excluded.
