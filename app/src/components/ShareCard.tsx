import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy, Share2 } from 'lucide-react'
import { buildShareLink } from '@/lib/share'
import { useChainState } from '@/context/ChainContext'
import { Button, Card, Label } from '@/components/ui'
import { TxLink } from '@/components/Parts'

export function ShareCard({ id, createHash }: { id: bigint; createHash?: string }) {
  const { deployment } = useChainState()
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Resolve the share base once so Copy/Share are instant (clipboard needs a fresh user gesture).
  useEffect(() => {
    let cancelled = false
    // Hash route, so the link works on static hosts (GitHub Pages) without server rewrites.
    void buildShareLink('/')
      .then((l) => {
        if (!cancelled) setLink(`${l}#/p/${id}?net=${deployment.net}`)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [id, deployment.net])

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // clipboard blocked: the link is selectable in the box above
    }
  }

  const share = async () => {
    if (!link || !navigator.share) return copy()
    try {
      await navigator.share({ title: 'OnTheLine pledge', text: 'I put USDC on the line. Be my referee:', url: link })
    } catch {
      // dismissed
    }
  }

  return (
    <Card className="space-y-5 border-accent/50">
      <div className="space-y-1">
        <div className="tape h-1.5 w-16 rounded-full" aria-hidden />
        <h2 className="display pt-3 text-4xl font-bold">It's on the line.</h2>
        <p className="text-muted">Pledge #{id.toString()} is locked. Send the link to your referee so they can call it.</p>
      </div>
      <div>
        <Label className="mb-2">Share link</Label>
        <div className="mono select-all break-all rounded-2xl bg-surface2 px-4 py-3 text-sm">{link ?? 'Preparing link…'}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => { void copy() }} disabled={!link}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy link'}
        </Button>
        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <Button variant="ghost" onClick={() => { void share() }} disabled={!link}>
            <Share2 className="h-4 w-4" /> Share
          </Button>
        )}
        <Link
          to={`/p/${id}?net=${deployment.net}`}
          className="inline-flex min-h-[44px] items-center rounded-2xl border border-line px-5 font-semibold hover:bg-surface2"
        >
          Open pledge page
        </Link>
      </div>
      {createHash && (
        <div className="text-sm text-muted">
          Transaction: <TxLink hash={createHash} />
        </div>
      )}
    </Card>
  )
}
