import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { clsx } from 'clsx'
import { Loader2 } from 'lucide-react'
import { splitUsdc } from '@/lib/format'
import { PHASE_LABEL, type Phase } from '@/lib/pledge'

type Variant = 'primary' | 'ghost' | 'success' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
  full?: boolean
  big?: boolean
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-110 active:brightness-95',
  ghost: 'border border-line bg-surface text-ink hover:bg-surface2 active:bg-surface',
  success: 'bg-success text-accent-ink hover:brightness-110 active:brightness-95',
  danger: 'bg-danger text-accent-ink hover:brightness-110 active:brightness-95',
}

export function Button({ variant = 'primary', loading, full, big, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl px-5 font-semibold transition',
        'disabled:cursor-not-allowed disabled:opacity-45 active:scale-[0.98]',
        big && 'min-h-[64px] px-6 text-lg',
        full && 'w-full',
        VARIANTS[variant],
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('rounded-3xl border border-line bg-surface p-5 sm:p-6', className)}>{children}</div>
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('text-xs font-semibold uppercase tracking-[0.08em] text-subtle', className)}>{children}</div>
  )
}

/** USDC amount: big whole part, dimmed 6-digit fraction. */
export function Usdc({ raw, className, fracClass }: { raw: bigint; className?: string; fracClass?: string }) {
  const { whole, frac } = splitUsdc(raw)
  return (
    <span className={clsx('display tabular-nums', className)}>
      {whole}
      <span className={clsx('text-[0.55em] font-medium opacity-50', fracClass)}>.{frac}</span>
    </span>
  )
}

const BADGE: Record<Phase, string> = {
  running: 'bg-accent/15 text-accent',
  review: 'bg-accent/15 text-accent',
  expired: 'bg-danger/15 text-danger',
  kept: 'bg-success/15 text-success',
  forfeited: 'bg-danger/15 text-danger',
}

export function StatusBadge({ phase }: { phase: Phase }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.08em]',
        BADGE[phase],
      )}
    >
      <span className={clsx('h-1.5 w-1.5 rounded-full bg-current', (phase === 'running' || phase === 'review') && 'animate-pulse')} />
      {PHASE_LABEL[phase]}
    </span>
  )
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'warn'; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={clsx(
        'rounded-2xl border px-4 py-3 text-sm',
        tone === 'error' && 'border-danger/40 bg-danger/10 text-danger',
        tone === 'warn' && 'border-accent/40 bg-accent/10 text-accent',
        tone === 'info' && 'border-line bg-surface2 text-muted',
      )}
    >
      {children}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-2xl bg-surface2', className)} />
}
