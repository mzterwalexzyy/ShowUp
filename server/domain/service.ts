import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Store, one, type Row, type Transaction } from '../db/index';
import { canonicalChallenge, verifyWalletSignature, walletAddress } from '../auth/signatures';
import { luna } from './money';
import { verifyFunding, type ChainReader, type VerifiedDeposit } from '../nimiq/verify';

export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export interface Config { domain: string; operator: string; organizer: string; treasury: string; now: () => number; bootstrapOperator?: boolean }
export type PaymentMode = 'REFUNDABLE_DEPOSIT' | 'PAID_ADMISSION';
export type CancellationPolicy = 'REFUND_BEFORE_CUTOFF' | 'NON_REFUNDABLE';
export interface Terms {
  title: string; deposit?: number; amountLuna?: number; capacity: number; startsAt: number; endsAt: number;
  checkInOpensAt?: number; checkInClosesAt?: number; cancellationCutoff: number; decisionDeadline: number;
  paymentMode?: PaymentMode; participantCancellationPolicy?: CancellationPolicy;
  rewardPolicy?: 'NONE' | 'EQUAL_ATTENDANCE_POOL'; rewardPoolLuna?: number; rewardRemainderPolicy?: string;
}
export class DomainError extends Error {
  readonly statusCode = 409;
  readonly statusMessage: string;
  constructor(code: string) { super(code); this.statusMessage = code; }
}
export function requireThat(value: unknown, code: string): asserts value { if (!value) throw new DomainError(code); }
export class ShowUp {
  async owned(tx: Transaction, actor: string, id: string) {
    const r = await one(tx, 'SELECT * FROM reservations WHERE id=?', [id]);
    requireThat(r, 'RESERVATION_UNKNOWN'); requireThat(r.participant_wallet === actor, 'FORBIDDEN'); return r;
  }
  async refund(tx: Transaction, depositId: string, reason: string) {
    const deposit = await one(tx, 'SELECT * FROM verified_transactions WHERE id=?', [depositId]);
    requireThat(deposit, 'DEPOSIT_UNKNOWN');
    if (deposit.disposition === 'REFUND' || deposit.disposition === 'SETTLED') return;
    requireThat(deposit.disposition === 'HELD', 'DISPOSITION_LOCKED');
    await tx.execute({ sql: "UPDATE verified_transactions SET disposition='REFUND' WHERE id=?", args: [depositId] });
    await tx.execute({ sql: "UPDATE verified_transactions SET principal_state='REFUND_PENDING' WHERE id=?", args: [depositId] });
    await tx.execute({ sql: "INSERT INTO refund_obligations(id,deposit_id,state,reason) VALUES(?,?,'PENDING',?)", args: [randomUUID(), depositId, reason] });
    await this.audit(tx, 'system', deposit.reservation_id, 'REFUND_OBLIGATION', 'ACCEPTED', reason);
  }
  async refundReservation(tx: Transaction, id: string, reason: string) {
    const credits = await tx.execute({ sql: "SELECT id FROM verified_transactions WHERE reservation_id=? AND disposition='HELD'", args: [id] });
    for (const credit of credits.rows) await this.refund(tx, String(credit.id), reason);
  }
  async beginPayment(actor: string, reservationId: string) {
    return this.action(actor, reservationId, 'BEGIN_PAYMENT', async tx => {
      const r = await this.owned(tx, actor, reservationId), event = await this.event(tx, r.event_id);
      requireThat(['HELD','HOLD_CREATED'].includes(r.state) && r.hold_expires > this.config.now() && event.state === 'OPEN' && event.starts_at > this.config.now(), 'PAYMENT_WINDOW_CLOSED');
      requireThat(!await one(tx, 'SELECT id FROM payment_attempts WHERE reservation_id=? LIMIT 1', [reservationId]), 'PAYMENT_RECONCILIATION_REQUIRED');
      await tx.execute({ sql: "INSERT INTO payment_attempts(id,reservation_id,transaction_hash,state,at) VALUES(?,?,NULL,'UNKNOWN',?)", args: [randomUUID(), reservationId, this.config.now()] });
      return { recipient: this.config.treasury, value: String(event.amount_luna), data: r.memo, network: 5 };
    });
  }
  async confirmPayment(actor: string, reservationId: string, hash: string, rpc: ChainReader) {
    const intent: Row = await this.action(actor, reservationId, 'SUBMIT_PAYMENT', async tx => {
      const r = await this.owned(tx, actor, reservationId);
      requireThat(typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash), 'INVALID_HASH');
      const attemptId = randomUUID();
      await tx.execute({ sql: "INSERT INTO payment_attempts(id,reservation_id,transaction_hash,state,at) VALUES(?,?,?,'VERIFYING',?)", args: [attemptId, reservationId, hash, this.config.now()] });
      return { ...r, attemptId } as Row;
    });
    let evidence: VerifiedDeposit;
    try {
      const received = await rpc.transaction(hash);
      // Verify actual received value to preserve over/underpayment liabilities.
      // Only the atomic commit below decides whether it buys a reservation.
      evidence = await verifyFunding({ ...rpc, transaction: async () => received, head: () => rpc.head(), block: n => rpc.block(n) }, { hash, wallet: actor, recipient: this.config.treasury, value: luna(received?.value), memo: intent.memo });
    } catch (error) {
      const reason = error instanceof Error && ['PENDING','PENDING_FINALITY','RPC_UNAVAILABLE','RPC_ERROR'].includes(error.message) ? error.message : 'CHAIN_EVIDENCE_UNVERIFIED';
      await this.action(actor, reservationId, 'PAYMENT_UNVERIFIED', async tx => {
        await tx.execute({ sql: "UPDATE payment_attempts SET state='UNVERIFIED' WHERE id=?", args: [intent.attemptId] });
        await this.audit(tx, actor, reservationId, 'VERIFY_PAYMENT', 'REJECTED', reason);
      });
      throw new DomainError(reason);
    }
    return this.action(actor, reservationId, 'VERIFY_PAYMENT', async tx => {
      const r = await this.owned(tx, actor, reservationId), event = await this.event(tx, r.event_id);
      requireThat(!await one(tx, 'SELECT id FROM verified_transactions WHERE network=5 AND transaction_hash=?', [hash]), 'TRANSACTION_USED');
      const id = randomUUID();
      await tx.execute({ sql: "INSERT INTO verified_transactions(id,network,transaction_hash,reservation_id,wallet,recipient,value,memo,block_number,macro_hash,disposition,payment_mode,principal_state) VALUES(?,5,?,?,?,?,?,?,?,?,'HELD',?,'HELD')", args: [id, evidence.hash, reservationId, evidence.wallet, evidence.recipient, evidence.value, evidence.memo, evidence.block, evidence.macroHash, event.payment_mode] });
      const regular = ['HELD','HOLD_CREATED'].includes(r.state) && r.hold_expires > this.config.now() && event.state === 'OPEN' && event.starts_at > this.config.now() && evidence.value === event.amount_luna;
      if (regular) {
        await tx.execute({ sql: "UPDATE reservations SET state='CONFIRMED' WHERE id=?", args: [reservationId] });
      } else {
        await this.refund(tx, id, evidence.value !== event.amount_luna ? 'WRONG_AMOUNT_RECOVERY' : 'LATE_OR_EXTRA_DEPOSIT');
        if (!['RESERVED', 'CONFIRMED', 'CHECKED_IN', 'NO_SHOW_PENDING'].includes(r.state)) await tx.execute({ sql: "UPDATE reservations SET state='REFUND_PENDING' WHERE id=?", args: [reservationId] });
      }
      await tx.execute({ sql: "UPDATE payment_attempts SET state='VERIFIED' WHERE id=?", args: [intent.attemptId] });
      return { id: reservationId, state: regular ? 'CONFIRMED' : 'REFUND_PENDING' };
    });
  }
  async receipt(actor: string, id: string) {
    const r = await one(this.store.client, 'SELECT r.*,e.title,e.payment_mode,e.amount_luna,e.starts_at,e.ends_at,e.check_in_opens_at,e.check_in_closes_at,e.cutoff,e.participant_cancellation_policy FROM reservations r JOIN events e ON e.id=r.event_id WHERE r.id=?', [id]);
    if (!r || (r.participant_wallet !== actor && actor !== this.config.operator)) {
      await this.store.write(tx => this.audit(tx, actor, id, 'READ_RECEIPT', 'REJECTED', 'FORBIDDEN'));
      throw new DomainError('FORBIDDEN');
    }
    const refunds = await this.store.client.execute({ sql: 'SELECT o.id,o.state,o.reason,d.value,d.wallet AS beneficiary FROM refund_obligations o JOIN verified_transactions d ON d.id=o.deposit_id WHERE d.reservation_id=?', args: [id] });
    const history = await this.store.client.execute({ sql: 'SELECT at,action,outcome,reason FROM lifecycle_events WHERE scope=? ORDER BY id', args: [id] });
    const payments = await this.store.client.execute({ sql: 'SELECT transaction_hash,state,at FROM payment_attempts WHERE reservation_id=? ORDER BY at', args: [id] });
    const credits = await this.store.client.execute({ sql: 'SELECT transaction_hash,block_number,macro_hash,principal_state FROM verified_transactions WHERE reservation_id=?', args: [id] });
    const transfers = await this.store.client.execute({ sql: 'SELECT t.transaction_hash,t.state FROM transfer_attempts t JOIN refund_obligations o ON o.id=t.obligation_id JOIN verified_transactions d ON d.id=o.deposit_id WHERE d.reservation_id=?', args: [id] });
    return { reservation: r, intent: { recipient:this.config.treasury, value:String(r.amount_luna), data:r.memo, network:5 }, refunds: refunds.rows, history: history.rows, evidence:{ payments:payments.rows, credits:credits.rows, transfers:transfers.rows } };
  }
  async publicEvent(id: string) {
    const e = await one(this.store.client, 'SELECT id,title,state,payment_mode,amount_luna,capacity,starts_at,ends_at,check_in_opens_at,check_in_closes_at,cutoff,deadline,participant_cancellation_policy,terms_digest,reward_policy FROM events WHERE id=?', [id]);
    requireThat(e, 'EVENT_UNKNOWN');
    const occupied = await one(this.store.client, "SELECT count(*) AS n FROM reservations WHERE event_id=? AND (state IN ('RESERVED','CONFIRMED','CHECKED_IN','NO_SHOW_PENDING') OR (state IN ('HELD','HOLD_CREATED') AND hold_expires>?))", [id, this.config.now()]);
    return { ...e, available_seats: Math.max(0, Number(e.capacity) - Number(occupied?.n ?? 0)) };
  }
  async organizerEvents(actor: string) {
    requireThat(actor === this.config.organizer, 'FORBIDDEN');
    const rows = await this.store.client.execute({ sql: "SELECT e.id,e.title,e.state,e.payment_mode,e.amount_luna,e.capacity,e.starts_at,e.ends_at,e.check_in_opens_at,e.check_in_closes_at,e.participant_cancellation_policy,e.terms_digest,count(CASE WHEN r.state IN ('RESERVED','CONFIRMED','CHECKED_IN','NO_SHOW_PENDING') OR (r.state IN ('HELD','HOLD_CREATED') AND r.hold_expires>?) THEN 1 END) AS occupied_seats FROM events e LEFT JOIN reservations r ON r.event_id=e.id WHERE e.organizer=? GROUP BY e.id ORDER BY e.rowid DESC", args: [this.config.now(), actor] });
    return rows.rows.map(row => ({ ...row, available_seats: Math.max(0, Number(row.capacity) - Number(row.occupied_seats)) }));
  }
  async organizerEvent(actor: string, id: string) {
    requireThat(actor === this.config.organizer, 'FORBIDDEN');
    const event = await one(this.store.client, 'SELECT * FROM events WHERE id=? AND organizer=?', [id, actor]); requireThat(event, 'EVENT_UNKNOWN');
    const rows = await this.store.client.execute({ sql: "SELECT r.id,r.participant_wallet,r.state,r.settlement_state,r.attendance_at,CASE WHEN EXISTS(SELECT 1 FROM verified_transactions d WHERE d.reservation_id=r.id) THEN 1 ELSE 0 END AS payment_verified,CASE WHEN EXISTS(SELECT 1 FROM refund_obligations o JOIN verified_transactions d ON d.id=o.deposit_id WHERE d.reservation_id=r.id) THEN 1 ELSE 0 END AS refund_created FROM reservations r WHERE r.event_id=? ORDER BY r.rowid", args:[id] });
    const attendees = rows.rows.map(row => ({ id:row.id, wallet_short:`${String(row.participant_wallet).slice(0,9)}…${String(row.participant_wallet).slice(-5)}`, state:row.state, settlement_state:row.settlement_state, attendance_at:row.attendance_at, payment_verified:Boolean(row.payment_verified), refund_created:Boolean(row.refund_created) }));
    const confirmed = attendees.filter(row => ['CONFIRMED','RESERVED','CHECKED_IN','NO_SHOW_PENDING'].includes(String(row.state))).length;
    const availability = await this.publicEvent(id);
    return { event:{...event,available_seats:availability.available_seats}, attendees, summary:{confirmed,checkedIn:attendees.filter(row=>row.state==='CHECKED_IN').length,refundsToCreate:attendees.filter(row=>row.payment_verified&&!row.refund_created).length} };
  }
  async venue(actor: string, id: string) {
    return this.action(actor, id, 'VENUE_CHALLENGE', async tx => {
      const event = await this.event(tx, id);
      requireThat(actor === event.organizer, 'FORBIDDEN');
      requireThat(event.state === 'OPEN' && this.config.now() >= event.check_in_opens_at && this.config.now() < event.check_in_closes_at, 'CHECKIN_CLOSED');
      await tx.execute({ sql: 'UPDATE venue_challenges SET revoked_at=? WHERE event_id=? AND revoked_at IS NULL', args: [this.config.now(), id] });
      const venueId = randomUUID(), token = randomBytes(24).toString('hex'), expiresAt = Math.min(this.config.now() + 120000, event.check_in_closes_at);
      await tx.execute({ sql: 'INSERT INTO venue_challenges(id,event_id,token_digest,expires_at) VALUES(?,?,?,?)', args: [venueId, id, digest(token), expiresAt] });
      return { id: venueId, token, expiresAt };
    });
  }
  async closeVenue(actor: string, id: string) {
    return this.action(actor, id, 'CLOSE_VENUE_CHALLENGE', async tx => {
      const event = await this.event(tx, id); requireThat(actor === event.organizer, 'FORBIDDEN');
      await tx.execute({ sql: 'UPDATE venue_challenges SET revoked_at=? WHERE event_id=? AND revoked_at IS NULL', args: [this.config.now(), id] });
      return { id, state: 'CLOSED' };
    });
  }
  async checkInChallenge(actor: string, id: string, token: string) {
    return this.action(actor, id, 'CHECKIN_CHALLENGE', async tx => {
      const r = await this.owned(tx, actor, id), event = await this.event(tx, r.event_id);
      requireThat(['RESERVED','CONFIRMED'].includes(r.state) && event.state === 'OPEN', 'CHECKIN_CLOSED');
      const v = await one(tx, 'SELECT * FROM venue_challenges WHERE token_digest=? AND event_id=?', [digest(token), r.event_id]);
      requireThat(v, 'VENUE_UNKNOWN'); requireThat(v.revoked_at === null, 'VENUE_REVOKED'); requireThat(v.expires_at > this.config.now(), 'VENUE_EXPIRED');
      requireThat(this.config.now() >= event.check_in_opens_at && this.config.now() < event.check_in_closes_at, 'CHECKIN_CLOSED');
      const challengeId = randomUUID(), expiresAt = Math.min(this.config.now() + 120000, v.expires_at);
      const message = canonicalChallenge({ domain: this.config.domain, action: 'check-in', wallet: actor, eventId: r.event_id, reservationId: id, venueId: v.id, network: 5, nonce: randomBytes(32).toString('hex'), issuedAt: this.config.now(), expiresAt, payloadDigest: v.token_digest });
      await tx.execute({ sql: "INSERT INTO auth_challenges(id,wallet,action,event_id,reservation_id,venue_id,message,expires_at) VALUES(?,?,'check-in',?,?,?,?,?)", args: [challengeId, actor, r.event_id, id, v.id, message, expiresAt] });
      return { id: challengeId, message, expiresAt };
    });
  }
  async checkIn(actor: string, challengeId: string, proof: unknown) {
    const c = await one(this.store.client, 'SELECT * FROM auth_challenges WHERE id=?', [challengeId]);
    const valid = c && verifyWalletSignature(actor, c.message, proof);
    return this.action(actor, c?.reservation_id ?? challengeId, 'CHECKIN', async tx => {
      requireThat(c && c.action === 'check-in', 'CHALLENGE_UNKNOWN'); requireThat(c.wallet === actor, 'FORBIDDEN'); requireThat(valid, 'INVALID_SIGNATURE');
      const current = await one(tx, 'SELECT * FROM auth_challenges WHERE id=?', [challengeId]);
      requireThat(current && current.consumed_at === null, 'CHALLENGE_USED');
      requireThat(current.expires_at > this.config.now(), 'CHALLENGE_EXPIRED');
      const r = await this.owned(tx, actor, c.reservation_id), e = await this.event(tx, r.event_id);
      const v = await one(tx, 'SELECT * FROM venue_challenges WHERE id=?', [c.venue_id]);
      requireThat(v, 'VENUE_UNKNOWN'); requireThat(v.revoked_at === null, 'VENUE_REVOKED'); requireThat(v.expires_at > this.config.now(), 'VENUE_EXPIRED');
      requireThat(r.attendance_at === null, 'ALREADY_CHECKED_IN');
      // Cancellation may already have created the refund. A valid issued proof
      // still records attendance without changing that obligation.
      requireThat(['RESERVED','CONFIRMED','REFUND_PENDING'].includes(r.state) && this.config.now() >= e.check_in_opens_at && this.config.now() < e.check_in_closes_at, 'CHECKIN_CLOSED');
      await tx.execute({ sql: 'UPDATE auth_challenges SET consumed_at=? WHERE id=?', args: [this.config.now(), challengeId] });
      await tx.execute({ sql: "UPDATE reservations SET attendance_at=?,state='CHECKED_IN' WHERE id=?", args: [this.config.now(), r.id] });
      if (e.payment_mode === 'REFUNDABLE_DEPOSIT') {
        await this.refundReservation(tx, r.id, 'VALID_ATTENDANCE');
        await tx.execute({ sql: "UPDATE reservations SET settlement_state='REFUND_PENDING' WHERE id=?", args: [r.id] });
      } else {
        await tx.execute({ sql: "UPDATE reservations SET settlement_state='TICKET_CONSUMED' WHERE id=?", args: [r.id] });
        await tx.execute({ sql: "UPDATE verified_transactions SET principal_state='ADMISSION_SETTLED' WHERE reservation_id=? AND principal_state='HELD'", args: [r.id] });
      }
      return { id: r.id, state: 'CHECKED_IN' };
    });
  }
  async cancelEvent(actor: string, id: string) {
    return this.action(actor, id, 'CANCEL_EVENT', async tx => {
      const e = await this.event(tx, id); requireThat(actor === e.organizer || actor === this.config.operator, 'FORBIDDEN');
      await tx.execute({ sql: "UPDATE events SET state='CANCELLED' WHERE id=?", args: [id] });
      const reservations = await tx.execute({ sql: 'SELECT id FROM reservations WHERE event_id=?', args: [id] });
      for (const r of reservations.rows) {
        await this.refundReservation(tx, String(r.id), 'EVENT_CANCELLED');
        await tx.execute({ sql: "UPDATE reservations SET state='REFUND_PENDING' WHERE id=? AND state<>'CHECKED_IN'", args: [r.id!] });
        await this.audit(tx, actor, String(r.id), 'EVENT_CANCELLED', 'ACCEPTED', 'REFUND');
      }
      return { id, state: 'CANCELLED' };
    });
  }
  async cancelReservation(actor: string, id: string) {
    return this.action(actor, id, 'CANCEL_RESERVATION', async tx => {
      const r = await this.owned(tx, actor, id), e = await this.event(tx, r.event_id);
      if (r.state === 'REFUND_PENDING') return { id, state: r.state };
      requireThat(['RESERVED','CONFIRMED'].includes(r.state) && this.config.now() < e.cutoff, 'CANCELLATION_CLOSED');
      requireThat(e.payment_mode === 'REFUNDABLE_DEPOSIT' || e.participant_cancellation_policy === 'REFUND_BEFORE_CUTOFF', 'CANCELLATION_NON_REFUNDABLE');
      await this.refundReservation(tx, id, 'PARTICIPANT_CANCELLED');
      await tx.execute({ sql: "UPDATE reservations SET state='REFUND_PENDING' WHERE id=?", args: [id] });
      return { id, state: 'REFUND_PENDING' };
    });
  }
  async advanceDeadlines() {
    return this.action('system', 'deadlines', 'ADVANCE_DEADLINES', async tx => {
      const rows = await tx.execute("SELECT r.*,e.ends_at,e.deadline,e.payment_mode FROM reservations r JOIN events e ON e.id=r.event_id WHERE r.state IN ('RESERVED','CONFIRMED','NO_SHOW_PENDING')");
      for (const r of rows.rows as Row[]) {
        if (r.payment_mode === 'PAID_ADMISSION' && this.config.now() >= r.ends_at && ['RESERVED','CONFIRMED'].includes(r.state)) {
          await tx.execute({ sql: "UPDATE reservations SET state='COMPLETED',settlement_state='ADMISSION_SETTLED' WHERE id=?", args: [r.id] });
          await tx.execute({ sql: "UPDATE verified_transactions SET principal_state='ADMISSION_SETTLED' WHERE reservation_id=?", args: [r.id] });
          continue;
        }
        if (this.config.now() >= r.deadline) {
          await this.refundReservation(tx, r.id, 'DEADLINE_DEFAULT_REFUND');
          await tx.execute({ sql: "UPDATE reservations SET state='REFUND_PENDING' WHERE id=?", args: [r.id] });
          await this.audit(tx, 'system', r.id, 'DEADLINE_REFUND', 'ACCEPTED', 'NO_TIMELY_DECISION');
        } else if (this.config.now() >= r.ends_at && ['RESERVED','CONFIRMED'].includes(r.state)) {
          await tx.execute({ sql: "UPDATE reservations SET state='NO_SHOW_PENDING' WHERE id=?", args: [r.id] });
          await this.audit(tx, 'system', r.id, 'NO_SHOW_PENDING', 'ACCEPTED', 'AWAITING_OPERATOR');
        }
      }
    });
  }
  async decide(actor: string, id: string, decision: 'refund' | 'forfeit', evidence: string) {
    return this.action(actor, id, 'OPERATOR_DECISION', async tx => {
      requireThat(actor === this.config.operator, 'FORBIDDEN');
      const r = await one(tx, 'SELECT * FROM reservations WHERE id=?', [id]); requireThat(r, 'RESERVATION_UNKNOWN');
      const e = await this.event(tx, r.event_id);
      requireThat(r.state === 'NO_SHOW_PENDING' && this.config.now() < e.deadline && this.config.now() >= e.ends_at, 'DECISION_CLOSED');
      requireThat(['refund','forfeit'].includes(decision) && typeof evidence === 'string' && evidence.trim().length > 0 && evidence.length <= 1000, 'INVALID_DECISION');
      await tx.execute({ sql: 'INSERT INTO operator_decisions(id,reservation_id,actor,decision,evidence,at) VALUES(?,?,?,?,?,?)', args: [randomUUID(), id, actor, decision, evidence, this.config.now()] });
      if (decision === 'refund') await this.refundReservation(tx, id, 'OPERATOR_REFUND');
      else await tx.execute({ sql: "UPDATE verified_transactions SET disposition='FORFEIT' WHERE reservation_id=? AND disposition='HELD'", args: [id] });
      await tx.execute({ sql: 'UPDATE reservations SET state=? WHERE id=?', args: [decision === 'refund' ? 'REFUND_PENDING' : 'FORFEITED', id] });
      return { id, decision };
    });
  }
  constructor(readonly store: Store, readonly config: Config) {
    for (const field of ['operator', 'organizer', 'treasury'] as const) config[field] = walletAddress(config[field]);
    new URL(config.domain);
  }
  async audit(tx: Transaction, actor: string, scope: string, action: string, outcome: string, reason: string) {
    await tx.execute({ sql: 'INSERT INTO lifecycle_events(at,actor,scope,action,outcome,reason) VALUES(?,?,?,?,?,?)', args: [this.config.now(), actor, scope, action, outcome, reason] });
  }
  async action<T>(actor: string, scope: string, action: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
    const outcome = await this.store.write(async tx => {
      await tx.execute('SAVEPOINT business');
      try {
        const value = await fn(tx);
        await tx.execute('RELEASE business');
        await this.audit(tx, actor, scope, action, 'ACCEPTED', 'OK');
        return { value };
      } catch (error) {
        await tx.execute('ROLLBACK TO business');
        await tx.execute('RELEASE business');
        const reason = error instanceof DomainError ? error.message : 'INTERNAL_ERROR';
        await this.audit(tx, actor, scope, action, 'REJECTED', reason);
        return { error };
      }
    });
    if ('error' in outcome) throw outcome.error;
    return outcome.value;
  }
  async loginChallenge(inputWallet: string) {
    return this.action('anonymous', 'login', 'LOGIN_CHALLENGE', async tx => {
      let wallet: string;
      try { wallet = walletAddress(inputWallet); } catch { throw new DomainError('INVALID_WALLET'); }
      const id = randomUUID(), expiresAt = this.config.now() + 120000;
      const message = canonicalChallenge({ domain: this.config.domain, action: 'login', wallet, eventId: null, reservationId: null, network: 5, nonce: randomBytes(32).toString('hex'), issuedAt: this.config.now(), expiresAt, payloadDigest: digest('login') });
      await tx.execute({ sql: 'INSERT INTO auth_challenges(id,wallet,action,message,expires_at) VALUES(?,?,?,?,?)', args: [id, wallet, 'login', message, expiresAt] });
      return { id, message, expiresAt };
    });
  }
  async login(id: string, proof: unknown) {
    // Cryptography is outside the write transaction. Recheck consumed/time inside.
    const challenge = await one(this.store.client, 'SELECT * FROM auth_challenges WHERE id=?', [id]);
    const valid = challenge && verifyWalletSignature(challenge.wallet, challenge.message, proof);
    const token = randomBytes(32).toString('hex');
    return this.action(challenge?.wallet ?? 'anonymous', id, 'LOGIN', async tx => {
      requireThat(challenge && challenge.action === 'login', 'CHALLENGE_UNKNOWN');
      requireThat(valid, 'INVALID_SIGNATURE');
      const current = await one(tx, 'SELECT * FROM auth_challenges WHERE id=?', [id]);
      requireThat(current && current.consumed_at === null, 'CHALLENGE_USED');
      requireThat(current.expires_at > this.config.now(), 'CHALLENGE_EXPIRED');
      await tx.execute({ sql: 'UPDATE auth_challenges SET consumed_at=? WHERE id=? AND consumed_at IS NULL', args: [this.config.now(), id] });
      const expiresAt = this.config.now() + 3600000;
      await tx.execute({ sql: 'INSERT INTO sessions(digest,wallet,expires_at) VALUES(?,?,?)', args: [digest(token), challenge.wallet, expiresAt] });
      if (this.config.bootstrapOperator) {
        const existing = await one(tx, 'SELECT wallet FROM organizers WHERE enabled=1 LIMIT 1');
        if (!existing) {
          await tx.execute({ sql: 'INSERT INTO organizers(wallet,enabled) VALUES(?,1)', args: [challenge.wallet] });
          this.config.operator = challenge.wallet;
          this.config.organizer = challenge.wallet;
        } else {
          this.config.operator = existing.wallet;
          this.config.organizer = existing.wallet;
        }
      }
      return { token, expiresAt };
    });
  }
  async sessionWallet(token: string): Promise<string | null> {
    return (await one(this.store.client, 'SELECT wallet FROM sessions WHERE digest=? AND revoked_at IS NULL AND expires_at>?', [digest(token), this.config.now()]))?.wallet ?? null;
  }
  async logout(token: string) {
    return this.action(await this.sessionWallet(token) ?? 'anonymous', 'session', 'LOGOUT', async tx => {
      await tx.execute({ sql: 'UPDATE sessions SET revoked_at=? WHERE digest=?', args: [this.config.now(), digest(token)] });
      return { revoked: true };
    });
  }
  terms(terms: Terms) {
    requireThat(terms && typeof terms.title === 'string' && terms.title.trim().length > 0 && terms.title.length <= 120, 'INVALID_TERMS');
    const amountLuna = terms.amountLuna ?? terms.deposit;
    const paymentMode = terms.paymentMode ?? 'REFUNDABLE_DEPOSIT';
    const participantCancellationPolicy = terms.participantCancellationPolicy ?? 'REFUND_BEFORE_CUTOFF';
    const checkInOpensAt = terms.checkInOpensAt ?? terms.startsAt;
    const checkInClosesAt = terms.checkInClosesAt ?? terms.endsAt;
    const rewardPolicy = terms.rewardPolicy ?? 'NONE', rewardPoolLuna = terms.rewardPoolLuna ?? 0;
    requireThat(Number.isSafeInteger(amountLuna) && amountLuna! > 0 && amountLuna! <= 1000000 && Number.isInteger(terms.capacity) && terms.capacity > 0 && terms.capacity <= 20, 'INVALID_TERMS');
    requireThat(['REFUNDABLE_DEPOSIT','PAID_ADMISSION'].includes(paymentMode) && ['REFUND_BEFORE_CUTOFF','NON_REFUNDABLE'].includes(participantCancellationPolicy), 'INVALID_TERMS');
    requireThat([terms.startsAt, terms.endsAt, checkInOpensAt, checkInClosesAt, terms.cancellationCutoff, terms.decisionDeadline].every(Number.isSafeInteger), 'INVALID_TERMS');
    requireThat(terms.cancellationCutoff > this.config.now() && terms.cancellationCutoff <= terms.startsAt && terms.startsAt <= checkInOpensAt && checkInOpensAt! < checkInClosesAt! && checkInClosesAt! <= terms.endsAt && terms.endsAt < terms.decisionDeadline, 'INVALID_TERMS');
    requireThat(rewardPolicy === 'NONE' && rewardPoolLuna === 0, 'REWARD_POLICY_DEFERRED');
    return { ...terms, deposit: amountLuna!, amountLuna: amountLuna!, paymentMode, participantCancellationPolicy, checkInOpensAt: checkInOpensAt!, checkInClosesAt: checkInClosesAt!, settlementPolicy: paymentMode === 'REFUNDABLE_DEPOSIT' ? 'REFUND_ON_VALID_CHECKIN' : 'RETAIN_ADMISSION', rewardPolicy: 'NONE' as const, rewardPoolLuna: 0, rewardRemainderPolicy: 'NONE' };
  }
  async createEvent(actor: string, terms: Terms) {
    return this.action(actor, 'events', 'CREATE_EVENT', async tx => {
      requireThat(actor === this.config.organizer, 'FORBIDDEN'); const fixed = this.terms(terms);
      const id = randomUUID();
      await tx.execute({ sql: 'INSERT OR IGNORE INTO organizers(wallet,enabled) VALUES(?,1)', args: [actor] });
      await tx.execute({ sql: "INSERT INTO events(id,organizer,title,state,deposit,payment_mode,amount_luna,capacity,starts_at,ends_at,cutoff,deadline,participant_cancellation_policy,check_in_opens_at,check_in_closes_at,settlement_policy,reward_policy,reward_pool_luna,reward_remainder_policy) VALUES(?,?,?,'DRAFT',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", args: [id, actor, fixed.title, fixed.deposit, fixed.paymentMode, fixed.amountLuna, fixed.capacity, fixed.startsAt, fixed.endsAt, fixed.cancellationCutoff, fixed.decisionDeadline, fixed.participantCancellationPolicy, fixed.checkInOpensAt, fixed.checkInClosesAt, fixed.settlementPolicy, fixed.rewardPolicy, fixed.rewardPoolLuna, fixed.rewardRemainderPolicy] });
      return { id, state: 'DRAFT' };
    });
  }
  async event(tx: Transaction, id: string): Promise<Row> {
    const event = await one(tx, 'SELECT * FROM events WHERE id=?', [id]);
    requireThat(event, 'EVENT_UNKNOWN'); return event;
  }
  async openEvent(actor: string, id: string) {
    return this.action(actor, id, 'OPEN_EVENT', async tx => {
      const event = await this.event(tx, id);
      requireThat(actor === event.organizer && actor === this.config.organizer, 'FORBIDDEN');
      requireThat(event.state === 'DRAFT' && event.cutoff > this.config.now(), 'EVENT_NOT_OPENABLE');
      const frozen = { title: event.title, network: event.network, paymentMode: event.payment_mode, amountLuna: event.amount_luna, capacity: event.capacity, startsAt: event.starts_at, endsAt: event.ends_at, checkInOpensAt: event.check_in_opens_at, checkInClosesAt: event.check_in_closes_at, cancellationCutoff: event.cutoff, decisionDeadline: event.deadline, participantCancellationPolicy: event.participant_cancellation_policy, settlementPolicy: event.settlement_policy, rewardPolicy: event.reward_policy, rewardPoolLuna: event.reward_pool_luna, rewardRemainderPolicy: event.reward_remainder_policy };
      const termsDigest = digest(JSON.stringify(frozen));
      await tx.execute({ sql: "UPDATE events SET state='OPEN',terms_digest=?,terms_frozen_at=? WHERE id=?", args: [termsDigest, this.config.now(), id] });
      return { id, state: 'OPEN', termsDigest };
    });
  }
  async editEvent(actor: string, id: string, terms: Terms) {
    return this.action(actor, id, 'EDIT_EVENT', async tx => {
      const event = await this.event(tx, id);
      requireThat(actor === event.organizer, 'FORBIDDEN'); requireThat(event.state === 'DRAFT', 'TERMS_LOCKED'); const fixed = this.terms(terms);
      await tx.execute({ sql: 'UPDATE events SET title=?,deposit=?,payment_mode=?,amount_luna=?,capacity=?,starts_at=?,ends_at=?,cutoff=?,deadline=?,participant_cancellation_policy=?,check_in_opens_at=?,check_in_closes_at=?,settlement_policy=?,reward_policy=?,reward_pool_luna=?,reward_remainder_policy=? WHERE id=?', args: [fixed.title, fixed.deposit, fixed.paymentMode, fixed.amountLuna, fixed.capacity, fixed.startsAt, fixed.endsAt, fixed.cancellationCutoff, fixed.decisionDeadline, fixed.participantCancellationPolicy, fixed.checkInOpensAt, fixed.checkInClosesAt, fixed.settlementPolicy, fixed.rewardPolicy, fixed.rewardPoolLuna, fixed.rewardRemainderPolicy, id] });
      return { id };
    });
  }
  async reserve(actor: string, eventId: string) {
    return this.action(actor, eventId, 'RESERVE', async tx => {
      const event = await this.event(tx, eventId);
      requireThat(event.state === 'OPEN' && this.config.now() < event.starts_at, 'EVENT_CLOSED');
      await tx.execute({ sql: "UPDATE reservations SET state='HOLD_EXPIRED' WHERE event_id=? AND state IN ('HELD','HOLD_CREATED') AND hold_expires<=?", args: [eventId, this.config.now()] });
      requireThat(!await one(tx, 'SELECT id FROM reservations WHERE event_id=? AND participant_wallet=?', [eventId, actor]), 'ALREADY_RESERVED');
      const seats = await one(tx, "SELECT count(*) AS n FROM reservations WHERE event_id=? AND (state IN ('RESERVED','CONFIRMED','CHECKED_IN','NO_SHOW_PENDING') OR (state IN ('HELD','HOLD_CREATED') AND hold_expires>?))", [eventId, this.config.now()]);
      requireThat(Number(seats!.n) < event.capacity, 'SOLD_OUT');
      const id = randomUUID(), memo = 'showup:v1:' + id, holdExpires = Math.min(this.config.now() + 900000, event.starts_at);
      await tx.execute({ sql: "INSERT INTO reservations(id,event_id,participant_wallet,beneficiary,state,hold_expires,memo) VALUES(?,?,?,?,'HOLD_CREATED',?,?)", args: [id, eventId, actor, actor, holdExpires, memo] });
      return { id, state: 'HOLD_CREATED', holdExpires, paymentMode: event.payment_mode, intent: { recipient: this.config.treasury, value: String(luna(event.amount_luna)), data: memo, network: 5 } };
    });
  }
}
