import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useAccount } from 'wagmi'
import { onTheLineAbi } from '@/abi/onTheLine'
import { DEFAULT_CHAIN_ID, DEPLOYMENTS, isSupportedChain, type Deployment, type SupportedChainId } from '@/config'

interface ChainState {
  /** The chain the app is currently browsing (and writing to). */
  chainId: SupportedChainId
  deployment: Deployment
  /** Contract address, or undefined when OnTheLine is not deployed on this chain yet. */
  address: Deployment['address']
  abi: typeof onTheLineAbi
  setChainId: (id: SupportedChainId) => void
}

const ChainContext = createContext<ChainState | null>(null)

const STORAGE_KEY = 'otl:chain'

function initialChain(): SupportedChainId {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY))
    return isSupportedChain(stored) ? stored : DEFAULT_CHAIN_ID
  } catch {
    return DEFAULT_CHAIN_ID
  }
}

export function ChainProvider({ children }: { children: ReactNode }) {
  const [chainId, setChainState] = useState<SupportedChainId>(initialChain)
  const { chainId: walletChainId, isConnected } = useAccount()

  const setChainId = useCallback((id: SupportedChainId) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(id))
    } catch {
      // storage unavailable (embedded preview): the choice just won't persist
    }
    setChainState(id)
  }, [])

  // When the wallet moves to a supported Arc network, follow it (adjusted during render, not in an effect).
  const walletKey = isConnected ? walletChainId : undefined
  const [seenWalletChain, setSeenWalletChain] = useState<number | undefined>(undefined)
  if (walletKey !== seenWalletChain) {
    setSeenWalletChain(walletKey)
    if (isSupportedChain(walletKey)) setChainState(walletKey)
  }

  const value = useMemo<ChainState>(
    () => ({
      chainId,
      deployment: DEPLOYMENTS[chainId],
      address: DEPLOYMENTS[chainId].address,
      abi: onTheLineAbi,
      setChainId,
    }),
    [chainId, setChainId],
  )

  return <ChainContext.Provider value={value}>{children}</ChainContext.Provider>
}

export function useChainState(): ChainState {
  const ctx = useContext(ChainContext)
  if (!ctx) throw new Error('useChainState must be used inside ChainProvider')
  return ctx
}
