# OnTheLine

Put USDC on the line for a goal. You lock USDC, name a referee and someone to receive the money if you fail, and a smart contract holds it until the referee makes the call.

Built with [Arc Studio](https://studio.arc.io)

## The concept

A commitment contract with a deadline and real money behind it.

1. You write a goal ("ship my PR by Friday"), pick an amount of USDC, a deadline, and a review window.
2. You name a **referee** (a friend who judges whether you did it) and a **forfeit recipient** (a charity, a rival, a friend).
3. If the referee confirms you succeeded, the USDC goes back to you.
4. If the referee says you failed, or stays silent until the review window closes, the USDC goes to the forfeit recipient.

Each pledge has a shareable page, so you can send the link to your referee.

## The rules (enforced by the contract)

- No owner, no admin, no fees, no upgrades. Nobody can touch locked funds except through the rules below.
- A pledge needs: a goal of 1 to 280 bytes, an amount above zero, a deadline in the future, and a review window of at most 30 days. The review ends at the deadline plus the review window.
- The referee and the forfeit recipient must each be a real address that is different from the staker.
- Only the referee can confirm a pledge, and only until the review window ends (the last second counts). Confirming refunds the staker.
- Only the referee can mark a pledge failed, at any time while it is still open, even before the deadline. That pays the forfeit recipient.
- Once the review window has ended, anyone can settle the pledge. Silence means forfeit, so a staker cannot stall.
- A pledge settles once. After that it is final.
- The contract only accepts USDC that arrives in full. USDC sent directly to the contract without making a pledge is not a pledge and cannot be recovered.

### Things to know

- If a wallet is blocked by the USDC issuer, payments to it fail and the pledge stays unresolved. Pick a forfeit recipient that can receive USDC.
- If the issuer ever blocked the contract itself, every pledge would be frozen. The contract cannot work around that.
- The referee is trusted. Choose someone you trust to be honest, and who will actually respond.

## Deployments

| Network | Chain ID | Contract |
| --- | --- | --- |
| Arc Testnet | 5042002 | `0xbca81577f27684a54fb3f61cf51711e0acb94ea4` |
| Arc Mainnet | 5042 | not deployed |

USDC on Arc (testnet and mainnet) is at `0x3600000000000000000000000000000000000000`. Arc's gas currency is also USDC.

## Tech stack

- Solidity 0.8.28, OpenZeppelin, Foundry
- React 18, Vite, TypeScript, Tailwind CSS
- wagmi, viem, ConnectKit

## Development

Prerequisites: [Bun](https://bun.sh) and [Foundry](https://book.getfoundry.sh).

```bash
bun install
bun run dev              # start the app
bun run check            # lint and typecheck
bun run build            # production build into dist/
bun run contracts:build
bun run contracts:test   # run the Foundry test suite
bun run smoke:testnet    # real-transaction smoke test against the Arc Testnet deployment
```

### Environment variables

Set these in `.env` (or in your build environment). They are public values (addresses, block numbers, a URL path), never secrets. The app reads them at build time, so restart the dev server or rebuild after changing them.

| Name | Purpose |
| --- | --- |
| `VITE_BASE` | URL path the site is served from. Default `/`. Use `/ontheline/` for GitHub Pages |
| `VITE_ONTHELINE_ADDRESS_TESTNET` | OnTheLine contract address on Arc Testnet |
| `VITE_ONTHELINE_DEPLOY_BLOCK_TESTNET` | Block the testnet contract was deployed at (history scans never go earlier) |
| `VITE_ONTHELINE_ADDRESS_MAINNET` | OnTheLine contract address on Arc Mainnet. When set, the app opens on Arc Mainnet and shows a "Live on Arc Mainnet" badge |
| `VITE_ONTHELINE_DEPLOY_BLOCK_MAINNET` | Block the mainnet contract was deployed at (optional, strongly recommended) |

All chain and contract wiring lives in `src/config.ts`. Users can always switch between Testnet and Mainnet with the toggle in the header.

## Static hosting (GitHub Pages)

The app is a static site. It uses hash routes, so deep links such as `https://<user>.github.io/ontheline/#/p/3` work without any server rewrites, and the share links the app produces use the same format.

```bash
VITE_BASE=/ontheline/ bun run build
```

Publish the contents of `dist/` to GitHub Pages (the `gh-pages` branch, or a Pages deployment from your CI). `.env` is not committed, so provide the `VITE_ONTHELINE_*` variables to the build step in your CI or shell.

## Arc Mainnet deployment

Warning: Transactions on mainnet involve real funds and, once submitted, are irreversible. Arc Studio may generate or edit code or configuration that references mainnet, but Arc Studio does not deploy to, transact on, sign for, fund, or otherwise interact with mainnet on your behalf. Any code used for mainnet must be independently reviewed, tested, validated, deployed, and operated by you outside of Arc Studio. You are solely responsible for any losses, errors, or other consequences resulting from your use of any code, configuration, or output generated or edited through Arc Studio in connection with mainnet. Before proceeding, you should first use testnet, obtain an independent professional audit, and carefully review all wallet addresses, contract addresses, chain settings, permissions, and other configuration details. Only continue to mainnet after you have completed your independent review and have determined that you want to proceed.

You deploy from your own wallet. Arc's gas currency is USDC, so the deployer wallet needs a little mainnet USDC for fees.

1. Build with the project's pinned compiler settings (solc 0.8.28, Cancun EVM, optimizer on with 200 runs, set in `foundry.toml`) so the bytecode matches what was tested:

   ```bash
   forge build
   ```

2. Deploy with the USDC address as the only constructor argument. Keep your key in an environment variable and never commit it:

   ```bash
   export PRIVATE_KEY=<your deployer key>
   forge create contracts/OnTheLine.sol:OnTheLine \
     --rpc-url https://rpc.mainnet.arc.io \
     --private-key $PRIVATE_KEY \
     --broadcast \
     --constructor-args 0x3600000000000000000000000000000000000000
   ```

3. Check the deployment points at USDC, and read the block it landed in:

   ```bash
   cast call <DEPLOYED_ADDRESS> "token()(address)" --rpc-url https://rpc.mainnet.arc.io
   cast receipt <DEPLOY_TX_HASH> blockNumber --rpc-url https://rpc.mainnet.arc.io
   ```

4. Put the results in `.env`:

   ```
   VITE_ONTHELINE_ADDRESS_MAINNET=<DEPLOYED_ADDRESS>
   VITE_ONTHELINE_DEPLOY_BLOCK_MAINNET=<BLOCK_NUMBER>
   ```

5. Build the static site and publish `dist/`:

   ```bash
   VITE_BASE=/ontheline/ bun run build
   ```

The app now opens on Arc Mainnet with the "Live on Arc Mainnet" badge, and the footer links the contract on the Arc explorer.
