export const schema = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS organizers (
 wallet TEXT PRIMARY KEY, enabled INTEGER NOT NULL CHECK(enabled IN (0,1))
);
CREATE TABLE IF NOT EXISTS events (
 id TEXT PRIMARY KEY, organizer TEXT NOT NULL, title TEXT NOT NULL,
 network INTEGER NOT NULL DEFAULT 5 CHECK(network=5), state TEXT NOT NULL CHECK(state IN ('DRAFT','OPEN','CANCELLED')),
 deposit INTEGER NOT NULL CHECK(typeof(deposit)='integer' AND deposit BETWEEN 1 AND 1000000),
 payment_mode TEXT NOT NULL DEFAULT 'REFUNDABLE_DEPOSIT' CHECK(payment_mode IN ('REFUNDABLE_DEPOSIT','PAID_ADMISSION')),
 amount_luna INTEGER NOT NULL DEFAULT 100000 CHECK(typeof(amount_luna)='integer' AND amount_luna BETWEEN 1 AND 1000000),
 capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 20),
 starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, cutoff INTEGER NOT NULL, deadline INTEGER NOT NULL,
 participant_cancellation_policy TEXT NOT NULL DEFAULT 'REFUND_BEFORE_CUTOFF' CHECK(participant_cancellation_policy IN ('REFUND_BEFORE_CUTOFF','NON_REFUNDABLE')),
 check_in_opens_at INTEGER NOT NULL DEFAULT 0, check_in_closes_at INTEGER NOT NULL DEFAULT 0,
 settlement_policy TEXT NOT NULL DEFAULT 'REFUND_ON_VALID_CHECKIN' CHECK(settlement_policy IN ('REFUND_ON_VALID_CHECKIN','RETAIN_ADMISSION')),
 terms_digest TEXT, terms_frozen_at INTEGER,
 reward_policy TEXT NOT NULL DEFAULT 'NONE' CHECK(reward_policy IN ('NONE','EQUAL_ATTENDANCE_POOL')),
 reward_pool_luna INTEGER NOT NULL DEFAULT 0 CHECK(typeof(reward_pool_luna)='integer' AND reward_pool_luna>=0),
 reward_remainder_policy TEXT NOT NULL DEFAULT 'NONE',
 CHECK(deposit*capacity <= 20000000), CHECK(cutoff<=starts_at AND starts_at<ends_at AND ends_at<deadline)
);
CREATE TABLE IF NOT EXISTS reservations (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), participant_wallet TEXT NOT NULL,
 beneficiary TEXT NOT NULL, state TEXT NOT NULL, hold_expires INTEGER NOT NULL,
 memo TEXT NOT NULL UNIQUE, attendance_at INTEGER,
 settlement_state TEXT NOT NULL DEFAULT 'UNSETTLED',
 UNIQUE(event_id,participant_wallet), CHECK(beneficiary=participant_wallet)
);
CREATE TRIGGER IF NOT EXISTS immutable_beneficiary BEFORE UPDATE OF beneficiary,participant_wallet,event_id,memo ON reservations
 BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RESERVATION'); END;
CREATE TABLE IF NOT EXISTS auth_challenges (
 id TEXT PRIMARY KEY, wallet TEXT NOT NULL, action TEXT NOT NULL, event_id TEXT, reservation_id TEXT,
 venue_id TEXT, message TEXT NOT NULL, expires_at INTEGER NOT NULL, consumed_at INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
 digest TEXT PRIMARY KEY, wallet TEXT NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER
);
CREATE TABLE IF NOT EXISTS venue_challenges (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), token_digest TEXT NOT NULL UNIQUE,
 expires_at INTEGER NOT NULL, revoked_at INTEGER
);
CREATE TABLE IF NOT EXISTS payment_attempts (
 id TEXT PRIMARY KEY, reservation_id TEXT NOT NULL REFERENCES reservations(id), transaction_hash TEXT,
 state TEXT NOT NULL, at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS verified_transactions (
 id TEXT PRIMARY KEY, network INTEGER NOT NULL CHECK(network=5), transaction_hash TEXT NOT NULL,
 reservation_id TEXT NOT NULL REFERENCES reservations(id), wallet TEXT NOT NULL, recipient TEXT NOT NULL,
 value INTEGER NOT NULL CHECK(typeof(value)='integer' AND value>0), memo TEXT NOT NULL,
 block_number INTEGER NOT NULL, macro_hash TEXT NOT NULL,
 disposition TEXT NOT NULL CHECK(disposition IN ('HELD','REFUND','FORFEIT','SETTLED')),
 payment_mode TEXT NOT NULL DEFAULT 'REFUNDABLE_DEPOSIT',
 principal_state TEXT NOT NULL DEFAULT 'HELD',
 UNIQUE(network,transaction_hash)
);
CREATE TRIGGER IF NOT EXISTS immutable_credit BEFORE UPDATE OF network,transaction_hash,reservation_id,wallet,recipient,value,memo ON verified_transactions
 BEGIN SELECT RAISE(ABORT,'IMMUTABLE_CREDIT'); END;
CREATE TABLE IF NOT EXISTS refund_obligations (
 id TEXT PRIMARY KEY, deposit_id TEXT NOT NULL UNIQUE REFERENCES verified_transactions(id),
 state TEXT NOT NULL CHECK(state IN ('PENDING','PREPARING','PREPARED','BROADCAST','MANUAL_REVIEW','SETTLED')), reason TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS transfer_attempts (
 id TEXT PRIMARY KEY, obligation_id TEXT NOT NULL REFERENCES refund_obligations(id),
 state TEXT NOT NULL CHECK(state IN ('PREPARING','PREPARED','BROADCASTING','BROADCAST','MANUAL_REVIEW','SETTLED','FAILED')),
 beneficiary TEXT NOT NULL, value INTEGER NOT NULL CHECK(typeof(value)='integer' AND value>0),
 fee INTEGER NOT NULL CHECK(typeof(fee)='integer' AND fee>=0), network INTEGER NOT NULL CHECK(network=5),
 validity_start_height INTEGER, signed_bytes TEXT, transaction_hash TEXT, created_at INTEGER NOT NULL,
 UNIQUE(obligation_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_transfer_per_obligation ON transfer_attempts(obligation_id)
 WHERE state IN ('PREPARING','PREPARED','BROADCASTING','BROADCAST','MANUAL_REVIEW');
CREATE TRIGGER IF NOT EXISTS immutable_prepared_transfer BEFORE UPDATE OF beneficiary,value,fee,network,validity_start_height,signed_bytes,transaction_hash ON transfer_attempts
 WHEN OLD.signed_bytes IS NOT NULL BEGIN SELECT RAISE(ABORT,'IMMUTABLE_PREPARED_TRANSFER'); END;
CREATE TABLE IF NOT EXISTS operator_decisions (
 id TEXT PRIMARY KEY, reservation_id TEXT NOT NULL UNIQUE REFERENCES reservations(id), actor TEXT NOT NULL,
 decision TEXT NOT NULL CHECK(decision IN ('refund','forfeit')), evidence TEXT NOT NULL, at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS lifecycle_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, actor TEXT NOT NULL, scope TEXT NOT NULL,
 action TEXT NOT NULL, outcome TEXT NOT NULL, reason TEXT NOT NULL, request_key TEXT UNIQUE, result TEXT
);
CREATE TRIGGER IF NOT EXISTS lifecycle_no_update BEFORE UPDATE ON lifecycle_events BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS lifecycle_no_delete BEFORE DELETE ON lifecycle_events BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
`;
