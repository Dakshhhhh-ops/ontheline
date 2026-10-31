import { ExternalLink, ShieldCheck } from 'lucide-react'
import { useChainState } from '@/context/ChainContext'
import { buildAddressExplorerUrl, getUsdc } from '@/onchain-facts'
import { Label } from '@/components/ui'

function ProofLink({ label, addr, chainId }: { label: string; addr: string; chainId: number }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <a
        href={buildAddressExplorerUrl(chainId, addr)}
        target="_blank"
        rel="noopener noreferrer"
        className="mono inline-flex items-center gap-1.5 break-all text-sm text-ink underline-offset-4 hover:underline"
      >
        {addr}
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
      </a>
    </div>
  )
}

/** Footer section linking the contract on the explorer of the selected network. */
export function Proof() {
  const { chainId, address, deployment } = useChainState()
  const usdc = getUsdc(chainId)

  return (
    <section aria-labelledby="proof-heading" className="border-t border-line">
      <div className="mx-auto max-w-5xl space-y-5 px-4 pb-28 pt-10">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-accent" aria-hidden />
          <h2 id="proof-heading" className="display text-2xl font-bold">
            Proof
          </h2>
        </div>
        <p className="max-w-2xl text-pretty text-sm text-muted">
          Your USDC is held by one public contract with no owner, no admin and no fees. Read it yourself on the {deployment.label} explorer.
        </p>
        {address ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <ProofLink label={`OnTheLine on ${deployment.label}`} addr={address} chainId={chainId} />
            {usdc && <ProofLink label="USDC token it uses" addr={usdc.address} chainId={chainId} />}
          </div>
        ) : (
          <p className="text-sm text-muted">OnTheLine is not deployed on {deployment.label} yet.</p>
        )}
      </div>
    </section>
  )
}
