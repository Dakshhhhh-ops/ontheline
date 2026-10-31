# OnTheLine: put USDC on the line

**Money with a deadline, on Arc.** You lock USDC on a goal and name a referee and a forfeit recipient.
- If the referee confirms you did it, the USDC comes back to you.
- If they mark it failed, or the review window closes in silence, the USDC goes to the forfeit recipient.

| | |
|---|---|
| Live app | https://dakshhhhh-ops.github.io/ontheline/ |
| Built in Arc Studio | https://studio.arc.io/app/dac017cc-f256-4b20-b001-2c56eb4b8286 |
| Contract (Arc mainnet, chain 5042) | __MAINNET_CONTRACT__ |
| Contract (Arc testnet) | [`0xbca81577f27684a54fb3f61cf51711e0acb94ea4`](https://explorer.testnet.arc.io/address/0xbca81577f27684a54fb3f61cf51711e0acb94ea4) |

## How it works

```
staker ──create(goal, referee, forfeitTo, amount, deadline, reviewWindow)──► OnTheLine (holds USDC)
                                                                             │
           referee: confirm()  (before reviewEnd) ─────────► USDC back to staker      [Kept]
           referee: fail()     (any time while active) ────► USDC to forfeitTo        [Forfeited]
           anyone:  settleExpired() (after reviewEnd) ─────► USDC to forfeitTo        [Forfeited]
```

- The contract has no owner, no admin, no fees and no upgrade path. Locked USDC can only move by the three rules above.
- Silence counts as a forfeit, so a staker can't stall by keeping the referee from answering.
- It uses the USDC ERC-20 interface at `0x3600…0000` (6 decimals), the same address on Arc testnet and mainnet. Gas is also paid in USDC, so every participant needs just one asset.

## Built with Arc Studio

The whole of [`app/`](app/) was generated in Arc Studio through the Arc Studio CLI, driven over several agent turns. The prompts are in [`ops/prompt1.md`](ops/prompt1.md) and [`ops/prompt2.md`](ops/prompt2.md), and Studio's result documents are in `ops/run*.json`.

| Part | What Arc Studio did |
|---|---|
| Contract | Wrote [`app/contracts/OnTheLine.sol`](app/contracts/OnTheLine.sol) from a plain-English spec: SafeERC20, ReentrancyGuard, custom errors, paged views |
| Testing | Wrote and ran **51 Foundry tests** (unit, fuzz and invariant tests that contract balance == `totalLocked`), with 128k invariant calls |
| Review | Ran two max-depth security reviews plus Slither, and fixed 3 findings: self-as-recipient lock, unbounded index arrays, error context |
| Deploy | Deployed to Arc Testnet and wired the app to it |
| App | React + Vite + wagmi app with a pledge form, a shareable pledge page with live countdowns and referee buttons, a dashboard, global stats, a mainnet/testnet toggle, a proof footer and GitHub Pages support |

Arc Studio deploys to testnet only. So the exact same source, compiled with the same compiler settings (solc 0.8.28, cancun, 200 runs, OpenZeppelin 5.6.1), was deployed to **Arc mainnet** with [`ops/deploy.mjs`](ops/deploy.mjs). Real USDC pledges were then run through it with [`ops/demo.mjs`](ops/demo.mjs).

## Mainnet proof

__PROOF__

## Run it

```bash
# app
cd app && bun install
VITE_ONTHELINE_ADDRESS_MAINNET=<addr> bun run dev

# contracts
cd app && forge test

# mainnet ops (needs ops/.env with DEPLOYER_PK, REFEREE_PK, RECIPIENT_PK)
cd ops && npm i
node deploy.mjs ../app        # compile + deploy OnTheLine to Arc mainnet
node demo.mjs 0.5             # 3 real pledges: kept, failed, expired
```

The GitHub Pages workflow builds `app/` with `VITE_BASE=/ontheline/`. The mainnet address comes from the repo variables `ONTHELINE_ADDRESS_MAINNET` and `ONTHELINE_DEPLOY_BLOCK_MAINNET`.

## What's next

- Group pledges with m-of-n referees.
- Weekly streak pledges.
- Verified charity forfeit lists.
- **Agent referees**: an AI or oracle agent checks GitHub, Strava or Duolingo and calls `confirm()` itself, so software settles a payment between people.
- An embeddable "stake on it" button for course platforms and accountability groups.

> Not audited by Arc or Circle. Use small amounts.
