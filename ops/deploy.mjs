// Compile contracts/OnTheLine.sol (pulled from Arc Studio) with solc-js and deploy to Arc mainnet.
// Usage: node deploy.mjs <appDir>
import solc from 'solc';
import fs from 'fs';
import path from 'path';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import 'dotenv/config';
import { arc } from './chain.mjs';

const appDir = process.argv[2] ?? '../app';
const USDC = '0x3600000000000000000000000000000000000000';

const srcPath = path.join(appDir, 'contracts', 'OnTheLine.sol');
const roots = [appDir, path.join(appDir, 'lib'), path.join(appDir, 'node_modules'), 'node_modules',
  path.join(appDir, 'lib', 'openzeppelin-contracts')];
function findImports(p) {
  const candidates = [p, p.replace(/^@openzeppelin\/contracts\//, 'openzeppelin-contracts/contracts/')];
  for (const r of roots) for (const c of candidates) {
    const f = path.join(r, c);
    if (fs.existsSync(f)) return { contents: fs.readFileSync(f, 'utf8') };
  }
  return { error: 'not found: ' + p };
}
const input = {
  language: 'Solidity',
  sources: { 'contracts/OnTheLine.sol': { content: fs.readFileSync(srcPath, 'utf8') } },
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
};
const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
const errs = (out.errors ?? []).filter(e => e.severity === 'error');
if (errs.length) { console.error(errs.map(e => e.formattedMessage).join('\n')); process.exit(1); }
const c = out.contracts['contracts/OnTheLine.sol'].OnTheLine;
fs.writeFileSync('OnTheLine.abi.json', JSON.stringify(c.abi, null, 2));
fs.writeFileSync('solc-input.json', JSON.stringify(input));
console.log('compiled, solc', solc.version(), 'bytecode bytes', c.evm.bytecode.object.length / 2);
if (process.argv.includes('--dry')) process.exit(0);

const account = privateKeyToAccount(process.env.DEPLOYER_PK);
const pub = createPublicClient({ chain: arc, transport: http() });
const wal = createWalletClient({ chain: arc, account, transport: http() });
const hash = await wal.deployContract({ abi: c.abi, bytecode: '0x' + c.evm.bytecode.object, args: [USDC] });
console.log('deploy tx', hash);
const r = await pub.waitForTransactionReceipt({ hash });
console.log('OnTheLine deployed at', r.contractAddress, 'status', r.status);
fs.writeFileSync('deployment.mainnet.json', JSON.stringify({ address: r.contractAddress, deployTx: hash, block: r.blockNumber.toString(), chainId: 5042 }, null, 2));
