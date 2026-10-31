import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { clsx } from 'clsx'
import { useChainState } from '@/context/ChainContext'
import { useNow } from '@/hooks/otl'
import { buildAddressExplorerUrl, buildTxExplorerUrl } from '@/onchain-facts'
import { fmtDuration, fmtDateTime, shortAddr, shortHash } from '@/lib/format'
import { phaseOf, type PledgeData } from '@/lib/pledge'
import { StatusBadge, Usdc } from '@/components/ui'

export function AddressChip({ addr, you }: { addr: string; you?: boolean }) {
  const { chainId } = useChainState()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(addr)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable
    }
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <a
        href={buildAddressExplorerUrl(chainId, addr)}
        target="_blank"
        rel="noopener noreferrer"
        className="mono text-sm text-ink underline-offset-4 hover:underline"
        title={addr}
      >
        {shortAddr(addr)}
      </a>
      {you && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase text-accent-ink">you</span>}
      <button onClick={() => { void copy() }} aria-label="Copy address" className="flex h-7 w-7 items-center justify-center rounded-lg text-subtle hover:bg-surface2 hover:text-ink">
        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </span>
  )
}

export function TxLink({ hash, label }: { hash: string; label?: string }) {
  const { chainId } = useChainState()
  return (
    <a
      href={buildTxExplorerUrl(chainId, hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="mono inline-flex items-center gap-1.5 text-sm text-ink underline-offset-4 hover:underline"
    >
      {label ?? shortHash(hash)}
      <ExternalLink className="h-3.5 w-3.5 text-subtle" aria-hidden />
    </a>
  )
}

/** Live countdown to a unix-seconds target. */
export function Countdown({ target, className }: { target: number; className?: string }) {
  const now = useNow()
  const left = target - now
  return (
    <span className={clsx('tabular-nums', className)}>{left > 0 ? fmtDuration(left) : 'Passed'}</span>
  )
}

function phaseLine(p: PledgeData, now: number): string {
  const phase = phaseOf(p, now)
  if (phase === 'running') return `Deadline in ${fmtDuration(p.deadline - now)}`
  if (phase === 'review') return `Review closes in ${fmtDuration(p.reviewEnd - now)}`
  if (phase === 'expired') return `Review closed ${fmtDateTime(p.reviewEnd)}`
  if (phase === 'kept') return 'Refunded to staker'
  return 'Paid to forfeit recipient'
}

export function PledgeCard({ p }: { p: PledgeData }) {
  const now = useNow()
  const { deployment } = useChainState()
  const phase = phaseOf(p, now)
  return (
    <Link
      to={`/p/${p.id}?net=${deployment.net}`}
      className="group block rounded-3xl border border-line bg-surface p-5 transition hover:border-accent/60 hover:bg-surface2"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="mono text-xs text-subtle">#{p.id.toString()}</span>
        <StatusBadge phase={phase} />
      </div>
      <p className="mt-3 line-clamp-2 text-lg font-semibold leading-snug text-pretty">{p.goal}</p>
      <div className="mt-4 flex items-end justify-between gap-3">
        <Usdc raw={p.amount} className="text-3xl font-bold" />
        <span className="text-right text-xs text-muted">{phaseLine(p, now)}</span>
      </div>
    </Link>
  )
}
