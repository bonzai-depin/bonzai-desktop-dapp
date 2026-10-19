import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import config from '../scripts/protocol-config.cjs';
import { requiredContracts } from '../scripts/check-web3-production.mjs';

test('public template contains every required contract, without invented addresses', () => {
  const source = readFileSync('config/protocol.env', 'utf8');
  for (const name of [...requiredContracts, 'TOKEN', 'USDC']) {
    assert.ok(source.includes(`VITE_BONZAI_${name}_ROBINHOOD_ADDRESS=`));
  }
  assert.equal(config.parseProtocolConfig(source).VITE_BONZAI_ECONOMY_CHAIN_ID, '4663');
});

test('public configuration refuses secrets and arbitrary build environment injection', () => {
  for (const key of ['DEPLOYER_PRIVATE_KEY', 'HF_TOKEN', 'NODE_OPTIONS', 'VITE_PRIVATE_KEY']) {
    assert.throws(() => config.parseProtocolConfig(`${key}=hidden`), /Unsupported public/);
  }
});

test('CI config is isolated, fills blank legacy env and derives selected-chain deployment inputs', () => {
  const root = mkdtempSync(join(tmpdir(), 'bonzai-config-'));
  try {
    mkdirSync(join(root, 'config'));
    writeFileSync(join(root, 'config/protocol.env'), 'VITE_BONZAI_ECONOMY_CHAIN_ID=4663\nVITE_BONZAI_TOKEN_ROBINHOOD_ADDRESS=old');
    const env = { BONZAI_PROTOCOL_CONFIG_ENV: 'VITE_BONZAI_ECONOMY_CHAIN_ID=8453\nVITE_BONZAI_TOKEN_BASE_ADDRESS=new', VITE_BONZAI_TOKEN_BASE_ADDRESS: '' };
    config.loadProtocolConfig({ root, env });
    assert.equal(env.BONZAI_TOKEN_ADDRESS, 'new');
    assert.equal(env.VITE_BONZAI_TOKEN_ROBINHOOD_ADDRESS, undefined);
    assert.throws(() => config.loadProtocolConfig({ root, env: { ...env, BONZAI_TOKEN_ADDRESS: 'conflict' } }), /Conflicting/);
  } finally { rmSync(root, { recursive: true }); }
});
