import { Address, Transaction, HashedTimeLockedContract, PublicKey, Signature } from '@nimiq/core';
import { luna } from '../domain/money';
import { walletAddress } from '../auth/signatures';

export interface ChainReader {
  transaction(hash: string): Promise<any>;
  head(): Promise<any>;
  block(number: number): Promise<any>;
}
export interface ExpectedDeposit { hash: string; wallet: string; recipient: string; value: number; memo: string }
export interface VerifiedDeposit { hash: string; wallet: string; recipient: string; value: number; memo: string; block: number; macroHash: string; network: 5 }
function check(condition: unknown, code: string): asserts condition { if (!condition) throw new Error(code); }
export function hex(value: unknown): Uint8Array {
  check(typeof value === 'string' && /^(?:[a-f0-9]{2})*$/i.test(value), 'INVALID_HEX');
  return new Uint8Array(Buffer.from(value, 'hex'));
}
export async function verifyFunding(rpc: ChainReader, expected: ExpectedDeposit): Promise<VerifiedDeposit> {
  check(/^[a-f0-9]{64}$/i.test(expected.hash), 'INVALID_HASH');
  const data = await rpc.transaction(expected.hash);
  check(data && data.hash === expected.hash, 'HASH_MISMATCH');
  check(data.networkId === 5, 'WRONG_NETWORK');
  check(data.executionResult === true, 'EXECUTION_UNVERIFIED');
  check(Number.isSafeInteger(data.blockNumber) && data.blockNumber > 0, 'PENDING');
  check(walletAddress(data.to) === walletAddress(expected.recipient) && data.toType === 0, 'WRONG_RECIPIENT');
  check(luna(data.value) === luna(expected.value), 'WRONG_AMOUNT');
  check(data.recipientData.toLowerCase() === Buffer.from(expected.memo, 'utf8').toString('hex'), 'WRONG_MEMO');
  check(Number.isSafeInteger(data.validityStartHeight) && data.validityStartHeight >= 0 && data.flags === 0, 'INVALID_TRANSACTION');
  const tx = new Transaction(Address.fromAny(data.from), data.fromType, hex(data.senderData), Address.fromAny(data.to), data.toType, hex(data.recipientData), BigInt(luna(data.value)), BigInt(luna(data.fee)), data.flags, data.validityStartHeight, 5);
  tx.proof = hex(data.proof);
  check(tx.hash() === expected.hash, 'HASH_MISMATCH');
  tx.verify(5);
  let bound = false;
  if (data.fromType === 0) bound = walletAddress(data.from) === walletAddress(expected.wallet);
  if (data.fromType === 2) {
    const proof = HashedTimeLockedContract.proofToPlain(tx.proof) as unknown as Record<string, any>;
    // Only an independently verified single-key proof can bind the login wallet.
    for (const prefix of ['', 'creator']) {
      const field = (name: string) => prefix ? prefix + name[0]!.toUpperCase() + name.slice(1) : name;
      if (proof[field('pathLength')] !== 0 || typeof proof[field('publicKey')] !== 'string') continue;
      const key = PublicKey.fromHex(proof[field('publicKey')]);
      const signature = Signature.fromHex(proof[field('signature')]);
      if (key.verify(signature, tx.serializeContent()) && key.toAddress().toUserFriendlyAddress() === walletAddress(expected.wallet)) bound = true;
    }
  }
  check(bound, 'WRONG_SENDER');
  const head = await rpc.head();
  check(head?.network === 'TestAlbatross', 'WRONG_NETWORK');
  check(head.number > data.blockNumber, 'PENDING_FINALITY');
  let block = await rpc.block(data.blockNumber);
  check(block?.number === data.blockNumber && block.network === 'TestAlbatross' && /^[a-f0-9]{64}$/i.test(block.hash), 'INVALID_BLOCK');
  check(Array.isArray(block.transactions) && block.transactions.some((entry: any) => entry.hash === expected.hash && entry.executionResult === true), 'INCLUSION_UNVERIFIED');
  // Look for an actual macro, never height modulo 60. Bounded to one batch.
  for (let n = data.blockNumber + 1; n <= Math.min(head.number, data.blockNumber + 60); n++) {
    const next = await rpc.block(n);
    check(next?.number === n && next.network === 'TestAlbatross' && next.parentHash === block.hash && /^[a-f0-9]{64}$/i.test(next.hash), 'ANCESTRY_UNVERIFIED');
    if (next.type === 'macro' && next.justification && typeof next.justification === 'object') {
      return { hash: expected.hash, wallet: walletAddress(expected.wallet), recipient: walletAddress(expected.recipient), value: data.value, memo: expected.memo, block: data.blockNumber, macroHash: next.hash, network: 5 };
    }
    block = next;
  }
  throw new Error('PENDING_FINALITY');
}
