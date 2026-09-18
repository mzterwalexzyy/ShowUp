// Read-only spike. Real packages + synthetic adapter tests + public testnet reads.
// No wallet keys, existing configuration, database, signing or broadcast RPC used.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const rpcUrl = 'https://rpc.testnet.nimiqwatch.com/'
const publicHash = 'f22de823140123cfdb1cc15b1263889b925abe8bc301d603832a9f76aef0cbf6'

async function published(name, version) {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`, { signal: AbortSignal.timeout(15000) })
  assert.equal(response.status, 200)
  const metadata = await response.json()
  const download = await fetch(metadata.dist.tarball, { signal: AbortSignal.timeout(20000) })
  assert.equal(download.status, 200)
  const archive = Buffer.from(await download.arrayBuffer())
  assert.equal(`sha512-${createHash('sha512').update(archive).digest('base64')}`, metadata.dist.integrity)
  const tar = gunzipSync(archive)
  const files = new Map()
  for (let offset = 0; offset + 512 < tar.length;) {
    const name = tar.subarray(offset, offset + 100).toString().replace(/\0.*$/s, '')
    if (!name) break
    const size = parseInt(tar.subarray(offset + 124, offset + 136).toString().replace(/\0.*$/s, '').trim(), 8)
    assert(Number.isSafeInteger(size) && size >= 0)
    files.set(name, tar.subarray(offset + 512, offset + 512 + size))
    offset += 512 + Math.ceil(size / 512) * 512
  }
  return { metadata, files }
}

async function rpc(method, params = [], attempt = 0) {
  assert(['getNetworkId', 'getLatestBlock', 'getBlockByNumber', 'getTransactionByHash', 'isConsensusEstablished'].includes(method))
  const response = await fetch(rpcUrl, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(15000),
  })
  const body = await response.json()
  if (response.status === 429 && attempt < 4) {
    await new Promise(resolve => setTimeout(resolve, 5000 * (attempt + 1)))
    return rpc(method, params, attempt + 1)
  }
  return { httpStatus: response.status, data: body.result?.data, error: body.error }
}

export async function runSpike() {
  const [sdk, core] = await Promise.all([published('@nimiq/mini-app-sdk', '0.1.0'), published('@nimiq/core', '2.7.1')])
  const report = {
    observedAt: new Date().toISOString(),
    evidenceClasses: ['actual-published-package with synthetic host adapter', 'actual-public-testnet read-only'],
    sdk: { version: sdk.metadata.version, integrity: sdk.metadata.dist.integrity, gitHead: sdk.metadata.gitHead },
    core: { version: core.metadata.version, integrity: core.metadata.dist.integrity },
    checks: [], actualPayDeposit: false, actualPayRefund: false,
  }
  const check = async (name, work) => { await work(); report.checks.push({ name, result: 'pass' }) }
  const sdkModule = await import(`data:text/javascript;base64,${sdk.files.get('package/dist/index.js').toString('base64')}`)
  const providerModule = await import(`data:text/javascript;base64,${sdk.files.get('package/dist/provider.js').toString('base64')}`)
  const types = sdk.files.get('package/dist/provider.d.ts').toString()
  const previousWindow = globalThis.window
  const calls = []
  let result
  let thrown
  const provider = new providerModule.NimiqProvider()
  provider.setAdapter({ request: async (request, network) => {
    calls.push({ request, network })
    if (thrown) throw thrown
    return result
  } })
  try {
    globalThis.window = {}
    await check('init times out when provider is absent', async () => { await assert.rejects(sdkModule.init({ timeout: 5 }), /not injected/) })
    globalThis.window.nimiq = provider
    await check('fresh init succeeds after earlier failure', async () => { assert.equal(await sdkModule.init({ timeout: 100 }), provider) })
    await check('account enumeration returns host values', async () => { result = ['synthetic-wallet']; assert.deepEqual(await provider.listAccounts(), result) })
    await check('account enumeration is cached by provider', async () => { const n = calls.length; result = ['changed-wallet']; assert.deepEqual(await provider.listAccounts(), ['synthetic-wallet']); assert.equal(calls.length, n) })
    await check('sign forwards exact Unicode text and host signature result', async () => {
      result = { publicKey: 'synthetic-public-key', signature: 'synthetic-signature' }
      assert.deepEqual(await provider.sign('ShowUp\né'), result)
      assert.deepEqual(calls.at(-1).request.params, { message: 'ShowUp\né' })
    })
    await check('payment forwards integer Luna and exact memo, returning host string', async () => {
      result = 'a'.repeat(64)
      const intent = { recipient: 'synthetic-recipient', value: 100000, data: 'su:d:synthetic-intent' }
      assert.equal(await provider.sendBasicTransactionWithData(intent), result)
      assert.deepEqual(calls.at(-1).request.params, intent)
    })
    await check('provider preserves returned errors', async () => { result = { error: { type: 'PermissionDeniedError', message: 'Synthetic rejection' } }; assert.deepEqual(await provider.sign('test'), result) })
    await check('provider preserves thrown adapter errors', async () => { thrown = new Error('Synthetic timeout'); await assert.rejects(provider.sign('test'), /Synthetic timeout/); thrown = undefined })
    await check('ecosystem getNetwork is not a testnet identifier', async () => { assert.equal(provider.getNetwork(), 'nimiq') })
    await check('published transaction shape exposes network and proof but omits executionResult', async () => { const shape = types.slice(types.indexOf('interface TransactionInfo'), types.indexOf('interface ErrorResponse')); assert.match(shape, /networkId: number/); assert.match(shape, /proof: string/); assert.doesNotMatch(shape, /executionResult/) })
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }

  const coreDir = new URL('.compat/core/', root)
  await mkdir(coreDir, { recursive: true })
  await writeFile(new URL('index.cjs', coreDir), core.files.get('package/nodejs/main-wasm/index.js'))
  await writeFile(new URL('index_bg.wasm', coreDir), core.files.get('package/nodejs/main-wasm/index_bg.wasm'))
  const require = createRequire(import.meta.url)
  const Core = require(fileURLToPath(new URL('index.cjs', coreDir)))
  const [identity, head, transaction] = await Promise.all([rpc('getNetworkId'), rpc('getLatestBlock', [false]), rpc('getTransactionByHash', [publicHash])])
  report.rpc = { endpoint: rpcUrl, getNetworkId: { httpStatus: identity.httpStatus, error: identity.error }, head: { number: head.data?.number, network: head.data?.network } }
  assert.equal(head.data.network, 'TestAlbatross')
  const sample = transaction.data
  await check('actual public transaction has explicit successful execution and testnet ID', async () => { assert.equal(sample.hash, publicHash); assert.equal(sample.executionResult, true); assert.equal(sample.networkId, 5) })
  const tx = new Core.Transaction(Core.Address.fromAny(sample.from), sample.fromType, Buffer.from(sample.senderData, 'hex'), Core.Address.fromAny(sample.to), sample.toType, Buffer.from(sample.recipientData, 'hex'), BigInt(sample.value), BigInt(sample.fee), sample.flags, sample.validityStartHeight, sample.networkId)
  tx.proof = Buffer.from(sample.proof, 'hex')
  await check('actual public transaction reconstructs exact hash and verifies signature proof', async () => { assert.equal(tx.hash(), publicHash); tx.verify(5) })
  const proof = Core.HashedTimeLockedContract.proofToPlain(Buffer.from(sample.proof, 'hex'))
  await check('HTLC proof identifies cryptographic co-signers independently of contract sender', async () => {
    assert.equal(sample.fromType, 2)
    assert.equal(proof.pathLength, 0)
    assert.equal(proof.creatorPathLength, 0)
    for (const [key, sig, address] of [[proof.publicKey, proof.signature, proof.signer], [proof.creatorPublicKey, proof.creatorSignature, proof.creator]]) {
      const pk = Core.PublicKey.fromHex(key)
      assert(pk.verify(Core.Signature.fromHex(sig), tx.serializeContent()))
      assert.equal(pk.toAddress().toUserFriendlyAddress(), address)
      assert.notEqual(address, sample.from)
    }
  })
  report.sender = { sampleHash: publicHash, fromType: sample.fromType, proofType: proof.type, verifiedCoSigners: 2, attributionToActualPayLoginWallet: 'not tested' }
  // This observed sample is finalized by this concrete canonical block. Do not
  // extrapolate a hard-coded modulo policy to other networks or future upgrades.
  const macro = await rpc('getBlockByNumber', [11522910, false])
  await check('actual finalizing block is canonical testnet macro with justification', async () => { assert.equal(macro.data.type, 'macro'); assert.equal(macro.data.network, 'TestAlbatross'); assert(macro.data.justification.sig); assert(macro.data.number >= sample.blockNumber) })
  let cursor = macro.data
  let links = 0
  while (cursor.number > sample.blockNumber) {
    await new Promise(resolve => setTimeout(resolve, 1000))
    const parent = await rpc('getBlockByNumber', [cursor.number - 1, cursor.number - 1 === sample.blockNumber])
    assert(parent.data, `Missing parent ${cursor.number - 1}: HTTP ${parent.httpStatus}, error=${JSON.stringify(parent.error)}`)
    assert.equal(parent.data.hash, cursor.parentHash)
    cursor = parent.data
    links++
  }
  await check('canonical parent chain reaches sample transaction block', async () => { assert(cursor.transactions.some(t => t.hash === publicHash && t.executionResult === true)) })
  report.finality = { macroNumber: macro.data.number, macroHash: macro.data.hash, transactionBlock: sample.blockNumber, verifiedParentLinks: links, trust: 'RPC node canonical-chain assertion, not independent consensus validation' }
  report.memo = { encoding: 'recipientData is hex UTF-8', byteLength: Buffer.from(sample.recipientData, 'hex').length }
  report.gate = 'RPC and proof primitives supported; actual Pay wallet-to-spend binding remains unverified'
  await writeFile(new URL('docs/nimiq-compatibility-results.json', root), JSON.stringify(report, null, 2) + '\n')
  return report
}

if (process.argv.includes('--run')) {
  const report = await runSpike()
  console.log(JSON.stringify({ passed: report.checks.length, gate: report.gate, actualPayDeposit: false, actualPayRefund: false }))
}
