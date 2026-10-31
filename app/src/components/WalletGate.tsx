import type { ReactNode } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { Wallet } from 'lucide-react'
import { useChainState } from '@/context/ChainContext'
import { Button, Notice } from '@/components/ui'

/** Renders children only when the contract exists here, a wallet is connected, and it is on the right network. */
export function WalletGate({ children, label = 'Connect wallet' }: { children: ReactNode; label?: string }) {
  const { isConnected, chainId: walletChainId } = useAccount()
  const { chainId, address, deployment } = useChainState()
  const { switchChain, isPending } = useSwitchChain()

  if (!address) {
    return <NotDeployed />
  }

  if (!isConnected) {
    return (
      <ConnectKitButton.Custom>
        {({ show }) => (
          <Button onClick={show} full big>
            <Wallet className="h-5 w-5" aria-hidden />
            {label}
          </Button>
        )}
      </ConnectKitButton.Custom>
    )
  }

  if (walletChainId !== chainId) {
    return (
      <div className="space-y-3">
        <Notice tone="warn">Your wallet is on a different network. OnTheLine here runs on {deployment.label}.</Notice>
        <Button full big loading={isPending} onClick={() => switchChain({ chainId })}>
          Switch to {deployment.label}
        </Button>
      </div>
    )
  }

  return <>{children}</>
}

export function NotDeployed() {
  const { deployment } = useChainState()
  return (
    <Notice tone="warn">
      OnTheLine is not deployed on {deployment.label} yet. Set VITE_ONTHELINE_ADDRESS_
      {deployment.net.toUpperCase()} in .env and restart the dev server.
    </Notice>
  )
}
