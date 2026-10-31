import { Loader2 } from 'lucide-react'
import { usePledgeTxs } from '@/hooks/usePledgeTxs'
import type { TxKind } from '@/lib/txLog'
import { Card, Label, Notice } from '@/components/ui'
import { TxLink } from '@/components/Parts'

const LABEL: Record<TxKind, string> = {
  created: 'Pledge created',
  kept: 'Confirmed by referee, refunded',
  forfeited: 'Failed by referee, forfeited',
  settled: 'Settled after review window, forfeited',
}

export function TxHistory({ id, status }: { id: bigint; status: number | undefined }) {
  const { txs, scanning, error, progress } = usePledgeTxs(id, status)
  const total = progress ? Number(progress.head - progress.start) : 0
  const done = progress ? Number(progress.head - progress.scannedFrom) : 0
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Transactions</Label>
        {scanning && (
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Scanning chain{pct > 0 ? ` · ${pct}%` : ''}
          </span>
        )}
      </div>
      {txs.length === 0 && !scanning && !error && <p className="text-sm text-muted">No transactions found yet.</p>}
      <ul className="divide-y divide-line">
        {txs.map((t) => (
          <li key={t.hash} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <span className="text-sm font-medium">{LABEL[t.kind]}</span>
            <TxLink hash={t.hash} />
          </li>
        ))}
      </ul>
      {error && <Notice tone="warn">Could not finish scanning the chain for older events. Transactions sent from this browser are still listed.</Notice>}
    </Card>
  )
}
