// Send leftover USDC from all three demo wallets to your own address.
// Usage: node sweep.mjs <yourAddress>
import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import 'dotenv/config';
import { arc } from './chain.mjs';
const to = process.argv[2];
if (!/^0x[0-9a-fA-F]{40}$/.test(to ?? '')) throw new Error('usage: node sweep.mjs <yourAddress>');
const pub = createPublicClient({ chain: arc, transport: http() });
for (const k of ['RECIPIENT', 'REFEREE', 'DEPLOYER']) {
  const account = privateKeyToAccount(process.env[k + '_PK']);
  const bal = await pub.getBalance({ address: account.address }); // native USDC, 18 decimals
  const gasPrice = await pub.getGasPrice();
  const fee = gasPrice * 2n * 21000n + parseEther('0.001');
  if (bal <= fee) { console.log(k, 'nothing to sweep'); continue; }
  const hash = await createWalletClient({ chain: arc, account, transport: http() })
    .sendTransaction({ to, value: bal - fee, gasPrice: gasPrice * 2n });
  await pub.waitForTransactionReceipt({ hash });
  console.log(k, 'swept', hash);
}
