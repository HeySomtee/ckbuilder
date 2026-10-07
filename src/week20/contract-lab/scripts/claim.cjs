// Standalone recovery: only a local key, the published manifest and CKB RPC.
const fs = require('node:fs');
const path = require('node:path');
const ccc = require('@ckb-ccc/core');
async function main() {
  const [hash, index, keyFile] = process.argv.slice(2);
  if (!/^0x[0-9a-f]{64}$/i.test(hash || '') || !/^\d+$/.test(index || '') || !keyFile) throw new Error('Usage: node scripts/claim.cjs TX_HASH OUTPUT_INDEX KEY_FILE');
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../web/deployment.json')));
  const client = new ccc.ClientPublicTestnet({ url: manifest.rpc, fallbacks: [] });
  const signer = new ccc.SignerCkbPrivateKey(client, fs.readFileSync(keyFile, 'utf8').trim());
  const { buildClaim } = await import('../web/client.mjs');
  const tx = await buildClaim(ccc, client, signer, { txHash: hash, index: Number(index) }, manifest);
  const sent = await signer.sendTransaction(tx);
  console.log('Submitted:', sent);
  await client.waitTransaction(sent, 1, 300000);
  console.log('Confirmed: https://pudge.explorer.nervos.org/transaction/' + sent);
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
