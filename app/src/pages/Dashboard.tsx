import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { clsx } from 'clsx'
import { useChainState } from '@/context/ChainContext'
import { useAccountPledges, type AccountKind } from '@/hooks/otl'
import { Button, Card, Notice, Skeleton } from '@/components/ui'
import { PledgeCard } from '@/components/Parts'
import { NotDeployed } from '@/components/WalletGate'

const TABS: Array<{ kind: AccountKind; label: string; empty: string }> = [
  { kind: 'staker', label: 'My pledges', empty: "You haven't put anything on the line yet." },
  { kind: 'referee', label: "I'm refereeing", empty: 'Nobody has named you as their referee yet.' },
  { kind: 'recipient', label: 'Paid to me', empty: 'No pledge names you as the forfeit recipient yet.' },
]

function TabBody({ kind, empty }: { kind: AccountKind; empty: string }) {
  const { address } = useAccount()
  const q = useAccountPledges(kind, address)

  if (q.isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
    )
  }
  if (q.isError) return <Notice tone="error">Could not load your pledges. Check your connection and try again.</Notice>
  if (!q.data || q.data.pledges.length === 0) {
    return (
      <Card className="text-center text-muted">
        {empty}
        {kind === 'staker' && (
          <div className="mt-4">
            <Link to="/new" className="font-semibold text-accent underline-offset-4 hover:underline">Make a pledge</Link>
          </div>
        )}
      </Card>
    )
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {q.data.pledges.map((p) => (
          <PledgeCard key={p.id.toString()} p={p} />
        ))}
      </div>
      {q.data.total > BigInt(q.data.pledges.length) && (
        <p className="text-center text-xs text-subtle">
          Showing the latest {q.data.pledges.length} of {q.data.total.toString()}.
        </p>
      )}
    </div>
  )
}

export default function Dashboard() {
  const { isConnected } = useAccount()
  const { address, deployment } = useChainState()
  const [tab, setTab] = useState<AccountKind>('staker')

  if (!address) return <NotDeployed />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="display text-5xl font-bold sm:text-6xl">Dashboard</h1>
        <p className="mt-2 text-muted">Your pledges on {deployment.label}.</p>
      </div>

      {!isConnected ? (
        <Card className="space-y-4 text-center">
          <p className="text-muted">Connect your wallet to see pledges you made, refereed, or are owed.</p>
          <ConnectKitButton.Custom>
            {({ show }) => (
              <Button onClick={show} className="mx-auto">Connect wallet</Button>
            )}
          </ConnectKitButton.Custom>
        </Card>
      ) : (
        <>
          <div role="tablist" aria-label="Pledge groups" className="flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-1">
            {TABS.map((t) => (
              <button
                key={t.kind}
                role="tab"
                aria-selected={tab === t.kind}
                onClick={() => setTab(t.kind)}
                className={clsx(
                  'min-h-[44px] flex-1 whitespace-nowrap rounded-xl px-4 text-sm font-semibold transition',
                  tab === t.kind ? 'bg-accent text-accent-ink' : 'text-muted hover:text-ink',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div role="tabpanel">
            <TabBody key={tab} kind={tab} empty={TABS.find((t) => t.kind === tab)!.empty} />
          </div>
        </>
      )}
    </div>
  )
}
