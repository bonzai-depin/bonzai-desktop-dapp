import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ethers } from 'ethers';
import solc from 'solc';

const clients = [
  ['companionToken.service.js', 'FACTORY_ABI', 'CompanionTokenFactory'],
  ['companionToken.service.js', 'TOKEN_ABI', 'CompanionToken'],
  ['fineTuneToken.service.js', 'FACTORY_ABI', 'FineTuneTokenFactory'],
  ['fineTuneToken.service.js', 'TOKEN_ABI', 'FineTuneToken', 'FineTuneTokenFactory'],
  ['contributionRegistry.service.js', 'CONTRIBUTION_REGISTRY_ABI', 'BonzaiContributionRegistry'],
  ['contributionRegistry.service.js', 'DATASET_REGISTRY_ABI', 'BonzaiDatasetRegistry'],
  ['contributionRegistry.service.js', 'MODEL_REGISTRY_ABI', 'BonzaiModelRegistry'],
  ['bonzaiRevenueRouter.service.js', 'ROUTER_ABI', 'BonzaiRevenueRouter'],
  ['bonzaiRevenueRouter.service.js', 'MODEL_VAULT_ABI', 'BonzaiLiquidityVault'],
  ['liquidityVault.service.js', 'ABI', 'BonzaiLiquidityVault'],
  ['liquidityVault.service.js', 'FACTORY_ABI', 'BonzaiAgentTokenFactory'],
  ['bonzaiStaking.service.js', 'STAKING_ABI', 'BonzaiStakingVault'],
  ['gameToken.service.js', 'ABI', 'GameTokenFactory'],
  ['gameToken.service.js', 'TOKEN_ABI', 'GameToken', 'GameTokenFactory'],
  ['gameToken.service.js', 'REGISTRY_ABI', 'BonzaiGameRegistry'],
];
const sources = Object.fromEntries([...new Set(clients.map(([, , name, file]) => file || name))].map(name => [
  `${name}.sol`, { content: readFileSync(new URL(`../src/contracts/${name}.sol`, import.meta.url), 'utf8') },
]));
const compiled = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources, settings: { outputSelection: { '*': { '*': ['abi'] } } } }), {
  import: path => {
    try { return { contents: readFileSync(new URL(`../${path.startsWith('@') ? 'node_modules' : 'src/contracts'}/${path}`, import.meta.url), 'utf8') }; }
    catch { return { error: `Missing ${path}` }; }
  },
}));
assert.deepEqual((compiled.errors || []).filter(error => error.severity === 'error'), []);

for (const [file, variable, name, contractFile] of clients) {
  test(`${file} ${variable} matches current ${name} contract`, () => {
    const source = readFileSync(new URL(`../src/services/${file}`, import.meta.url), 'utf8');
    const block = source.match(new RegExp(`const ${variable} = \\[([\\s\\S]*?)\\n\\];?`))[1];
    const declarations = [...block.matchAll(/^[ \t]*['"](function [^'"\n]+|event [^'"\n]+)['"],?$/gm)].map(match => match[1]);
    const client = new ethers.Interface(declarations);
    const actual = new ethers.Interface(compiled.contracts[`${contractFile || name}.sol`][name].abi);
    assert.ok(client.fragments.length, 'client ABI was parsed');
    for (const fragment of client.fragments) {
      if (fragment.type === 'function') {
        const deployed = actual.getFunction(fragment.selector);
        assert.ok(deployed, `${fragment.name} selector must exist onchain`);
        assert.deepEqual(fragment.outputs.map(output => output.format('sighash')), deployed.outputs.map(output => output.format('sighash')), `${fragment.name} return types`);
        assert.equal(fragment.stateMutability, deployed.stateMutability, `${fragment.name} transaction mutability`);
      } else if (fragment.type === 'event') {
        const deployed = actual.getEvent(fragment.topicHash);
        assert.ok(deployed, `${fragment.name} event signature`);
        assert.deepEqual(fragment.inputs.map(input => Boolean(input.indexed)), deployed.inputs.map(input => Boolean(input.indexed)), `${fragment.name} indexed fields`);
      }
    }
  });
}
