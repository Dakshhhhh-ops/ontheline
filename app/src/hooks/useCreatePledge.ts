import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import { erc20Abi, parseEventLogs, type Address, type Hex, type PublicClient } from 'viem'
import { onTheLineAbi } from '@/abi/onTheLine'
import { useChainState } from '@/context/ChainContext'
import { getUsdc } from '@/onchain-facts'
import { FlowError, isUserRejection, parseError } from '@/lib/errors'
import { rememberTx } from '@/lib/txLog'

export type StepState = 'idle' | 'wallet' | 'confirming' | 'done' | 'error'

export interface CreateArgs {
  goal: string
  referee: Address
  forfeitTo: Address
  amount: bigint
  /** Resolved at the moment of sending, so "1 hour" really means one hour from the tx. */
  resolveDeadline: () => number
  reviewWindow: number
  needsApprove: boolean
}

interface FlowState {
  approve: StepState
  create: StepState
  error?: string
  approveHash?: Hex
  createHash?: Hex
  createdId?: bigint
}

const INITIAL: FlowState = { approve: 'idle', create: 'idle' }

export function useCreatePledge() {
  const { chainId, address: otl } = useChainState()
  const { address: account } = useAccount()
  const client = usePublicClient({ chainId }) as PublicClient | undefined
  const { writeContractAsync } = useWriteContract()
  const queryClient = useQueryClient()
  const [state, setState] = useState<FlowState>(INITIAL)

  const patch = useCallback((p: Partial<FlowState>) => setState((s) => ({ ...s, ...p })), [])

  const run = useCallback(
    async (a: CreateArgs) => {
      const usdc = getUsdc(chainId)
      if (!client || !otl || !usdc || !account) return
      const usdcAddress = usdc.address as Address
      setState({ approve: a.needsApprove ? 'idle' : 'done', create: 'idle' })

      let step: 'approve' | 'create' = a.needsApprove ? 'approve' : 'create'
      try {
        if (a.needsApprove) {
          patch({ approve: 'wallet' })
          const approveHash = await writeContractAsync({
            address: usdcAddress,
            abi: erc20Abi,
            functionName: 'approve',
            args: [otl, a.amount],
            chainId,
          })
          patch({ approve: 'confirming', approveHash })
          const receipt = await client.waitForTransactionReceipt({ hash: approveHash })
          if (receipt.status !== 'success') throw new FlowError('The approval transaction failed onchain.')
          patch({ approve: 'done' })
        }

        step = 'create'
        const deadline = a.resolveDeadline()
        if (deadline <= Math.floor(Date.now() / 1000) + 2) {
          throw new FlowError('The deadline has already passed. Pick a later time and try again.')
        }
        patch({ create: 'wallet' })
        const createHash = await writeContractAsync({
          address: otl,
          abi: onTheLineAbi,
          functionName: 'create',
          args: [a.goal, a.referee, a.forfeitTo, a.amount, BigInt(deadline), BigInt(a.reviewWindow)],
          chainId,
        })
        patch({ create: 'confirming', createHash })
        const receipt = await client.waitForTransactionReceipt({ hash: createHash })
        if (receipt.status !== 'success') throw new FlowError('The pledge transaction failed onchain.')

        const [created] = parseEventLogs({ abi: onTheLineAbi, logs: receipt.logs, eventName: 'PledgeCreated' })
        const createdId = created?.args.id
        if (createdId !== undefined) rememberTx(chainId, createdId, { kind: 'created', hash: createHash })
        patch({ create: 'done', createdId })
        await queryClient.invalidateQueries({ queryKey: ['otl', chainId] })
      } catch (e) {
        const message = isUserRejection(e) ? 'You cancelled the request in your wallet. Nothing was spent.' : parseError(e)
        setState((s) => ({ ...s, [step]: 'error', error: message }))
      }
    },
    [account, chainId, client, otl, patch, queryClient, writeContractAsync],
  )

  const reset = useCallback(() => setState(INITIAL), [])

  return { state, run, reset }
}
