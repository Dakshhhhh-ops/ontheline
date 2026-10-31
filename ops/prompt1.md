Build "OnTheLine" — put USDC on the line for a goal. Max preset: full audit + Foundry tests.

## Concept
A commitment contract. A staker locks USDC on a goal ("ship my PR by Friday", "run 5km 3x this week") and names a REFEREE (a friend) and a FORFEIT RECIPIENT (a charity, a rival, a friend). If the referee confirms success, the staker gets the USDC back. If the referee marks it failed, or nobody confirms before the review window closes, the USDC goes to the forfeit recipient. Money with a deadline.

## Contract: contracts/OnTheLine.sol (Solidity ^0.8.24)
- Uses the USDC ERC-20 interface (6 decimals). Token address is a constructor arg; on Arc (testnet AND mainnet) USDC is 0x3600000000000000000000000000000000000000. Use SafeERC20 + ReentrancyGuard. No owner, no admin, no upgradeability, no fees — nobody can touch locked funds except via the rules below.
- struct Pledge { address staker; address referee; address forfeitTo; uint128 amount; uint64 deadline; uint64 reviewEnd; Status status; string goal; }
- enum Status { Active, Kept, Forfeited }
- create(string goal, address referee, address forfeitTo, uint128 amount, uint64 deadline, uint64 reviewWindow) returns (uint256 id)
  - pulls `amount` USDC from msg.sender via transferFrom; requires amount > 0, deadline > block.timestamp, referee != staker, referee != 0, forfeitTo != staker, forfeitTo != 0, bytes(goal).length between 1 and 280, reviewWindow <= 30 days; reviewEnd = deadline + reviewWindow.
- confirm(uint256 id): only referee, only while Active and block.timestamp <= reviewEnd → status Kept, refund staker.
- fail(uint256 id): only referee, only while Active → status Forfeited, pay forfeitTo. (Referee may fail early.)
- settleExpired(uint256 id): anyone, only while Active and block.timestamp > reviewEnd → Forfeited, pay forfeitTo. (Silence = forfeit, so the staker cannot stall.)
- Views: getPledge(id), pledgeCount(), pledgesByStaker(address) returns uint256[], pledgesByReferee(address) returns uint256[], pledgesByRecipient(address) returns uint256[], and global stats totalLocked(), totalKept(), totalForfeited().
- Events: PledgeCreated(id, staker, referee, forfeitTo, amount, deadline, reviewEnd, goal), PledgeKept(id, staker, amount), PledgeForfeited(id, forfeitTo, amount, bool expired).
- Custom errors, CEI ordering, NatSpec.

## Tests: test/OnTheLine.t.sol (Foundry)
Use a mock 6-decimal ERC-20. Cover: happy path confirm, referee fail early, settleExpired after reviewEnd, confirm after reviewEnd reverts, non-referee cannot confirm/fail, settleExpired before reviewEnd reverts, double settle reverts, all create() validation reverts, stats accounting, per-address index arrays, a fuzz test on amount/deadline, and an invariant that the contract's token balance == totalLocked. Run them and show the results.

## Frontend (React + Vite, wagmi/viem)
- Chain config supporting BOTH Arc Testnet (5042002, https://rpc.testnet.arc.io, explorer https://explorer.testnet.arc.io) and Arc Mainnet (5042, https://rpc.mainnet.arc.io, explorer https://explorer.arc.io). Native gas currency USDC (18 decimals). Contract address per chain in one config file (src/config.ts) so I can drop in the mainnet address.
- Pages:
  1. Home: hero "Put USDC on the line.", live global stats (locked / kept / forfeited), "Make a pledge" button, list of recent pledges from events.
  2. New pledge form: goal text, amount (USDC), deadline (datetime picker + quick presets: 2 min, 1 hour, 1 day, 1 week), review window (presets: 2 min, 1 day, 3 days), referee address, forfeit recipient address. Two-step approve → create with clear progress states. After success, show the share link.
  3. Pledge page /p/:id (shareable): goal, amount, staker/referee/recipient, live countdown to deadline and review end, status badge. If connected wallet is the referee: big "✅ They did it" (confirm) and "❌ They didn't" (fail) buttons. After reviewEnd anyone sees "Settle". Show every tx hash for this pledge as a link to the explorer.
  4. Dashboard: tabs "My pledges", "I'm refereeing", "Paid to me".
- Bold, playful design: dark background, one strong accent, big numbers, mobile friendly. Format USDC with 6 decimals. Clear error messages (wrong network → switch-network button).

Deploy the contract to Arc Testnet, wire the frontend to it, and give me the deployed address. Write a README.md explaining the concept, the contract rules, and how to deploy to Arc mainnet.
