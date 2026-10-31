import { Link, NavLink, Outlet } from 'react-router-dom'
import { ConnectKitButton } from 'connectkit'
import { clsx } from 'clsx'
import { useChainState } from '@/context/ChainContext'
import { ARC_MAINNET_ID, ARC_TESTNET_ID } from '@/config'
import { Proof } from '@/components/Proof'

function LiveBadge() {
  const { chainId, address } = useChainState()
  if (chainId !== ARC_MAINNET_ID || !address) return null
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-success">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" aria-hidden />
      Live on Arc Mainnet
    </span>
  )
}

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <Link to="/" className="flex items-center gap-2.5" aria-label="OnTheLine home">
        <span className="tape block h-6 w-6 rounded-md border border-accent" aria-hidden />
        <span className="display text-xl font-bold">
          OnThe<span className="text-accent">Line</span>
        </span>
      </Link>
      <LiveBadge />
    </div>
  )
}

function NetworkToggle() {
  const { chainId, setChainId } = useChainState()
  const options = [
    { id: ARC_TESTNET_ID, label: 'Testnet' },
    { id: ARC_MAINNET_ID, label: 'Mainnet' },
  ] as const
  return (
    <div role="group" aria-label="Network" className="flex rounded-full border border-line bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => setChainId(o.id)}
          aria-pressed={chainId === o.id}
          className={clsx(
            'min-h-[32px] rounded-full px-3 text-xs font-bold uppercase tracking-[0.06em] transition',
            chainId === o.id ? 'bg-ink text-bg' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/new', label: 'New pledge', end: false },
  { to: '/dashboard', label: 'Dashboard', end: false },
]

export function Layout() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <Logo />
          <nav className="order-3 flex w-full gap-1 sm:order-none sm:w-auto" aria-label="Main">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  clsx(
                    'flex min-h-[40px] flex-1 items-center justify-center rounded-full px-4 text-sm font-semibold transition sm:flex-none',
                    isActive ? 'bg-surface2 text-ink' : 'text-muted hover:text-ink',
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <NetworkToggle />
            <ConnectKitButton showAvatar={false} />
          </div>
        </div>
        <div className="tape h-1" aria-hidden />
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:pt-12">
        <Outlet />
      </main>
      <Proof />
    </div>
  )
}
