import { useMemo, useState } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi, isAddress, type Address } from 'viem'
import { clsx } from 'clsx'
import { useChainState } from '@/context/ChainContext'
import { useNow } from '@/hooks/otl'
import { useCreatePledge } from '@/hooks/useCreatePledge'
import { getUsdc } from '@/onchain-facts'
import { parseUsdc } from '@/onchain-money'
import { fmtDateTime, fmtUsdc, fromLocalInputValue, toLocalInputValue, utf8Length } from '@/lib/format'
import { sameAddress } from '@/lib/pledge'
import { Button, Card, Label, Notice } from '@/components/ui'
import { WalletGate } from '@/components/WalletGate'
import { PledgeSteps } from '@/components/PledgeSteps'
import { ShareCard } from '@/components/ShareCard'

const DEADLINE_PRESETS = [
  { label: '2 min', secs: 120 },
  { label: '1 hour', secs: 3600 },
  { label: '1 day', secs: 86400 },
  { label: '1 week', secs: 604800 },
]
const REVIEW_PRESETS = [
  { label: '2 min', secs: 120 },
  { label: '1 day', secs: 86400 },
  { label: '3 days', secs: 259200 },
]

type DeadlineSel = { kind: 'preset'; secs: number } | { kind: 'custom' }

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'min-h-[44px] rounded-full border px-4 text-sm font-semibold transition',
        active ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface2 text-muted hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

const inputCls =
  'w-full rounded-2xl border border-line bg-surface2 px-4 py-3 text-base text-ink placeholder:text-subtle focus:border-accent'

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="mt-1.5 text-sm text-danger">{msg}</p> : null
}

export default function NewPledge() {
  const { chainId, address: otl, deployment } = useChainState()
  const { address: account } = useAccount()
  const now = useNow()
  const { state, run, reset } = useCreatePledge()
  const usdc = getUsdc(chainId)

  const [goal, setGoal] = useState('')
  const [amount, setAmount] = useState('')
  const [deadlineSel, setDeadlineSel] = useState<DeadlineSel>({ kind: 'preset', secs: 86400 })
  const [customDeadline, setCustomDeadline] = useState('')
  const [reviewSecs, setReviewSecs] = useState(86400)
  const [referee, setReferee] = useState('')
  const [forfeitTo, setForfeitTo] = useState('')
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [submitted, setSubmitted] = useState(false)

  const usdcAddress = usdc?.address as Address | undefined
  const balance = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: account ? [account] : undefined,
    chainId,
    query: { enabled: !!account && !!usdcAddress, refetchInterval: 8000 },
  })
  const allowance = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: account && otl ? [account, otl] : undefined,
    chainId,
    query: { enabled: !!account && !!otl && !!usdcAddress, refetchInterval: 8000 },
  })

  const parsedAmount = useMemo(() => {
    try {
      return amount.trim() ? parseUsdc(amount) : null
    } catch {
      return null
    }
  }, [amount])

  const deadlineAt = deadlineSel.kind === 'preset' ? now + deadlineSel.secs : fromLocalInputValue(customDeadline)

  const errors = useMemo(() => {
    const e: Record<string, string> = {}
    const bytes = utf8Length(goal)
    if (bytes === 0) e.goal = 'Describe the goal.'
    else if (bytes > 280) e.goal = `Too long: ${bytes}/280 bytes.`
    if (!amount.trim()) e.amount = 'Enter an amount.'
    else if (parsedAmount === null) e.amount = 'Use a plain number with up to 6 decimals.'
    else if (parsedAmount <= 0n) e.amount = 'Amount must be greater than zero.'
    else if (parsedAmount >= 2n ** 128n) e.amount = 'Amount is too large.'
    else if (balance.data !== undefined && parsedAmount > balance.data) e.amount = `You only have ${fmtUsdc(balance.data)} USDC.`
    if (deadlineAt === null) e.deadline = 'Pick a deadline.'
    else if (deadlineAt <= now) e.deadline = 'The deadline must be in the future.'
    for (const [key, v] of [['referee', referee], ['forfeitTo', forfeitTo]] as const) {
      const label = key === 'referee' ? 'referee' : 'recipient'
      if (!v.trim()) e[key] = `Enter the ${label} address.`
      else if (!isAddress(v.trim())) e[key] = 'Not a valid wallet address.'
      else if (sameAddress(v, account)) e[key] = `The ${label} can't be your own wallet.`
      else if (sameAddress(v, otl) || sameAddress(v, usdcAddress)) e[key] = 'That is a contract address, not a wallet.'
    }
    return e
  }, [goal, amount, parsedAmount, balance.data, deadlineAt, now, referee, forfeitTo, account, otl, usdcAddress])

  const show = (k: string) => (touched[k] || submitted ? errors[k] : undefined)
  const touch = (k: string) => setTouched((t) => ({ ...t, [k]: true }))
  const needsApprove = parsedAmount !== null && (allowance.data ?? 0n) < parsedAmount
  const busy = state.approve === 'wallet' || state.approve === 'confirming' || state.create === 'wallet' || state.create === 'confirming'
  const started = state.approve !== 'idle' || state.create !== 'idle'

  if (state.create === 'done' && state.createdId !== undefined) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <ShareCard id={state.createdId} createHash={state.createHash} />
        <Button variant="ghost" onClick={reset}>Make another pledge</Button>
      </div>
    )
  }

  const submit = () => {
    setSubmitted(true)
    if (Object.keys(errors).length > 0 || parsedAmount === null) return
    const sel = deadlineSel
    void run({
      goal: goal.trim(),
      referee: referee.trim() as Address,
      forfeitTo: forfeitTo.trim() as Address,
      amount: parsedAmount,
      resolveDeadline: () =>
        sel.kind === 'preset' ? Math.floor(Date.now() / 1000) + sel.secs : (fromLocalInputValue(customDeadline) ?? 0),
      reviewWindow: reviewSecs,
      needsApprove,
    })
  }

  const goalBytes = utf8Length(goal)

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="display text-5xl font-bold sm:text-6xl">New pledge</h1>
        <p className="mt-2 text-muted">Lock USDC on {deployment.label}. Your referee decides. Silence means forfeit.</p>
      </div>

      <Card className="space-y-6">
        <div>
          <Label className="mb-2">The goal</Label>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onBlur={() => touch('goal')}
            rows={3}
            placeholder="Ship my PR by Friday"
            className={clsx(inputCls, 'resize-none')}
            disabled={busy}
          />
          <div className="mt-1 flex justify-between">
            <FieldError msg={show('goal')} />
            <span className={clsx('mono ml-auto text-xs', goalBytes > 280 ? 'text-danger' : 'text-subtle')}>{goalBytes}/280</span>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-end justify-between">
            <Label>Amount</Label>
            {balance.data !== undefined && (
              <button
                type="button"
                className="mono text-xs text-muted hover:text-accent"
                onClick={() => setAmount(fmtUsdc(balance.data).replace(/,/g, ''))}
              >
                Balance {fmtUsdc(balance.data)} · Max
              </button>
            )}
          </div>
          <div className="relative">
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={() => touch('amount')}
              placeholder="0.000000"
              className={clsx(inputCls, 'display pr-20 text-3xl font-bold tabular-nums')}
              disabled={busy}
              aria-label="Amount in USDC"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-subtle">USDC</span>
          </div>
          <FieldError msg={show('amount')} />
        </div>

        <div>
          <Label className="mb-2">Deadline</Label>
          <div className="flex flex-wrap gap-2">
            {DEADLINE_PRESETS.map((p) => (
              <Chip key={p.secs} active={deadlineSel.kind === 'preset' && deadlineSel.secs === p.secs} onClick={() => setDeadlineSel({ kind: 'preset', secs: p.secs })}>
                {p.label}
              </Chip>
            ))}
            <Chip
              active={deadlineSel.kind === 'custom'}
              onClick={() => {
                setDeadlineSel({ kind: 'custom' })
                if (!customDeadline) setCustomDeadline(toLocalInputValue(now + 86400))
              }}
            >
              Pick date
            </Chip>
          </div>
          {deadlineSel.kind === 'custom' && (
            <input
              type="datetime-local"
              value={customDeadline}
              onChange={(e) => setCustomDeadline(e.target.value)}
              onBlur={() => touch('deadline')}
              className={clsx(inputCls, 'mt-3')}
              aria-label="Deadline date and time"
              disabled={busy}
            />
          )}
          {deadlineAt !== null && deadlineAt > now && (
            <p className="mt-2 text-sm text-muted">Deadline: {fmtDateTime(deadlineAt)}</p>
          )}
          <FieldError msg={show('deadline')} />
        </div>

        <div>
          <Label className="mb-2">Review window</Label>
          <div className="flex flex-wrap gap-2">
            {REVIEW_PRESETS.map((p) => (
              <Chip key={p.secs} active={reviewSecs === p.secs} onClick={() => setReviewSecs(p.secs)}>
                {p.label}
              </Chip>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted">
            After the deadline your referee has this long to confirm. If they stay silent, your USDC is forfeited.
          </p>
        </div>

        <div>
          <Label className="mb-2">Referee (a friend who decides)</Label>
          <input value={referee} onChange={(e) => setReferee(e.target.value)} onBlur={() => touch('referee')} placeholder="0x…" className={clsx(inputCls, 'mono text-sm')} spellCheck={false} autoComplete="off" disabled={busy} />
          <FieldError msg={show('referee')} />
        </div>

        <div>
          <Label className="mb-2">If you fail, send it to</Label>
          <input value={forfeitTo} onChange={(e) => setForfeitTo(e.target.value)} onBlur={() => touch('forfeitTo')} placeholder="0x… charity, rival or friend" className={clsx(inputCls, 'mono text-sm')} spellCheck={false} autoComplete="off" disabled={busy} />
          <FieldError msg={show('forfeitTo')} />
          <p className="mt-1.5 text-xs text-subtle">Use a wallet that can receive USDC: a blocked address would leave the pledge stuck.</p>
        </div>
      </Card>

      {started && (
        <PledgeSteps
          approve={state.approve}
          create={state.create}
          approveHash={state.approveHash}
          createHash={state.createHash}
          skippedApprove={!needsApprove && state.approveHash === undefined}
        />
      )}
      {state.error && <Notice tone="error">{state.error}</Notice>}

      <WalletGate>
        <Button full big loading={busy} onClick={submit}>
          {busy
            ? state.approve === 'wallet' || state.create === 'wallet'
              ? 'Confirm in wallet…'
              : 'Confirming…'
            : state.error
              ? 'Try again'
              : needsApprove
                ? 'Allow USDC, then lock it in'
                : 'Lock it in'}
        </Button>
      </WalletGate>
    </div>
  )
}
