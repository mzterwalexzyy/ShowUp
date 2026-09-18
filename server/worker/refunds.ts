import { randomUUID } from 'node:crypto';
import { one } from '../db/index';
import type { ShowUp } from '../domain/service';

export interface PreparedRefund {
  bytes: string;
  hash: string;
  beneficiary: string;
  value: number;
  fee: number;
  network: 5;
  validityStartHeight: number;
}
export interface RefundBoundary {
  cash(): Promise<{ balance: number; height: number; network: number }>;
  prepare(policy: { beneficiary: string; value: number; fee: number; network: 5; validityStartHeight: number }): Promise<PreparedRefund>;
  broadcast(bytes: string): Promise<string>;
  final(hash: string, policy: { beneficiary: string; value: number; network: 5 }): Promise<boolean>;
}
type Attempt = Record<string, any> & { id: string; obligation_id: string; beneficiary: string; value: number; fee: number; existing: boolean; signed_bytes?: string; transaction_hash?: string };
export class RefundWorker {
  static readonly feeReserve = 0;
  constructor(readonly app: ShowUp, readonly boundary: RefundBoundary) {}

  async recover(): Promise<void> {
    const rows = await this.app.store.client.execute("SELECT t.*,d.wallet FROM transfer_attempts t JOIN refund_obligations o ON o.id=t.obligation_id JOIN verified_transactions d ON d.id=o.deposit_id WHERE t.state IN ('BROADCAST','MANUAL_REVIEW')");
    for (const row of rows.rows as any[]) {
      let final = false;
      try { final = await this.boundary.final(row.transaction_hash, { beneficiary: row.beneficiary, value: Number(row.value), network: 5 }); } catch { continue; }
      if (!final) continue;
      await this.app.store.write(async tx => {
        const current = await one(tx, 'SELECT state FROM transfer_attempts WHERE id=?', [row.id]);
        if (!current || !['BROADCAST','MANUAL_REVIEW'].includes(current.state)) return;
        await tx.execute({ sql: "UPDATE transfer_attempts SET state='SETTLED' WHERE id=?", args: [row.id] });
        await tx.execute({ sql: "UPDATE refund_obligations SET state='SETTLED' WHERE id=?", args: [row.obligation_id] });
        await tx.execute({ sql: "UPDATE verified_transactions SET disposition='SETTLED' WHERE id=(SELECT deposit_id FROM refund_obligations WHERE id=?)", args: [row.obligation_id] });
        await tx.execute({ sql: "UPDATE verified_transactions SET principal_state='REFUND_SETTLED' WHERE id=(SELECT deposit_id FROM refund_obligations WHERE id=?)", args: [row.obligation_id] });
        await this.app.audit(tx, 'worker', row.obligation_id, 'REFUND_SETTLED', 'ACCEPTED', 'FINAL');
      });
    }
  }

  async runOne(options: { stopAfterPrepare?: boolean } = {}): Promise<void> {
    let attempt: Attempt | null = await this.app.store.write(async tx => {
      const prepared = await one(tx, "SELECT t.*,d.wallet FROM transfer_attempts t JOIN refund_obligations o ON o.id=t.obligation_id JOIN verified_transactions d ON d.id=o.deposit_id WHERE t.state='PREPARED' ORDER BY t.created_at LIMIT 1");
      if (prepared) return { ...prepared, existing: true } as Attempt;
      const obligation = await one(tx, "SELECT o.id AS obligation_id,d.wallet,d.value FROM refund_obligations o JOIN verified_transactions d ON d.id=o.deposit_id WHERE o.state='PENDING' AND NOT EXISTS(SELECT 1 FROM transfer_attempts t WHERE t.obligation_id=o.id) ORDER BY o.rowid LIMIT 1");
      if (!obligation) return null;
      const id = randomUUID();
      await tx.execute({ sql: "INSERT INTO transfer_attempts(id,obligation_id,state,beneficiary,value,fee,network,created_at) VALUES(?,?,'PREPARING',?,?,?,5,?)", args: [id, obligation.obligation_id, obligation.wallet, obligation.value, RefundWorker.feeReserve, this.app.config.now()] });
      await tx.execute({ sql: "UPDATE refund_obligations SET state='PREPARING' WHERE id=? AND state='PENDING'", args: [obligation.obligation_id] });
      await this.app.audit(tx, 'worker', obligation.obligation_id, 'REFUND_CLAIM', 'ACCEPTED', 'EXCLUSIVE');
      return { id, ...obligation, beneficiary: obligation.wallet, value: Number(obligation.value), fee: RefundWorker.feeReserve, existing: false } as Attempt;
    });
    if (!attempt) return;

    if (!attempt.existing) {
      const claimed = attempt;
      const cash = await this.boundary.cash();
      if (cash.network !== 5 || !Number.isSafeInteger(cash.balance) || cash.balance < Number(claimed.value) + Number(claimed.fee)) {
        await this.app.store.write(async tx => {
          await tx.execute({ sql: "UPDATE transfer_attempts SET state='FAILED' WHERE id=? AND state='PREPARING'", args: [claimed.id] });
          await tx.execute({ sql: "UPDATE refund_obligations SET state='PENDING' WHERE id=? AND state='PREPARING'", args: [claimed.obligation_id] });
          await this.app.audit(tx, 'worker', claimed.obligation_id, 'REFUND_PREPARE', 'REJECTED', 'INSUFFICIENT_BALANCE_OR_NETWORK');
        });
        return;
      }
      const policy = { beneficiary: String(claimed.beneficiary), value: Number(claimed.value), fee: Number(claimed.fee), network: 5 as const, validityStartHeight: cash.height };
      let prepared: PreparedRefund;
      try { prepared = await this.boundary.prepare(policy); }
      catch {
        await this.app.store.write(async tx => {
          await tx.execute({ sql: "UPDATE transfer_attempts SET state='MANUAL_REVIEW' WHERE id=?", args: [claimed.id] });
          await tx.execute({ sql: "UPDATE refund_obligations SET state='MANUAL_REVIEW' WHERE id=?", args: [claimed.obligation_id] });
          await this.app.audit(tx, 'worker', claimed.obligation_id, 'REFUND_PREPARE', 'REJECTED', 'SIGNING_FAILED');
        });
        return;
      }
      if (prepared.beneficiary !== policy.beneficiary || prepared.value !== policy.value || prepared.fee !== policy.fee || prepared.network !== 5 || prepared.validityStartHeight !== policy.validityStartHeight || !prepared.bytes || !/^[a-f0-9]{64}$/i.test(prepared.hash)) throw new Error('SIGNER_POLICY_MISMATCH');
      await this.app.store.write(async tx => {
        const current = await one(tx, 'SELECT state FROM transfer_attempts WHERE id=?', [claimed.id]);
        if (current?.state !== 'PREPARING') throw new Error('PREPARATION_CLAIM_LOST');
        await tx.execute({ sql: "UPDATE transfer_attempts SET state='PREPARED',validity_start_height=?,signed_bytes=?,transaction_hash=? WHERE id=?", args: [prepared.validityStartHeight, prepared.bytes, prepared.hash, claimed.id] });
        await tx.execute({ sql: "UPDATE refund_obligations SET state='PREPARED' WHERE id=?", args: [claimed.obligation_id] });
        await this.app.audit(tx, 'worker', claimed.obligation_id, 'REFUND_PREPARED', 'ACCEPTED', prepared.hash);
      });
      attempt = { ...attempt, ...prepared, signed_bytes: prepared.bytes, transaction_hash: prepared.hash } as Attempt;
      if (options.stopAfterPrepare) return;
    }

    const won = await this.app.store.write(async tx => {
      const result = await tx.execute({ sql: "UPDATE transfer_attempts SET state='BROADCASTING' WHERE id=? AND state='PREPARED'", args: [attempt.id] });
      if (result.rowsAffected !== 1) return false;
      await tx.execute({ sql: "UPDATE refund_obligations SET state='BROADCAST' WHERE id=?", args: [attempt.obligation_id] });
      return true;
    });
    if (!won) return;
    try {
      const returned = await this.boundary.broadcast(String(attempt.signed_bytes));
      if (returned !== attempt.transaction_hash) throw new Error('HASH_MISMATCH');
      await this.app.store.write(async tx => {
        await tx.execute({ sql: "UPDATE transfer_attempts SET state='BROADCAST' WHERE id=? AND state='BROADCASTING'", args: [attempt.id] });
        await this.app.audit(tx, 'worker', attempt.obligation_id, 'REFUND_BROADCAST', 'ACCEPTED', returned);
      });
    } catch {
      await this.app.store.write(async tx => {
        await tx.execute({ sql: "UPDATE transfer_attempts SET state='MANUAL_REVIEW' WHERE id=?", args: [attempt.id] });
        await tx.execute({ sql: "UPDATE refund_obligations SET state='MANUAL_REVIEW' WHERE id=?", args: [attempt.obligation_id] });
        await this.app.audit(tx, 'worker', attempt.obligation_id, 'REFUND_BROADCAST', 'REJECTED', 'UNKNOWN_OUTCOME');
      });
      return;
    }
    await this.recover();
  }
}
