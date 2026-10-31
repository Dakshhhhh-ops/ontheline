import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from 'viem'

const CUSTOM_ERRORS: Record<string, string> = {
  InvalidToken: 'The contract was set up with an invalid token.',
  NonexistentPledge: 'That pledge does not exist.',
  InvalidAmount: 'Amount must be greater than zero.',
  InvalidDeadline: 'The deadline must be in the future. Pick a later time.',
  InvalidReferee: 'The referee must be a different wallet from yours, and not a contract address that cannot act.',
  InvalidRecipient: 'The forfeit recipient must be a different wallet from yours, and cannot be the contract or token address.',
  InvalidGoalLength: 'The goal must be between 1 and 280 bytes.',
  InvalidReviewWindow: 'The review window can be at most 30 days.',
  ReviewEndOverflow: 'That deadline is too far in the future.',
  NotReferee: 'Only the referee can do this.',
  PledgeNotActive: 'This pledge has already been settled.',
  ReviewEnded: 'The review window is over. Confirming is no longer possible: anyone can settle it as forfeited.',
  NotExpired: 'The review window is still open, so this cannot be settled yet.',
  UnexpectedTokenBalanceDelta: 'The token did not deliver the exact pledged amount.',
}

/** An error whose message is already written for the user. */
export class FlowError extends Error {}

/** True when the user closed or rejected the wallet prompt. */
export function isUserRejection(error: unknown): boolean {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) return true
  }
  const msg = (error as { message?: string } | null)?.message?.toLowerCase() ?? ''
  return msg.includes('user rejected') || msg.includes('user denied')
}

function errorNameOf(e: ContractFunctionRevertedError): string | undefined {
  const data = e.data as { errorName?: string } | undefined
  return data?.errorName
}

/** Turns any viem / wallet error into one clear sentence. */
export function parseError(error: unknown): string {
  if (error instanceof FlowError) return error.message
  if (isUserRejection(error)) return 'You cancelled the request in your wallet.'

  if (error instanceof BaseError) {
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError)
    if (revert instanceof ContractFunctionRevertedError) {
      const name = errorNameOf(revert)
      if (name && name in CUSTOM_ERRORS) return CUSTOM_ERRORS[name]
      if (revert.reason) return `Transaction reverted: ${revert.reason}`
    }
    const short = error.shortMessage
    const lower = short.toLowerCase()
    if (lower.includes('insufficient funds')) return 'Not enough USDC to pay for gas. Use "Get test USDC" in the sidebar if you are on testnet.'
    if (lower.includes('exceeds balance') || lower.includes('transfer amount exceeds')) return 'Your USDC balance is too low for this pledge.'
    if (lower.includes('allowance')) return 'The contract is not allowed to move that much USDC yet. Approve first.'
    if (lower.includes('http request failed') || lower.includes('timeout')) return 'Network issue. Check your connection and try again.'
    return short
  }

  return 'Something went wrong. Please try again.'
}
