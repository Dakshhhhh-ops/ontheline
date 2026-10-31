/**
 * End-to-end smoke test for the deployed OnTheLine contract on Arc Testnet.
 *
 *   bun run smoke:testnet address   # create throwaway wallets, print the staker address to fund
 *   bun run smoke:testnet run       # run the three pledge flows with real transactions
 *
 * Wallets are throwaway TESTNET keys stored in .smoke-wallets.json (gitignored). The script
 * never prints a private key. The contract address and deploy block come from .env.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  erc20Abi,
  http,
  parseEventLogs,
  type Abi,
  type Address,
  type Hex,
} from 'viem'
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'
import { onTheLineAbi } from '../src/abi/onTheLine'
import { scanPledgeTxs } from '../src/lib/txLog'
import { buildTxExplorerUrl, getUsdc, requireChain } from '../src/onchain-facts'

const CHAIN_ID = 5042002
const WALLET_FILE = '.smoke-wallets.json'
const ROLES = ['staker', 'referee', 'recipient', 'settler'] as const
type Role = (typeof ROLES)[number]

const AMOUNT = 50_000n // 0.05 USDC per pledge
const GAS_TOPUP = 1_000_000n // 1 USDC of gas money for referee and settler

const fact = requireChain(CHAIN_ID)
const usdcFact = getUsdc(CHAIN_ID)
if (!usdcFact) throw new Error('USDC is not registered for Arc Testnet')
const USDC = usdcFact.address as Address
function requireAddress(name: string, value: string | undefined): Address {
  if (!value) throw new Error(`${name} is not set in .env`)
  return value as Address
}
const OTL = requireAddress('VITE_ONTHELINE_ADDRESS_TESTNET', process.env.VITE_ONTHELINE_ADDRESS_TESTNET)
const DEPLOY_BLOCK = BigInt(process.env.VITE_ONTHELINE_DEPLOY_BLOCK_TESTNET ?? '0')

const chain = defineChain({
  id: CHAIN_ID,
  name: fact.name,
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: fact.nativeCurrency.decimals },
  rpcUrls: { default: { http: fact.rpcUrls } },
})
const pub = createPublicClient({ chain, transport: http() })

function loadWallets(): Record<Role, PrivateKeyAccount> {
  let raw: Partial<Record<Role, Hex>> = {}
  if (existsSync(WALLET_FILE)) raw = JSON.parse(readFileSync(WALLET_FILE, 'utf8')) as Partial<Record<Role, Hex>>
  let changed = false
  for (const r of ROLES) {
    if (!raw[r]) {
      raw[r] = generatePrivateKey()
      changed = true
    }
  }
  if (changed) writeFileSync(WALLET_FILE, JSON.stringify(raw, null, 2), { mode: 0o600 })
  return Object.fromEntries(ROLES.map((r) => [r, privateKeyToAccount(raw[r] as Hex)])) as Record<Role, PrivateKeyAccount>
}

const usdcBalance = (who: Address) => pub.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [who] })
const fmt = (raw: bigint) => `${raw / 1_000_000n}.${(raw % 1_000_000n).toString().padStart(6, '0')}`

interface TxRecord {
  flow: string
  step: string
  by: Role
  hash: Hex
  explorer: string
}
const txs: TxRecord[] = []

async function send(
  flow: string,
  step: string,
  by: Role,
  account: PrivateKeyAccount,
  call: { address: Address; abi: Abi; functionName: string; args: readonly unknown[] },
) {
  const wallet = createWalletClient({ account, chain, transport: http() })
  const hash = await wallet.writeContract(call)
  const receipt = await pub.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`${flow}/${step} reverted: ${hash}`)
  txs.push({ flow, step, by, hash, explorer: buildTxExplorerUrl(CHAIN_ID, hash) })
  console.log(`  ${flow} ${step.padEnd(14)} ${hash}`)
  return receipt
}

const otlCall = (functionName: string, args: readonly unknown[]) => ({ address: OTL, abi: onTheLineAbi, functionName, args })

async function chainNow(): Promise<number> {
  return Number((await pub.getBlock()).timestamp)
}

async function waitUntilChainTime(ts: number) {
  while ((await chainNow()) <= ts) await new Promise((r) => setTimeout(r, 2000))
}

async function expectRevert(label: string, fn: () => Promise<unknown>, errorName: string) {
  try {
    await fn()
  } catch (e) {
    const text = String((e as { message?: string }).message ?? e)
    if (text.includes(errorName)) {
      console.log(`  check ok: ${label} reverts with ${errorName}`)
      return
    }
    throw new Error(`${label}: expected ${errorName}, got: ${text.slice(0, 300)}`)
  }
  throw new Error(`${label}: expected revert ${errorName} but call succeeded`)
}

async function create(flow: string, w: Record<Role, PrivateKeyAccount>, goal: string, deadline: number, review: number) {
  const receipt = await send(flow, 'create', 'staker', w.staker, otlCall('create', [goal, w.referee.address, w.recipient.address, AMOUNT, BigInt(deadline), BigInt(review)]))
  const [ev] = parseEventLogs({ abi: onTheLineAbi, logs: receipt.logs, eventName: 'PledgeCreated' })
  if (!ev) throw new Error('PledgeCreated not found')
  return ev.args.id
}

async function status(id: bigint) {
  const p = await pub.readContract({ address: OTL, abi: onTheLineAbi, functionName: 'getPledge', args: [id] })
  return Number(p.status)
}

function usdcTransfers(logs: Parameters<typeof parseEventLogs>[0]['logs']) {
  return parseEventLogs({ abi: erc20Abi, logs, eventName: 'Transfer' })
}

async function main() {
  const cmd = process.argv[2] ?? 'run'
  const w = loadWallets()

  if (cmd === 'address') {
    console.log(`staker (fund this with testnet USDC): ${w.staker.address}`)
    console.log(`staker USDC balance: ${fmt(await usdcBalance(w.staker.address))}`)
    return
  }

  const need = AMOUNT * 3n + GAS_TOPUP * 2n + 1_000_000n
  const stakerBal = await usdcBalance(w.staker.address)
  if (stakerBal < need) throw new Error(`Staker ${w.staker.address} holds ${fmt(stakerBal)} USDC, needs about ${fmt(need)}. Fund it first.`)

  const balancesOf = async () =>
    Object.fromEntries(
      await Promise.all([...ROLES.map(async (r) => [r, await usdcBalance(w[r].address)] as const), usdcBalance(OTL).then((b) => ['contract', b] as const)]),
    ) as Record<Role | 'contract', bigint>

  console.log(`Contract ${OTL} on ${fact.name}`)
  const before = await balancesOf()
  const statsBefore = await Promise.all(['totalLocked', 'totalKept', 'totalForfeited'].map((fn) => pub.readContract({ address: OTL, abi: onTheLineAbi, functionName: fn as 'totalLocked' })))

  console.log('Funding gas wallets')
  for (const r of ['referee', 'settler'] as const) {
    if ((await usdcBalance(w[r].address)) < GAS_TOPUP / 2n) {
      await send('setup', `fund ${r}`, 'staker', w.staker, { address: USDC, abi: erc20Abi, functionName: 'transfer', args: [w[r].address, GAS_TOPUP] })
    }
  }
  await send('setup', 'approve', 'staker', w.staker, { address: USDC, abi: erc20Abi, functionName: 'approve', args: [OTL, AMOUNT * 3n] })

  const ids: Record<string, bigint> = {}
  const result: Record<string, unknown> = {}

  // (a) create -> referee confirm: staker refunded
  console.log('Flow A: create -> confirm')
  ids.a = await create('A', w, 'Smoke A: ship the PR', (await chainNow()) + 300, 3600)
  const stakerBeforeA = await usdcBalance(w.staker.address)
  void stakerBeforeA
  const confirmReceipt = await send('A', 'confirm', 'referee', w.referee, otlCall('confirm', [ids.a]))
  const refund = usdcTransfers(confirmReceipt.logs).find((l) => l.args.to.toLowerCase() === w.staker.address.toLowerCase() && l.args.from.toLowerCase() === OTL.toLowerCase())
  if (!refund || refund.args.value !== AMOUNT) throw new Error('A: refund Transfer to staker not found or wrong amount')
  if ((await status(ids.a)) !== 1) throw new Error('A: status should be Kept')
  result.A = { id: ids.a.toString(), status: 'Kept', refundedToStaker: fmt(refund.args.value) }

  // (b) create -> referee fail: recipient paid
  console.log('Flow B: create -> fail')
  ids.b = await create('B', w, 'Smoke B: run 5km', (await chainNow()) + 300, 3600)
  const recipientBeforeB = await usdcBalance(w.recipient.address)
  await send('B', 'fail', 'referee', w.referee, otlCall('fail', [ids.b]))
  const recipientAfterB = await usdcBalance(w.recipient.address)
  if (recipientAfterB - recipientBeforeB !== AMOUNT) throw new Error('B: recipient did not receive exactly the pledged amount')
  if ((await status(ids.b)) !== 2) throw new Error('B: status should be Forfeited')
  result.B = { id: ids.b.toString(), status: 'Forfeited', paidToRecipient: fmt(recipientAfterB - recipientBeforeB) }

  // (c) short deadline + review window -> settleExpired by a third party
  console.log('Flow C: create -> wait -> settleExpired by a third party')
  const t0 = await chainNow()
  const deadlineC = t0 + 40
  const reviewC = 20
  ids.c = await create('C', w, 'Smoke C: forfeit by silence', deadlineC, reviewC)
  await expectRevert('settleExpired before reviewEnd', () => pub.simulateContract({ ...otlCall('settleExpired', [ids.c]), account: w.settler.address } as never), 'NotExpired')
  console.log(`  waiting for chain time to pass ${deadlineC + reviewC}`)
  await waitUntilChainTime(deadlineC + reviewC)
  await expectRevert('confirm after reviewEnd', () => pub.simulateContract({ ...otlCall('confirm', [ids.c]), account: w.referee.address } as never), 'ReviewEnded')
  const recipientBeforeC = await usdcBalance(w.recipient.address)
  await send('C', 'settleExpired', 'settler', w.settler, otlCall('settleExpired', [ids.c]))
  const recipientAfterC = await usdcBalance(w.recipient.address)
  if (recipientAfterC - recipientBeforeC !== AMOUNT) throw new Error('C: recipient did not receive exactly the pledged amount')
  if ((await status(ids.c)) !== 2) throw new Error('C: status should be Forfeited')
  await expectRevert('second settleExpired', () => pub.simulateContract({ ...otlCall('settleExpired', [ids.c]), account: w.settler.address } as never), 'PledgeNotActive')
  result.C = { id: ids.c.toString(), status: 'Forfeited (expired)', paidToRecipient: fmt(recipientAfterC - recipientBeforeC) }

  // The same event scan the pledge page uses must find these transactions.
  console.log('Frontend event scan check')
  for (const [flow, id] of Object.entries(ids)) {
    const found = await scanPledgeTxs(pub, OTL, id, DEPLOY_BLOCK, () => undefined)
    const mine = txs.filter((t) => t.flow === flow.toUpperCase() && t.step !== 'approve').map((t) => t.hash)
    const missing = mine.filter((h) => !found.some((f) => f.hash === h))
    if (missing.length > 0) throw new Error(`scan for pledge ${id} missed ${missing.join(', ')}`)
    console.log(`  pledge ${id}: scan found ${found.map((f) => f.kind).join(', ')}`)
  }

  const after = await balancesOf()
  const statsAfter = await Promise.all(['totalLocked', 'totalKept', 'totalForfeited'].map((fn) => pub.readContract({ address: OTL, abi: onTheLineAbi, functionName: fn as 'totalLocked' })))
  if (after.contract !== statsAfter[0]) throw new Error('contract balance does not equal totalLocked')

  const report = {
    chain: fact.name,
    contract: OTL,
    wallets: Object.fromEntries(ROLES.map((r) => [r, w[r].address])),
    pledgeIds: Object.fromEntries(Object.entries(ids).map(([k, v]) => [k, v.toString()])),
    results: result,
    transactions: txs,
    balancesBefore: Object.fromEntries(Object.entries(before).map(([k, v]) => [k, fmt(v)])),
    balancesAfter: Object.fromEntries(Object.entries(after).map(([k, v]) => [k, fmt(v)])),
    statsBefore: statsBefore.map(fmt),
    statsAfter: statsAfter.map(fmt),
    note: 'Gas on Arc is paid in USDC, so wallet balances include gas spent. The recipient pays no gas, so its delta is exact.',
  }
  mkdirSync('docs', { recursive: true })
  writeFileSync('docs/smoke-testnet.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
