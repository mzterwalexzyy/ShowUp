const address = process.argv[2]
if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(address || '')) throw new Error('Pass this computer LAN IPv4 address')
process.env.HOST = '0.0.0.0'
process.env.PORT = process.env.PORT || '3000'
process.env.SHOWUP_PUBLIC_ORIGIN = `http://${address}:${process.env.PORT}`
process.env.SHOWUP_LOCAL_TESTNET_BOOTSTRAP = '1'
await import('../.output/server/index.mjs')
