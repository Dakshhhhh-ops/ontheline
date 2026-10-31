import { formatUnitsFixed } from '@/onchain-money'
import { USDC_DECIMALS } from '@/onchain-facts'

/** USDC with all 6 decimals, e.g. "1,250.500000". */
export function fmtUsdc(raw: bigint): string {
  const [whole, frac] = formatUnitsFixed(raw, USDC_DECIMALS, USDC_DECIMALS).split('.')
  return `${BigInt(whole).toLocaleString('en-US')}.${frac}`
}

/** Split into whole part and 6-digit fraction so the UI can dim the decimals. */
export function splitUsdc(raw: bigint): { whole: string; frac: string } {
  const [whole, frac] = fmtUsdc(raw).split('.')
  return { whole, frac }
}

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`
}

/** "2d 3h", "4h 12m", "3m 05s", "42s". */
export function fmtDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`
  if (m > 0) return `${m}m ${sec.toString().padStart(2, '0')}s`
  return `${sec}s`
}

export function fmtDateTime(unixSeconds: number | bigint): string {
  return new Date(Number(unixSeconds) * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Value for <input type="datetime-local"> in local time. */
export function toLocalInputValue(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInputValue(value: string): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
}

export function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length
}
