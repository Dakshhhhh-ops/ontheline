import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useChainState } from '@/context/ChainContext'
import { useOtlClient } from '@/hooks/otl'
import { STATUS_ACTIVE } from '@/lib/pledge'
import {
  mergeTxs,
  readHints,
  readScanCache,
  scanPledgeTxs,
  writeScanCache,
  type PledgeTx,
  type ScanProgress,
} from '@/lib/txLog'

/** Every transaction for one pledge: local hints merged with an onchain event scan. */
export function usePledgeTxs(id: bigint | undefined, status: number | undefined) {
  const { chainId, address, deployment } = useChainState()
  const client = useOtlClient()
  const [progress, setProgress] = useState<ScanProgress | null>(null)

  const resolved = status !== undefined && status !== STATUS_ACTIVE

  const scan = useQuery({
    queryKey: ['otl', chainId, 'txs', id?.toString(), status],
    enabled: !!client && !!address && id !== undefined && status !== undefined,
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<PledgeTx[]> => {
      if (!client || !address || id === undefined) throw new Error('not ready')
      const cached = resolved ? readScanCache(chainId, id) : null
      if (cached?.some((t) => t.kind === 'created') && cached.length >= 2) return cached
      const txs = await scanPledgeTxs(client, address, id, deployment.startBlock, setProgress)
      if (resolved && txs.some((t) => t.kind === 'created') && txs.length >= 2) writeScanCache(chainId, id, txs)
      return txs
    },
  })

  // Hints are re-read whenever the pledge status changes: a tx we just sent is remembered before the scan sees it.
  const txs = useMemo(() => {
    void status
    const hints = id === undefined ? [] : readHints(chainId, id)
    return mergeTxs(hints, scan.data ?? [])
  }, [scan.data, chainId, id, status])

  return { txs, scanning: scan.isFetching, error: scan.error, progress }
}
