import fs from 'fs';
import path from 'path';
import solc from 'solc';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const contractsDir = path.resolve(projectRoot, 'src', 'contracts');
const abiDir = path.resolve(contractsDir, 'abi');

if (!fs.existsSync(abiDir)) {
  fs.mkdirSync(abiDir);
}

function findImports(importPath) {
    const localPath = path.resolve(path.dirname(currentFilePath), importPath);
    if (fs.existsSync(localPath)) {
        return { contents: fs.readFileSync(localPath, 'utf8') };
    }

    const nodeModulesPath = path.resolve(projectRoot, 'node_modules', importPath);
    if (fs.existsSync(nodeModulesPath)) {
        return { contents: fs.readFileSync(nodeModulesPath, 'utf8') };
    }

    return { error: `File not found: ${importPath}` };
}

let currentFilePath = '';

function compileContract(fileName) {
  currentFilePath = path.resolve(contractsDir, fileName);
  const source = fs.readFileSync(currentFilePath, 'utf8');

  const input = {
    language: 'Solidity',
    sources: {
      [fileName]: {
        content: source,
      },
    },
    settings: {
      outputSelection: {
        '*': {
          '*': ['abi'],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

  if (output.errors) {
    let hasError = false;
    for (const error of output.errors) {
      if (error.severity === 'error') {
        console.error(error.formattedMessage);
        hasError = true;
      } else {
        console.warn(error.formattedMessage);
      }
    }
    if (hasError) {
        process.exit(1);
    }
  }

  const contractNames = Object.keys(output.contracts[fileName]);
  for (const contractName of contractNames) {
    const abi = output.contracts[fileName][contractName].abi;
    if (!abi || abi.length === 0) continue; // skip empty interfaces

    const abiFileName = `${contractName}.abi.js`;
    const abiPath = path.resolve(abiDir, abiFileName);
    const abiContent = `export const ${contractName}ABI = ${JSON.stringify(abi, null, 2)};`;

    fs.writeFileSync(abiPath, abiContent);
    console.log(`ABI for ${contractName} written to ${abiPath}`);
  }
}

const defaultContracts = [
  'BonzaiSmartAgents.sol', 'BonzaiAgentTokenFactory.sol', 'BonzaiNvdaSwap.sol',
  'BonzaiSkillRegistry.sol', 'BonzaiSkillOwnership.sol', 'BonzaiCompanions.sol',
  'BonzaiCollectibles.sol', 'BonzaiCollectiblesFactory.sol', 'BonzaiProviderRegistry.sol', 'BonzaiUnlock.sol',
  'CompanionToken.sol', 'CompanionTokenFactory.sol', 'BonzaiMintPool.sol',
  'BonzaiRoyaltySplitter.sol', 'BonzaiUniswapHook.sol', 'FineTuneTokenFactory.sol',
  'BonzaiJobEscrow.sol', 'BonzaiBasketRewards.sol', 'BonzaiStakingVault.sol', 'BonzaiRevenueRouter.sol',
];
// Optional source names allow deterministic scoped regeneration during parallel work.
const requestedContracts = process.argv.slice(2);
for (const fileName of requestedContracts.length ? requestedContracts : defaultContracts) {
  if (!/^[A-Za-z0-9_.-]+\.sol$/.test(fileName)) throw new Error(`Invalid contract source: ${fileName}`);
  compileContract(fileName);
}
