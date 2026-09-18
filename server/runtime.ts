import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Store } from './db/index';
import { ShowUp } from './domain/service';
import { NimiqRpc } from './nimiq/rpc';
import { TestnetSigner } from './nimiq/signer';
import { RefundWorker } from './worker/refunds';
import { verifyFunding } from './nimiq/verify';
import { PrivateKey } from '@nimiq/core';

export interface Runtime { app: ShowUp; rpc: NimiqRpc; signer?: TestnetSigner; worker?: RefundWorker }
let pending: Promise<Runtime> | undefined;
export function getRuntime(): Promise<Runtime> {
  pending ??= createRuntime();
  return pending;
}
async function createRuntime(): Promise<Runtime> {
  const origin = process.env.SHOWUP_PUBLIC_ORIGIN ?? 'http://localhost:3000';
  let operator = process.env.SHOWUP_OPERATOR_WALLET;
  let organizer = process.env.SHOWUP_ORGANIZER_WALLET ?? operator;
  let key = process.env.SHOWUP_SIGNER_PRIVATE_KEY_HEX;
  const localBootstrap = process.env.SHOWUP_LOCAL_TESTNET_BOOTSTRAP === '1';
  const bootstrapOperator = !operator && localBootstrap;
  if (!key && localBootstrap) {
    const keyPath = resolve('.data/testnet-signer.key');
    mkdirSync(dirname(keyPath), { recursive: true });
    if (!existsSync(keyPath)) writeFileSync(keyPath, PrivateKey.generate().toHex(), { encoding: 'utf8', mode: 0o600 });
    key = readFileSync(keyPath, 'utf8').trim();
  }
  const signer = key ? new TestnetSigner(key) : undefined;
  const treasury = signer?.address ?? process.env.SHOWUP_TREASURY_WALLET;
  if (!treasury) throw new Error('SHOWUP_SIGNER_CONFIGURATION_REQUIRED');
  const dbPath = resolve(process.env.SHOWUP_DATABASE_PATH ?? '.data/showup-testnet.db');
  mkdirSync(dirname(dbPath), { recursive: true });
  const store = await Store.open(dbPath);
  if (bootstrapOperator) {
    const existing = (await store.client.execute('SELECT wallet FROM organizers WHERE enabled=1 LIMIT 1')).rows[0]?.wallet;
    operator = existing ? String(existing) : treasury;
    organizer = operator;
  }
  if (!operator || !organizer) throw new Error('SHOWUP_WALLET_CONFIGURATION_REQUIRED');
  const app = new ShowUp(store, { domain: origin, operator, organizer, treasury, now: Date.now, bootstrapOperator });
  const rpc = new NimiqRpc(process.env.SHOWUP_RPC_URL ?? 'https://rpc.testnet.nimiqwatch.com/');
  const worker = signer ? new RefundWorker(app, {
    cash: async () => ({ balance: await rpc.balance(signer.address), height: Number((await rpc.head()).number), network: 5 }),
    prepare: policy => Promise.resolve(signer.prepare(policy)),
    broadcast: bytes => rpc.broadcast(bytes),
    final: async (hash, policy) => {
      try { await verifyFunding(rpc, { hash, wallet: signer.address, recipient: policy.beneficiary, value: policy.value, memo: '' }); return true; }
      catch { return false; }
    },
  }) : undefined;
  return { app, rpc, signer, worker };
}
