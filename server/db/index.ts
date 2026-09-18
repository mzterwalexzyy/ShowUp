import { createClient, type Client, type InValue } from '@libsql/client';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { schema } from './schema';

const locks = new Map<string, Promise<void>>();
export type Row = Record<string, any>;
export type Transaction = Pick<Client, 'execute'>;
export type Connection = Transaction;
export async function one(db: Connection, sql: string, args: InValue[] = []): Promise<Row | undefined> {
  return (await db.execute({ sql, args })).rows[0] as Row | undefined;
}
export class Store {
  constructor(readonly client: Client, readonly path: string) {}
  static async open(path: string): Promise<Store> {
    const absolute = resolve(path);
    const client = createClient({ url: pathToFileURL(absolute).href });
    await client.executeMultiple(schema);
    await migrate(client);
    return new Store(client, absolute);
  }
  close() { this.client.close(); }
  async count(table: string): Promise<number> {
    if (!/^[a-z_]+$/.test(table)) throw new Error('INVALID_TABLE');
    return Number((await one(this.client, 'SELECT count(*) AS n FROM ' + table))!.n);
  }
  /** All callbacks are local SQL only. External verification happens before entry. */
  async write<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    const previous = locks.get(this.path) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>(r => { release = r; });
    locks.set(this.path, next);
    await previous;
    let writer: Client | undefined;
    try {
      // The local libSQL transaction wrapper retains its native connection until
      // GC. Own a separate client so commit/rollback also releases the handle.
      writer = createClient({ url: pathToFileURL(this.path).href });
      await writer.execute('PRAGMA foreign_keys = ON');
      await writer.execute('BEGIN IMMEDIATE');
      const result = await fn(writer);
      await writer.execute('COMMIT');
      return result;
    } catch (error) {
      if (writer) await writer.execute('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      writer?.close(); release();
      if (locks.get(this.path) === next) locks.delete(this.path);
    }
  }
}

async function migrate(client: Client) {
  const columns = async (table: string) => new Set((await client.execute(`PRAGMA table_info(${table})`)).rows.map(row => String(row.name)));
  const eventColumns = await columns('events');
  const eventMigrations: Array<[string, string]> = [
    ['payment_mode', "ALTER TABLE events ADD COLUMN payment_mode TEXT NOT NULL DEFAULT 'REFUNDABLE_DEPOSIT'"],
    ['amount_luna', 'ALTER TABLE events ADD COLUMN amount_luna INTEGER NOT NULL DEFAULT 100000'],
    ['participant_cancellation_policy', "ALTER TABLE events ADD COLUMN participant_cancellation_policy TEXT NOT NULL DEFAULT 'REFUND_BEFORE_CUTOFF'"],
    ['check_in_opens_at', 'ALTER TABLE events ADD COLUMN check_in_opens_at INTEGER NOT NULL DEFAULT 0'],
    ['check_in_closes_at', 'ALTER TABLE events ADD COLUMN check_in_closes_at INTEGER NOT NULL DEFAULT 0'],
    ['settlement_policy', "ALTER TABLE events ADD COLUMN settlement_policy TEXT NOT NULL DEFAULT 'REFUND_ON_VALID_CHECKIN'"],
    ['terms_digest', 'ALTER TABLE events ADD COLUMN terms_digest TEXT'],
    ['terms_frozen_at', 'ALTER TABLE events ADD COLUMN terms_frozen_at INTEGER'],
    ['reward_policy', "ALTER TABLE events ADD COLUMN reward_policy TEXT NOT NULL DEFAULT 'NONE'"],
    ['reward_pool_luna', 'ALTER TABLE events ADD COLUMN reward_pool_luna INTEGER NOT NULL DEFAULT 0'],
    ['reward_remainder_policy', "ALTER TABLE events ADD COLUMN reward_remainder_policy TEXT NOT NULL DEFAULT 'NONE'"],
  ];
  for (const [name, sql] of eventMigrations) if (!eventColumns.has(name)) await client.execute(sql);
  await client.execute('UPDATE events SET amount_luna=deposit WHERE amount_luna<>deposit OR amount_luna IS NULL');
  await client.execute('UPDATE events SET check_in_opens_at=starts_at WHERE check_in_opens_at=0');
  await client.execute('UPDATE events SET check_in_closes_at=ends_at WHERE check_in_closes_at=0');

  const reservationColumns = await columns('reservations');
  if (!reservationColumns.has('settlement_state')) await client.execute("ALTER TABLE reservations ADD COLUMN settlement_state TEXT NOT NULL DEFAULT 'UNSETTLED'");
  const transactionColumns = await columns('verified_transactions');
  if (!transactionColumns.has('payment_mode')) await client.execute("ALTER TABLE verified_transactions ADD COLUMN payment_mode TEXT NOT NULL DEFAULT 'REFUNDABLE_DEPOSIT'");
  if (!transactionColumns.has('principal_state')) await client.execute("ALTER TABLE verified_transactions ADD COLUMN principal_state TEXT NOT NULL DEFAULT 'HELD'");

  await client.execute('DROP TRIGGER IF EXISTS immutable_open_terms');
  await client.execute(`CREATE TRIGGER immutable_open_terms BEFORE UPDATE OF deposit,payment_mode,amount_luna,capacity,starts_at,ends_at,cutoff,deadline,participant_cancellation_policy,check_in_opens_at,check_in_closes_at,settlement_policy,terms_digest,terms_frozen_at,reward_policy,reward_pool_luna,reward_remainder_policy,organizer,network ON events WHEN OLD.state<>'DRAFT' BEGIN SELECT RAISE(ABORT,'TERMS_LOCKED'); END`);
}
