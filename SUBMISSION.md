# OnTheLine: DoraHacks submission (Arc Microgrants: Built with Arc Studio)

Copy each field into the DoraHacks form.

| Field | Value |
|---|---|
| Project name | OnTheLine |
| Tagline | Put USDC on the line. Money with a deadline, on Arc. |
| Arc Studio project URL | https://studio.arc.io/app/dac017cc-f256-4b20-b001-2c56eb4b8286 |
| Live app | __LIVE_URL__ |
| Contract (Arc mainnet) | __CONTRACT__ — https://explorer.arc.io/address/__CONTRACT__ |
| Example tx (USDC moved) | __TX__ — https://explorer.arc.io/tx/__TX__ |
| Repo | https://github.com/Dakshhhhh-ops/ontheline |
| Video | __VIDEO__ |
| Builder profile | https://github.com/Dakshhhhh-ops |

## Short description

OnTheLine is a commitment contract for USDC on Arc. You lock USDC on a goal, such as "ship the PR by Friday" or "run 5 km three times this week", and name a referee and a forfeit recipient.

- If the referee confirms you did it, the USDC comes back to you.
- If they mark it failed, or the review window closes in silence, the USDC goes to the forfeit recipient: a charity, a rival, or a friend.

Every pledge is a shareable link. The referee opens it, connects a wallet and taps ✅ or ❌, and the USDC settles at once.

Arc fits this well. Gas is paid in USDC, so the staker, the referee and the recipient need only one asset, and finality takes under a second. That keeps one-dollar pledges practical, and the referee's tap settles at once.

## How Arc Studio was used

- **Contracts:** Arc Studio wrote `OnTheLine.sol` from a plain-English spec. It uses SafeERC20 and a reentrancy guard, has no admin key and charges no fees.
- **Testing:** Arc Studio wrote and ran the Foundry test suite: unit, fuzz and invariant tests (contract balance == totalLocked). It also ran its audit pass on the contract (max preset).
- **App:** Arc Studio built the React + Vite + wagmi frontend, deployed the contract to Arc Testnet, and wired the app to it. The app has a pledge form, a shareable pledge page with a live countdown and referee buttons, a dashboard, and live global stats.
- **Mainnet:** The Arc Studio sources were pulled with `arc-studio pull` and the same contract was deployed to Arc mainnet (chain 5042). The app's chain config was switched to mainnet, and real USDC pledges were run end to end.

## Mainnet proof

__PROOF_TABLE__

## Potential

- Group pledges with several referees and an m-of-n vote.
- Recurring streak pledges, such as one pledge per week.
- Forfeits routed straight to verified charity addresses.
- An agent referee that checks GitHub, Strava or Duolingo through an oracle and calls confirm() itself, so a software agent settles a payment between humans.
- Embeddable "stake on it" buttons for course platforms and accountability groups.
