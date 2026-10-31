# Video walkthrough script (about 2.5 minutes)

The judges need to see two things: **the build in Arc Studio** and **a mainnet transaction**. Record your screen with OBS or the Xbox Game Bar (Win+G) and talk over it. Have these tabs open before you start:

1. The Arc Studio workspace: https://studio.arc.io/app/dac017cc-f256-4b20-b001-2c56eb4b8286
2. The live app: https://dakshhhhh-ops.github.io/ontheline/
3. The explorer page for the contract: https://explorer.arc.io/address/__CONTRACT__
4. The GitHub repo: https://github.com/Dakshhhhh-ops/ontheline

| Time | Screen | Say |
|---|---|---|
| 0:00–0:15 | Live app home page | "This is OnTheLine. You put USDC on the line for a goal. A referee decides: if you did it, you get your money back. If you didn't, it goes to someone you picked in advance. It's live on Arc mainnet." |
| 0:15–0:50 | Arc Studio workspace: scroll the chat from the first prompt, open `contracts/OnTheLine.sol` | "I built it in Arc Studio. I described the rules in plain English, and Studio wrote the contract: SafeERC20, a reentrancy guard, no admin key, no fees." |
| 0:50–1:10 | Studio: the test files and the test results (51 passed, fuzz and invariant) in the chat | "Studio wrote and ran 51 Foundry tests, including fuzz tests and an invariant that the contract's balance always equals the total locked. It ran two security reviews plus Slither, and fixed three findings." |
| 1:10–1:25 | Studio: the preview panel and the `src/` files | "It built the whole React app too, and deployed it to Arc testnet first." |
| 1:25–2:05 | Live app on **Arc Mainnet** in MetaMask: create a pledge for 0.25 USDC → approve → create → copy the share link | "Now real money. I stake a quarter of a dollar in USDC on mainnet. Approve, then create. Gas is in USDC, so I only need one token, and finality takes under a second." |
| 2:05–2:25 | Open the pledge page and the transaction history, then click a tx hash → explorer.arc.io | "Here's the transaction on explorer.arc.io: USDC moving into the contract." |
| 2:25–2:40 | Explorer contract page, the list of transactions (kept / failed / expired pledges from the demo run) | "Here are the three outcomes on mainnet: one kept and refunded, one failed and paid to the recipient, one expired and settled by a third party." |
| 2:40–2:50 | GitHub repo README | "Code, tests and mainnet proof are all in the repo. Next up: AI-agent referees that check GitHub or Strava and settle a pledge on their own." |

Tips:
- To do the live pledge, import the REFEREE key from `ops/.env` into a second MetaMask account. Then you can tap "They did it" yourself on camera.
- If you skip the live pledge, show the demo transactions from `ops/mainnet-proof.json` on the explorer instead. They satisfy the requirement on their own.
- Upload to YouTube (unlisted is fine) or Loom, and paste the link into the DoraHacks form.

MetaMask network settings, if you need to add them by hand:
- Network: Arc Mainnet
- RPC URL: https://rpc.mainnet.arc.io
- Chain ID: 5042
- Currency: USDC
- Explorer: https://explorer.arc.io
