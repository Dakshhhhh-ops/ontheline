import { decodeEventLog, getAbiItem, pad, toEventSelector, toHex, type Address, type Hex, type PublicClient } from 'viem'
import { onTheLineAbi } from '@/abi/onTheLine'

export type TxKind = 'created' | 'kept' | 'forfeited' | 'settled'

export interface PledgeTx {
  kind: TxKind
  hash: Hex
  blockNumber?: bigint
}

/** Window size per eth_getLogs call. Measured on Arc: 5,000 blocks succeeded, 10,000 was rejected. */
const WINDOW = 4000n
const CONCURRENCY = 6
/** Lookback used only when no deploy block is configured. */
const MAX_LOOKBACK = 50_000n

const TOPICS = (['PledgeCreated', 'PledgeKept', 'PledgeForfeited'] as const).map((name) =>
  toEventSelector(getAbiItem({ abi: onTheLineAbi, name })),
)

export interface ScanProgress {
  head: bigint
  start: bigint
  /** Lowest block scanned so far. */
  scannedFrom: bigint
}

interface RawLog {
  topics: Hex[]
  data: Hex
  transactionHash: Hex | null
  blockNumber: Hex | null
}

function kindOf(raw: RawLog): TxKind | null {
  try {
    const ev = decodeEventLog({ abi: onTheLineAbi, data: raw.data, topics: raw.topics as [Hex, ...Hex[]] })
    if (ev.eventName === 'PledgeCreated') return 'created'
    if (ev.eventName === 'PledgeKept') return 'kept'
    if (ev.eventName === 'PledgeForfeited') return ev.args.expired ? 'settled' : 'forfeited'
  } catch {
    return null
  }
  return null
}

/**
 * Finds every event for one pledge id. Scans backwards from the chain head toward the
 * deployment block (never from block 0) and stops once the PledgeCreated event is found,
 * since it is always the first event for an id.
 */
export async function scanPledgeTxs(
  client: PublicClient,
  address: Address,
  id: bigint,
  startBlock: bigint,
  onProgress: (p: ScanProgress) => void,
): Promise<PledgeTx[]> {
  const head = await client.getBlockNumber()
  // Without a known deploy block, look back a bounded distance instead of crawling from genesis.
  const floor = startBlock > 0n ? startBlock : head > MAX_LOOKBACK ? head - MAX_LOOKBACK : 0n
  const idTopic = pad(toHex(id), { size: 32 })
  const found: PledgeTx[] = []
  let to = head
  let createdSeen = false

  while (to >= floor && !createdSeen) {
    const windows: Array<[bigint, bigint]> = []
    for (let i = 0; i < CONCURRENCY && to >= floor; i++) {
      const from = to - WINDOW + 1n > floor ? to - WINDOW + 1n : floor
      windows.push([from, to])
      to = from - 1n
    }
    const results = await Promise.all(
      windows.map(([from, end]) =>
        client.request({
          method: 'eth_getLogs',
          params: [{ address, fromBlock: toHex(from), toBlock: toHex(end), topics: [TOPICS, idTopic] }],
        }),
      ),
    )
    for (const logs of results) {
      for (const log of logs) {
        const kind = kindOf(log)
        if (!kind || !log.transactionHash) continue
        if (kind === 'created') createdSeen = true
        found.push({ kind, hash: log.transactionHash, blockNumber: log.blockNumber ? BigInt(log.blockNumber) : undefined })
      }
    }
    const lowest = windows[windows.length - 1][0]
    onProgress({ head, start: floor, scannedFrom: lowest })
  }
  return found
}

// --- Local hints: transactions sent from this browser are remembered instantly. ---

const hintKey = (chainId: number, id: bigint) => `otl:tx:${chainId}:${id}`

export function readHints(chainId: number, id: bigint): PledgeTx[] {
  try {
    const raw = localStorage.getItem(hintKey(chainId, id))
    return raw ? (JSON.parse(raw) as PledgeTx[]).map((t) => ({ ...t, blockNumber: undefined })) : []
  } catch {
    return []
  }
}

export function rememberTx(chainId: number, id: bigint, tx: PledgeTx): void {
  try {
    const all = readHints(chainId, id)
    if (all.some((t) => t.hash === tx.hash)) return
    all.push({ kind: tx.kind, hash: tx.hash })
    localStorage.setItem(hintKey(chainId, id), JSON.stringify(all))
  } catch {
    // Storage can be unavailable inside an embedded preview; the onchain scan still works.
  }
}

const cacheKey = (chainId: number, id: bigint) => `otl:txscan:${chainId}:${id}`

export function readScanCache(chainId: number, id: bigint): PledgeTx[] | null {
  try {
    const raw = localStorage.getItem(cacheKey(chainId, id))
    if (!raw) return null
    return (JSON.parse(raw) as Array<{ kind: TxKind; hash: Hex; blockNumber?: string }>).map((t) => ({
      kind: t.kind,
      hash: t.hash,
      blockNumber: t.blockNumber ? BigInt(t.blockNumber) : undefined,
    }))
  } catch {
    return null
  }
}

export function writeScanCache(chainId: number, id: bigint, txs: PledgeTx[]): void {
  try {
    localStorage.setItem(
      cacheKey(chainId, id),
      JSON.stringify(txs.map((t) => ({ kind: t.kind, hash: t.hash, blockNumber: t.blockNumber?.toString() }))),
    )
  } catch {
    // ignore
  }
}

export function mergeTxs(...lists: PledgeTx[][]): PledgeTx[] {
  const byHash = new Map<string, PledgeTx>()
  for (const list of lists) {
    for (const t of list) {
      const prev = byHash.get(t.hash)
      byHash.set(t.hash, prev ? { ...prev, ...t, blockNumber: t.blockNumber ?? prev.blockNumber } : t)
    }
  }
  const order: Record<TxKind, number> = { created: 0, kept: 1, forfeited: 1, settled: 1 }
  return [...byHash.values()].sort((a, b) => order[a.kind] - order[b.kind])
}
