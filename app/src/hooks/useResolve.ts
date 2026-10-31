import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useWriteContract, usePublicClient } from 'wagmi'
import type { PublicClient } from 'viem'
import { onTheLineAbi } from '@/abi/onTheLine'
import { useChainState } from '@/context/ChainContext'
import { FlowError, parseError } from '@/lib/errors'
import { rememberTx, type TxKind } from '@/lib/txLog'

export type ResolveAction = 'confirm' | 'fail' | 'settleExpired'

const KIND: Record<ResolveAction, TxKind> = { confirm: 'kept', fail: 'forfeited', settleExpired: 'settled' }

export interface ResolveState {
  action?: ResolveAction
  phase: 'idle' | 'wallet' | 'confirming' | 'done' | 'error'
  hash?: `0x${string}`
  error?: string
}

export function useResolve(id: bigint) {
  const { chainId, address } = useChainState()
  const client = usePublicClient({ chainId }) as PublicClient | undefined
  const { writeContractAsync } = useWriteContract()
  const queryClient = useQueryClient()
  const [state, setState] = useState<ResolveState>({ phase: 'idle' })

  const send = useCallback(
    async (action: ResolveAction) => {
      if (!client || !address) return
      setState({ action, phase: 'wallet' })
      try {
        const hash = await writeContractAsync({
          address,
          abi: onTheLineAbi,
          functionName: action,
          args: [id],
          chainId,
        })
        setState({ action, phase: 'confirming', hash })
        const receipt = await client.waitForTransactionReceipt({ hash })
        if (receipt.status !== 'success') throw new FlowError('The transaction failed onchain.')
        rememberTx(chainId, id, { kind: KIND[action], hash })
        setState({ action, phase: 'done', hash })
        await queryClient.invalidateQueries({ queryKey: ['otl', chainId] })
      } catch (e) {
        setState({ action, phase: 'error', error: parseError(e) })
      }
    },
    [address, chainId, client, id, queryClient, writeContractAsync],
  )

  return { state, send, busy: state.phase === 'wallet' || state.phase === 'confirming' }
}
