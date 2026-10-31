import type { Address } from 'viem'

export const STATUS_ACTIVE = 0
export const STATUS_KEPT = 1
export const STATUS_FORFEITED = 2

export interface PledgeData {
  id: bigint
  staker: Address
  referee: Address
  forfeitTo: Address
  amount: bigint
  deadline: number
  reviewEnd: number
  status: number
  goal: string
}

/** Where a pledge is in its life, derived from onchain fields and the clock. */
export type Phase = 'running' | 'review' | 'expired' | 'kept' | 'forfeited'

export function phaseOf(p: Pick<PledgeData, 'status' | 'deadline' | 'reviewEnd'>, nowSec: number): Phase {
  if (p.status === STATUS_KEPT) return 'kept'
  if (p.status === STATUS_FORFEITED) return 'forfeited'
  if (nowSec <= p.deadline) return 'running'
  if (nowSec <= p.reviewEnd) return 'review'
  return 'expired'
}

export const PHASE_LABEL: Record<Phase, string> = {
  running: 'Live',
  review: 'In review',
  expired: 'Ready to settle',
  kept: 'Kept',
  forfeited: 'Forfeited',
}

export function sameAddress(a?: string, b?: string): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase()
}
