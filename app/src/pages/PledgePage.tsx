import { useEffect, useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { Check, Gavel, X } from 'lucide-react'
import { clsx } from 'clsx'
import { useChainState } from '@/context/ChainContext'
import { ARC_MAINNET_ID, ARC_TESTNET_ID } from '@/config'
import { useNow, usePledge } from '@/hooks/otl'
import { useResolve } from '@/hooks/useResolve'
import { fmtDateTime } from '@/lib/format'
import { phaseOf, sameAddress, STATUS_ACTIVE, type PledgeData, type Phase } from '@/lib/pledge'
import { Button, Card, Label, Notice, Skeleton, StatusBadge, Usdc } from '@/components/ui'
import { AddressChip, Countdown } from '@/components/Parts'
import { WalletGate, NotDeployed } from '@/components/WalletGate'
import { TxHistory } from '@/components/TxHistory'

const STAGES: Array<{ key: string; label: string; phases: Phase[] }> = [
  { key: 'running', label: 'Deadline', phases: ['running'] },
  { key: 'review', label: 'Review', phases: ['review'] },
  { key: 'done', label: 'Settled', phases: ['expired', 'kept', 'forfeited'] },
]

function Timeline({ p, phase }: { p: PledgeData; phase: Phase }) {
  const activeIdx = STAGES.findIndex((s) => s.phases.includes(phase))
  const resolved = phase === 'kept' || phase === 'forfeited'
  return (
    <Card className="space-y-5">
      <div className="grid grid-cols-3 gap-2" aria-label="Pledge stages">
        {STAGES.map((s, i) => (
          <div key={s.key} className="space-y-2">
            <div className={clsx('h-1.5 rounded-full', i < activeIdx || (resolved && i === 2) ? (phase === 'kept' ? 'bg-success' : phase === 'forfeited' ? 'bg-danger' : 'bg-accent') : i === activeIdx ? 'bg-accent' : 'bg-surface2')} />
            <div className={clsx('text-xs font-semibold uppercase tracking-[0.08em]', i === activeIdx ? 'text-ink' : 'text-subtle')}>{s.label}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Deadline</Label>
          <div className="display mt-1 text-3xl font-bold">
            {phase === 'running' ? <Countdown target={p.deadline} /> : <span className="text-muted">Passed</span>}
          </div>
          <div className="text-sm text-muted">{fmtDateTime(p.deadline)}</div>
        </div>
        <div>
          <Label>Review window closes</Label>
          <div className="display mt-1 text-3xl font-bold">
            {phase === 'running' || phase === 'review' ? <Countdown target={p.reviewEnd} className={phase === 'review' ? 'text-accent' : ''} /> : <span className="text-muted">Closed</span>}
          </div>
          <div className="text-sm text-muted">{fmtDateTime(p.reviewEnd)}</div>
        </div>
      </div>
    </Card>
  )
}

function Actions({ p, phase, id }: { p: PledgeData; phase: Phase; id: bigint }) {
  const { address: account } = useAccount()
  const { state, send, busy } = useResolve(id)
  const isReferee = sameAddress(account, p.referee)
  const reviewOpen = phase === 'running' || phase === 'review'

  if (p.status !== STATUS_ACTIVE) {
    return (
      <Notice tone="info">
        {phase === 'kept'
          ? 'The referee confirmed it. The staker got the USDC back.'
          : 'This pledge was forfeited and the USDC was paid to the recipient.'}
      </Notice>
    )
  }

  const status = state.phase === 'wallet' ? 'Confirm in your wallet…' : state.phase === 'confirming' ? 'Confirming onchain…' : null

  return (
    <div className="space-y-3">
      {isReferee && (
        <Card className="space-y-4 border-accent/50">
          <div>
            <h2 className="display text-2xl font-bold">You're the referee.</h2>
            <p className="text-sm text-muted">
              {reviewOpen ? 'Call it. You can fail it early, or confirm any time before the review window closes.' : 'The review window is over, so it can only be settled as forfeited.'}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <WalletGate>
              <Button big variant="success" disabled={!reviewOpen || busy} loading={busy && state.action === 'confirm'} onClick={() => { void send('confirm') }}>
                <Check className="h-6 w-6" aria-hidden /> They did it
              </Button>
              <Button big variant="danger" disabled={busy} loading={busy && state.action === 'fail'} onClick={() => { void send('fail') }}>
                <X className="h-6 w-6" aria-hidden /> They didn't
              </Button>
            </WalletGate>
          </div>
        </Card>
      )}

      {phase === 'expired' && (
        <Card className="space-y-3">
          <p className="text-sm text-muted">The review window closed with no answer. Silence means forfeit: anyone can settle it.</p>
          <WalletGate>
            <Button big full variant="danger" loading={busy && state.action === 'settleExpired'} disabled={busy} onClick={() => { void send('settleExpired') }}>
              <Gavel className="h-5 w-5" aria-hidden /> Settle
            </Button>
          </WalletGate>
        </Card>
      )}

      {!isReferee && phase !== 'expired' && (
        <Notice tone="info">
          Waiting on the referee, <AddressChip addr={p.referee} />, to call it.
        </Notice>
      )}

      {status && <Notice tone="info">{status}</Notice>}
      {state.phase === 'error' && state.error && <Notice tone="error">{state.error}</Notice>}
    </div>
  )
}

export default function PledgePage() {
  const { id: idParam } = useParams()
  const [search] = useSearchParams()
  const { setChainId, address, deployment } = useChainState()
  const { address: account } = useAccount()
  const now = useNow()

  const id = useMemo(() => {
    try {
      return idParam && /^\d+$/.test(idParam) ? BigInt(idParam) : undefined
    } catch {
      return undefined
    }
  }, [idParam])

  // Links to mainnet pledges carry ?net=mainnet so they open on the right chain.
  const net = search.get('net')
  useEffect(() => {
    if (net === 'mainnet') setChainId(ARC_MAINNET_ID)
    else if (net === 'testnet') setChainId(ARC_TESTNET_ID)
  }, [net, setChainId])

  const pledge = usePledge(id)

  if (!address) return <NotDeployed />
  if (id === undefined) return <Notice tone="error">That is not a valid pledge id.</Notice>

  if (pledge.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="h-40" />
      </div>
    )
  }

  if (pledge.isError || !pledge.data) {
    return (
      <div className="space-y-4">
        <Notice tone="error">
          Pledge #{id.toString()} was not found on {deployment.label}. If it was made on the other network, switch with the toggle at the top.
        </Notice>
        <Link to="/" className="font-semibold text-accent underline-offset-4 hover:underline">Back home</Link>
      </div>
    )
  }

  const p = pledge.data
  const phase = phaseOf(p, now)

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <span className="mono text-sm text-subtle">Pledge #{p.id.toString()} · {deployment.label}</span>
        <StatusBadge phase={phase} />
      </div>
      <h1 className="display text-balance text-4xl font-bold leading-tight sm:text-5xl">{p.goal}</h1>
      <div className={clsx(phase === 'kept' ? 'text-success' : phase === 'forfeited' ? 'text-danger' : 'text-accent')}>
        <Usdc raw={p.amount} className="text-6xl font-bold sm:text-7xl" />
        <span className="ml-2 text-lg font-semibold text-subtle">USDC</span>
      </div>

      <Timeline p={p} phase={phase} />
      <Actions p={p} phase={phase} id={p.id} />

      <Card className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Staker</Label>
          <AddressChip addr={p.staker} you={sameAddress(account, p.staker)} />
        </div>
        <div className="space-y-1.5">
          <Label>Referee</Label>
          <AddressChip addr={p.referee} you={sameAddress(account, p.referee)} />
        </div>
        <div className="space-y-1.5">
          <Label>If they fail</Label>
          <AddressChip addr={p.forfeitTo} you={sameAddress(account, p.forfeitTo)} />
        </div>
      </Card>

      <TxHistory id={p.id} status={p.status} />
    </div>
  )
}
