import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useChainState } from '@/context/ChainContext'
import { useRecentPledges, useStats } from '@/hooks/otl'
import { Card, Label, Notice, Skeleton, Usdc } from '@/components/ui'
import { PledgeCard } from '@/components/Parts'
import { NotDeployed } from '@/components/WalletGate'

function Stat({ label, raw, tone }: { label: string; raw?: bigint; tone?: 'success' | 'danger' | 'accent' }) {
  const color = tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : tone === 'accent' ? 'text-accent' : 'text-ink'
  return (
    <Card className="flex flex-col justify-between gap-3">
      <Label>{label}</Label>
      {raw === undefined ? (
        <Skeleton className="h-12 w-3/4" />
      ) : (
        <div className={color}>
          <Usdc raw={raw} className="text-4xl font-bold sm:text-5xl" />
          <span className="ml-2 text-sm font-semibold text-subtle">USDC</span>
        </div>
      )}
    </Card>
  )
}

export default function Home() {
  const { address, deployment } = useChainState()
  const stats = useStats()
  const recent = useRecentPledges(8)

  return (
    <div className="space-y-12">
      <section className="space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Money with a deadline · {deployment.label}
        </div>
        <h1 className="display text-balance text-[clamp(3rem,11vw,7.5rem)] font-bold leading-[0.92]">
          Put USDC <br />
          <span className="text-accent">on the line.</span>
        </h1>
        <p className="max-w-xl text-pretty text-lg text-muted">
          Lock USDC on a goal. A friend referees. Nail it and you get it back. Miss it, or go quiet, and it goes to someone
          else.
        </p>
        <Link
          to="/new"
          className="inline-flex min-h-[64px] items-center gap-3 rounded-2xl bg-accent px-7 text-lg font-bold text-accent-ink transition hover:brightness-110 active:scale-[0.98]"
        >
          Make a pledge
          <ArrowRight className="h-5 w-5" aria-hidden />
        </Link>
      </section>

      {!address && <NotDeployed />}

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Global stats">
        <Stat label="On the line now" raw={stats.data?.locked} tone="accent" />
        <Stat label="Kept" raw={stats.data?.kept} tone="success" />
        <Stat label="Forfeited" raw={stats.data?.forfeited} tone="danger" />
      </section>
      {stats.isError && <Notice tone="error">Could not load stats from {deployment.label}. Retrying.</Notice>}

      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <h2 className="display text-3xl font-bold">Recent pledges</h2>
          {stats.data && <span className="mono text-xs text-subtle">{stats.data.count.toString()} total</span>}
        </div>
        {recent.isLoading && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </div>
        )}
        {recent.isError && <Notice tone="error">Could not load pledges. Check your connection.</Notice>}
        {recent.data && recent.data.length === 0 && (
          <Card className="text-center text-muted">
            Nothing on the line yet. <Link to="/new" className="font-semibold text-accent underline-offset-4 hover:underline">Be the first.</Link>
          </Card>
        )}
        {recent.data && recent.data.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {recent.data.map((p) => (
              <PledgeCard key={p.id.toString()} p={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
