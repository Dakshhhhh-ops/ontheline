import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import type { Address, PublicClient } from 'viem'
import { onTheLineAbi } from '@/abi/onTheLine'
import { useChainState } from '@/context/ChainContext'
import type { PledgeData } from '@/lib/pledge'

export type AccountKind = 'staker' | 'referee' | 'recipient'

const COUNT_FN = {
  staker: 'stakerPledgeCount',
  referee: 'refereePledgeCount',
  recipient: 'recipientPledgeCount',
} as const

const PAGE_FN = {
  staker: 'pledgesByStakerPage',
  referee: 'pledgesByRefereePage',
  recipient: 'pledgesByRecipientPage',
} as const

/** Public client pinned to the chain the app is browsing. */
export function useOtlClient(): PublicClient | undefined {
  const { chainId } = useChainState()
  return usePublicClient({ chainId })
}

/** Seconds since epoch, ticking. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

async function fetchPledge(client: PublicClient, address: Address, id: bigint): Promise<PledgeData> {
  const p = await client.readContract({ address, abi: onTheLineAbi, functionName: 'getPledge', args: [id] })
  return {
    id,
    staker: p.staker,
    referee: p.referee,
    forfeitTo: p.forfeitTo,
    amount: p.amount,
    deadline: Number(p.deadline),
    reviewEnd: Number(p.reviewEnd),
    status: Number(p.status),
    goal: p.goal,
  }
}

export function useStats() {
  const { chainId, address } = useChainState()
  const client = useOtlClient()
  return useQuery({
    queryKey: ['otl', chainId, 'stats'],
    enabled: !!client && !!address,
    refetchInterval: 8000,
    queryFn: async () => {
      if (!client || !address) throw new Error('not ready')
      const read = <F extends 'totalLocked' | 'totalKept' | 'totalForfeited' | 'pledgeCount'>(functionName: F) =>
        client.readContract({ address, abi: onTheLineAbi, functionName })
      const [locked, kept, forfeited, count] = await Promise.all([
        read('totalLocked'),
        read('totalKept'),
        read('totalForfeited'),
        read('pledgeCount'),
      ])
      return { locked, kept, forfeited, count }
    },
  })
}

export function useRecentPledges(limit = 8) {
  const { chainId, address } = useChainState()
  const client = useOtlClient()
  return useQuery({
    queryKey: ['otl', chainId, 'recent', limit],
    enabled: !!client && !!address,
    refetchInterval: 10000,
    queryFn: async () => {
      if (!client || !address) throw new Error('not ready')
      const count = await client.readContract({ address, abi: onTheLineAbi, functionName: 'pledgeCount' })
      const n = Number(count < BigInt(limit) ? count : BigInt(limit))
      const ids = Array.from({ length: n }, (_, i) => count - 1n - BigInt(i))
      return Promise.all(ids.map((id) => fetchPledge(client, address, id)))
    },
  })
}

export function usePledge(id: bigint | undefined) {
  const { chainId, address } = useChainState()
  const client = useOtlClient()
  return useQuery({
    queryKey: ['otl', chainId, 'pledge', id?.toString()],
    enabled: !!client && !!address && id !== undefined,
    refetchInterval: 6000,
    retry: 1,
    queryFn: () => {
      if (!client || !address || id === undefined) throw new Error('not ready')
      return fetchPledge(client, address, id)
    },
  })
}

/** Newest-first pledges for an account, reading only the latest `limit` ids. */
export function useAccountPledges(kind: AccountKind, who: Address | undefined, limit = 50) {
  const { chainId, address } = useChainState()
  const client = useOtlClient()
  return useQuery({
    queryKey: ['otl', chainId, 'account', kind, who],
    enabled: !!client && !!address && !!who,
    refetchInterval: 10000,
    queryFn: async () => {
      if (!client || !address || !who) throw new Error('not ready')
      const total = await client.readContract({ address, abi: onTheLineAbi, functionName: COUNT_FN[kind], args: [who] })
      const lim = BigInt(limit)
      const offset = total > lim ? total - lim : 0n
      const ids = await client.readContract({
        address,
        abi: onTheLineAbi,
        functionName: PAGE_FN[kind],
        args: [who, offset, lim],
      })
      const pledges = await Promise.all([...ids].reverse().map((id) => fetchPledge(client, address, id)))
      return { total, pledges }
    },
  })
}
