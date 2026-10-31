/**
 * wagmi configuration + OnTheLine deployments.
 * Built with Arc Studio — https://studio.arc.io
 *
 * The ONE place that maps a chain to its OnTheLine contract. To go live on
 * Arc Mainnet, set VITE_ONTHELINE_ADDRESS_MAINNET (and the start block) in .env.
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { defineChain, isAddress, zeroAddress, type Address } from 'viem'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'
import { requireChain } from './onchain-facts'

export const ARC_TESTNET_ID = 5042002 as const
export const ARC_MAINNET_ID = 5042 as const
export type SupportedChainId = typeof ARC_TESTNET_ID | typeof ARC_MAINNET_ID

function arcChain(chainId: SupportedChainId, name: string) {
  const fact = requireChain(chainId)
  return defineChain({
    id: fact.chainId,
    name,
    // Native gas currency is USDC with 18 decimals (the ERC-20 view has 6).
    nativeCurrency: { name: 'USDC', symbol: fact.nativeCurrency.symbol, decimals: fact.nativeCurrency.decimals },
    rpcUrls: { default: { http: fact.rpcUrls } },
    blockExplorers: { default: { name: 'Arc Explorer', url: fact.explorerBase } },
    testnet: fact.isTestnet,
  })
}

export const arcTestnet = arcChain(ARC_TESTNET_ID, 'Arc Testnet')
export const arcMainnet = arcChain(ARC_MAINNET_ID, 'Arc Mainnet')

export interface Deployment {
  chainId: SupportedChainId
  label: string
  net: 'testnet' | 'mainnet'
  /** Undefined until the contract is deployed on this chain. */
  address?: Address
  /** Block the contract was deployed at: event scans never go earlier. */
  startBlock: bigint
}

function envAddress(value: string | undefined): Address | undefined {
  const v = value?.trim()
  if (!v || !isAddress(v) || v.toLowerCase() === zeroAddress) return undefined
  return v
}

function envBlock(value: string | undefined): bigint {
  const v = value?.trim()
  return v && /^\d+$/.test(v) ? BigInt(v) : 0n
}

export const DEPLOYMENTS: Record<SupportedChainId, Deployment> = {
  [ARC_TESTNET_ID]: {
    chainId: ARC_TESTNET_ID,
    label: 'Arc Testnet',
    net: 'testnet',
    address: envAddress(import.meta.env.VITE_ONTHELINE_ADDRESS_TESTNET),
    startBlock: envBlock(import.meta.env.VITE_ONTHELINE_DEPLOY_BLOCK_TESTNET),
  },
  [ARC_MAINNET_ID]: {
    chainId: ARC_MAINNET_ID,
    label: 'Arc Mainnet',
    net: 'mainnet',
    address: envAddress(import.meta.env.VITE_ONTHELINE_ADDRESS_MAINNET),
    startBlock: envBlock(import.meta.env.VITE_ONTHELINE_DEPLOY_BLOCK_MAINNET),
  },
}

/** Arc Mainnet is the default as soon as a mainnet address is configured; users can still toggle to testnet. */
export const DEFAULT_CHAIN_ID: SupportedChainId = DEPLOYMENTS[ARC_MAINNET_ID].address ? ARC_MAINNET_ID : ARC_TESTNET_ID

export function isSupportedChain(chainId: number | undefined): chainId is SupportedChainId {
  return chainId === ARC_TESTNET_ID || chainId === ARC_MAINNET_ID
}

registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])
registerChain(arcMainnet.id, arcMainnet.rpcUrls.default.http[0])

export const config = createConfig({
  chains: [arcTestnet, arcMainnet, mainnet], // Ethereum mainnet only for ENS resolution
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http(),
    [arcMainnet.id]: http(),
    [mainnet.id]: http(),
  },
})
