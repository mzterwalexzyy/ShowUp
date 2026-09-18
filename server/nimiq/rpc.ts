import type { ChainReader } from './verify';

export class NimiqRpc implements ChainReader {
  constructor(readonly url: string) {}
  async call(method: string, params: unknown[] = [], attempt = 0): Promise<any> {
    let response: Response;
    try {
      response = await fetch(this.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(15000) });
    } catch { throw new Error('RPC_UNAVAILABLE'); }
    if (response.status === 429 && attempt < 3) {
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      return this.call(method, params, attempt + 1);
    }
    if (!response.ok) throw new Error('RPC_UNAVAILABLE');
    const body = await response.json() as any;
    if (body.error) throw new Error('RPC_ERROR');
    return body.result?.data;
  }
  transaction(hash: string) { return this.call('getTransactionByHash', [hash]); }
  head() { return this.call('getLatestBlock', [false]); }
  block(number: number) { return this.call('getBlockByNumber', [number, true]); }
  async balance(address: string): Promise<number> {
    const account = await this.call('getAccountByAddress', [address]);
    const value = Number(account?.balance);
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('RPC_INVALID_BALANCE');
    return value;
  }
  async broadcast(bytes: string): Promise<string> {
    const hash = await this.call('sendRawTransaction', [bytes]);
    if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/i.test(hash)) throw new Error('RPC_INVALID_HASH');
    return hash;
  }
}
