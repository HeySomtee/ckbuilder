/* Offline genuine OmniLock support for an isolated CKB dev chain. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ccc = require('@ckb-ccc/core');
const { Wallet } = require('ethers');

const PIN = Object.freeze({
  rpc: 'https://testnet.ckb.dev/',
  outPoint: {
    txHash: '0xec18bf0d857c981c3d1f4e17999b9b90c484b303378e94de1a57b0872f5d4602',
    index: 0,
  },
  typeHash: '0xf329effd1c475a2978453c8600e1eaf0bc2087ee093c3ee64cc96ec6847752cb',
  dataHash: '0x6b29b6f10346b43c540e53806ba88ba0fe3a0c3a29d7448ef555840c8f8318fa',
  sizeBytes: 139936,
  secpDataHash: '0x9799bee251b975b82c45a02154ce28cec89c5853ecc14d12b7b8cccfc19e0af4',
});
const cache = path.resolve(__dirname, '../../../.quality-artifacts/direct-chain/dependencies');
const artifact = path.join(cache, `omnilock-${PIN.dataHash.slice(2)}.bin`);
function readOmniLock() {
  if (!fs.existsSync(artifact))
    throw Error(
      'Missing offline OmniLock artifact. Explicitly run direct-omnilock-setup.cjs --download before the isolated gate.',
    );
  const binary = fs.readFileSync(artifact);
  assert.equal(binary.length, PIN.sizeBytes, 'OmniLock artifact size changed');
  assert.equal(ccc.hashCkb(binary), PIN.dataHash, 'OmniLock artifact hash changed');
  return binary;
}

// Public deterministic fixture only. Never funded on a public chain or read from an environment.
const PUBLIC_EVM_FIXTURE_KEY = `0x${'11'.repeat(32)}`;
class FixtureEvmSigner extends ccc.SignerEvmAddressReadonly {
  constructor(client) {
    const wallet = new Wallet(PUBLIC_EVM_FIXTURE_KEY);
    super(client, wallet.address);
    this.wallet = wallet;
    this.messages = [];
  }
  async signMessageRaw(message) {
    const personalMessage =
      typeof message === 'string' ? message : new Uint8Array(ccc.bytesFrom(message));
    this.messages.push(
      typeof personalMessage === 'string' ? personalMessage : ccc.hexFrom(personalMessage),
    );
    return this.wallet.signMessage(personalMessage);
  }
}

async function setupOmniActor(h, productClient) {
  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(productClient.url, 'http://127.0.0.1:8218');
  const binary = readOmniLock();
  const genesis = await h.rpc('get_block_by_number', ['0x0']);
  assert(
    genesis.transactions[0].outputs_data.some((data) => ccc.hashCkb(data) === PIN.secpDataHash),
    'Dev genesis lacks the pinned secp256k1 data required by OmniLock',
  );
  const deployment = await h.build(
    h.admin,
    [],
    [{ capacity: BigInt(binary.length + 100) * h.CKB, lock: h.admin.lock }],
    [ccc.hexFrom(binary)],
  );
  const deployed = await h.commit(h.admin, deployment);
  await h.mine(3);
  const scripts = { ...productClient.scripts };
  scripts[ccc.KnownScript.OmniLock] = {
    codeHash: PIN.dataHash,
    hashType: 'data2',
    cellDeps: [
      ...scripts[ccc.KnownScript.Secp256k1Blake160].cellDeps,
      { cellDep: { outPoint: deployed[0].outPoint, depType: 'code' } },
    ],
  };
  const client = new ccc.ClientPublicTestnet({ url: productClient.url, fallbacks: [], scripts });
  const signer = new FixtureEvmSigner(client);
  const lock = (await signer.getRecommendedAddressObj()).script;
  assert.equal(ccc.bytesFrom(lock.args).length, 22);
  assert.equal(lock.args.slice(0, 4), '0x12', 'Exercise modern EVM personal-message OmniLock');
  const funding = await h.build(h.admin, [], [{ capacity: 10_000n * h.CKB, lock }], ['0x']);
  const funded = await h.commit(h.admin, funding);
  await h.mine(3);
  return {
    signer,
    lock,
    fund: funded[0],
    deploymentHash: deployment.hash(),
    fundingHash: funding.hash(),
  };
}
module.exports = { PIN, cache, artifact, readOmniLock, setupOmniActor };
