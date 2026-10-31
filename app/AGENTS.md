# OnTheLine

> Built with Arc Studio - money-powered apps in minutes

Project memory for future agents and humans.

## What This App Does

OnTheLine is a USDC commitment app. A staker locks USDC on a goal, names a referee and a forfeit recipient. The referee confirms (staker refunded) or fails it (recipient paid). If the referee stays silent past the review window, anyone can settle it as forfeited.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS, react-router-dom
- Web3: wagmi v2, viem v2, ConnectKit (injected wallet)
- Contracts: Solidity 0.8.28 + Foundry. `contracts/OnTheLine.sol`, tests in `contracts/test/*.t.sol` (51 tests incl. fuzz and invariants). `bun run contracts:build`, `bun run contracts:test`.
- Chains: Arc Testnet (5042002) and Arc Mainnet (5042), defined in `src/config.ts` from `@/onchain-facts`
- Token: USDC ERC-20 (6 decimals) at 0x3600000000000000000000000000000000000000 on both Arc networks. Native gas is also USDC (18 decimals): never show both.

## Deployments

- Arc Testnet: `0xbca81577f27684a54fb3f61cf51711e0acb94ea4` (deploy block 70077462). Constructor arg: USDC address.
- Arc Mainnet: not deployed. Set `VITE_ONTHELINE_ADDRESS_MAINNET` and `VITE_ONTHELINE_DEPLOY_BLOCK_MAINNET` in `.env`.

Contract addresses live in `.env` (VITE_ONTHELINE_*) and are read only in `src/config.ts`. Do not hardcode them elsewhere.

## Key Files

- `src/config.ts` - chains, per-chain deployments, wagmi config
- `src/abi/onTheLine.ts` - ABI generated from the Foundry artifact (regenerate after contract changes)
- `src/context/ChainContext.tsx` - active chain (follows the wallet), contract address
- `src/hooks/otl.ts` - reads (stats, pledges, account lists); `useCreatePledge.ts` approve+create flow; `useResolve.ts` confirm/fail/settle; `usePledgeTxs.ts` event scan for tx hashes
- `src/lib/txLog.ts` - backwards event scan in 4,000-block windows (the Arc RPC rejected 10,000-block ranges), never from block 0
- `src/pages/` - Home, NewPledge, PledgePage (/p/:id, `?net=mainnet` for mainnet), Dashboard
- Design: dark, caution-yellow accent (`--accent`), Space Grotesk / DM Sans, tokens in `src/index.css`

## Contract review notes

Reviewed at max depth plus static analysis. Accepted: a USDC-blocklisted recipient leaves a pledge unresolved (no redirect by design), and creation errors carry little context. Both documented in the contract NatSpec / README.

## Share links

- Use `buildShareLink()` from `src/lib/share.ts` for every link a user copies or sends. Keep `installShareSync()` in `src/main.tsx`.
- Shareable state lives in the path/query (`/p/12`, `?net=mainnet`), never a secret.

## To Run

```bash
bun install
bun run dev
```
