import { Check, Circle, Loader2, XCircle } from 'lucide-react'
import { clsx } from 'clsx'
import type { StepState } from '@/hooks/useCreatePledge'
import { TxLink } from '@/components/Parts'

const COPY: Record<StepState, string> = {
  idle: 'Waiting',
  wallet: 'Confirm in your wallet',
  confirming: 'Confirming onchain',
  done: 'Done',
  error: 'Failed',
}

function StepRow({ n, title, state, hash, skipped }: { n: number; title: string; state: StepState; hash?: string; skipped?: boolean }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-surface2 px-4 py-3">
      <span
        className={clsx(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold',
          state === 'done' ? 'border-success bg-success/15 text-success' : state === 'error' ? 'border-danger text-danger' : 'border-line text-muted',
        )}
      >
        {state === 'done' ? <Check className="h-4 w-4" /> : state === 'error' ? <XCircle className="h-4 w-4" /> : state === 'wallet' || state === 'confirming' ? <Loader2 className="h-4 w-4 animate-spin text-accent" /> : skipped ? <Circle className="h-3 w-3" /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{title}</div>
        <div className="text-xs text-muted">{skipped && state === 'done' ? 'Already allowed' : COPY[state]}</div>
      </div>
      {hash && <TxLink hash={hash} />}
    </li>
  )
}

export function PledgeSteps({
  approve,
  create,
  approveHash,
  createHash,
  skippedApprove,
}: {
  approve: StepState
  create: StepState
  approveHash?: string
  createHash?: string
  skippedApprove: boolean
}) {
  return (
    <ol className="space-y-2" aria-label="Progress">
      <StepRow n={1} title="Allow USDC" state={approve} hash={approveHash} skipped={skippedApprove} />
      <StepRow n={2} title="Lock it in" state={create} hash={createHash} />
    </ol>
  )
}
