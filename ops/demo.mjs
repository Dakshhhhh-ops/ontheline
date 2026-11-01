// Runs three real pledges on Arc mainnet against the deployed OnTheLine contract:
//  A) create -> referee confirms (staker refunded)
//  B) create -> referee fails   (forfeit recipient paid)
//  C) create (short deadline)    -> anyone settles after review window (recipient paid)
// Usage: node demo.mjs [amountUSDC=0.5]
import fs from 'fs';
import { createPublicClient, createWalletClient, http, parseUnits, parseEther, formatUnits, erc20Abi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import 'dotenv/config';
import { arc } from './chain.mjs';

const USDC = '0x3600000000000000000000000000000000000000';
const { address: OTL } = JSON.parse(fs.readFileSync('deployment.mainnet.json', 'utf8'));
const abi = JSON.parse(fs.readFileSync('OnTheLine.abi.json', 'utf8'));
const amount = parseUnits(process.argv[2] ?? '0.25', 6);

const pub = createPublicClient({ chain: arc, transport: http() });
const acct = k => privateKeyToAccount(process.env[k + '_PK']);
const staker = acct('DEPLOYER'), referee = acct('REFEREE'), recipient = acct('RECIPIENT');
const w = a => createWalletClient({ chain: arc, account: a, transport: http() });
const log = [];
const ex = h => `https://explorer.arc.io/tx/${h}`;

async function send(label, wallet, req) {
  const hash = await wallet.writeContract(req);
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') throw new Error(label + ' reverted ' + hash);
  console.log(label.padEnd(34), hash);
  log.push({ step: label, hash, url: ex(hash), block: r.blockNumber.toString() });
  return r;
}
const bal = a => pub.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [a] });
async function balances(tag) {
  const b = { staker: formatUnits(await bal(staker.address), 6), referee: formatUnits(await bal(referee.address), 6),
    recipient: formatUnits(await bal(recipient.address), 6), contract: formatUnits(await bal(OTL), 6) };
  console.log(tag, b); return b;
}

// Gas for the referee: native USDC transfer (18-decimal native units) from the staker
const refBal = await bal(referee.address);
if (refBal < 50000n) {
  const hash = await w(staker).sendTransaction({ to: referee.address, value: parseEther('0.02') });
  await pub.waitForTransactionReceipt({ hash });
  console.log('funded referee gas'.padEnd(34), hash);
  log.push({ step: 'fund referee gas (0.02 USDC)', hash, url: ex(hash) });
}
const before = await balances('before');

await send('approve USDC', w(staker), { address: USDC, abi: erc20Abi, functionName: 'approve', args: [OTL, amount * 3n] });
const now = () => BigInt(Math.floor(Date.now() / 1000));
const idOf = async () => (await pub.readContract({ address: OTL, abi, functionName: 'pledgeCount' })) - 1n;

// A
await send('A create "Ship OnTheLine to mainnet"', w(staker), { address: OTL, abi, functionName: 'create',
  args: ['Ship OnTheLine to Arc mainnet before the microgrant deadline', referee.address, recipient.address, amount, now() + 86400n, 86400n] });
const idA = await idOf();
await send(`A confirm #${idA} (staker refunded)`, w(referee), { address: OTL, abi, functionName: 'confirm', args: [idA] });

// B
await send('B create "Run 5km before breakfast"', w(staker), { address: OTL, abi, functionName: 'create',
  args: ['Run 5km before breakfast tomorrow', referee.address, recipient.address, amount, now() + 86400n, 86400n] });
const idB = await idOf();
await send(`B fail #${idB} (recipient paid)`, w(referee), { address: OTL, abi, functionName: 'fail', args: [idB] });

// C
await send('C create "Reply to all emails in 30s"', w(staker), { address: OTL, abi, functionName: 'create',
  args: ['Reply to every email in the next 30 seconds', referee.address, recipient.address, amount, now() + 20n, 10n] });
const idC = await idOf();
const { reviewEnd } = await pub.readContract({ address: OTL, abi, functionName: 'getPledge', args: [idC] });
while (BigInt((await pub.getBlock()).timestamp) <= reviewEnd) await new Promise(r => setTimeout(r, 3000));
await send(`C settleExpired #${idC} (by anyone)`, w(staker), { address: OTL, abi, functionName: 'settleExpired', args: [idC] });

const after = await balances('after');
const stats = {};
for (const f of ['totalLocked', 'totalKept', 'totalForfeited', 'pledgeCount'])
  stats[f] = (await pub.readContract({ address: OTL, abi, functionName: f })).toString();
console.log(stats);
fs.writeFileSync('mainnet-proof.json', JSON.stringify({ contract: OTL, pledges: { A: idA.toString(), B: idB.toString(), C: idC.toString() }, txs: log, before, after, stats }, null, 2));
