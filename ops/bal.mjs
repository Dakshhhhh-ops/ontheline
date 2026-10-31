import { createPublicClient, http, formatUnits, erc20Abi } from 'viem';
import 'dotenv/config';
import { privateKeyToAccount } from 'viem/accounts';
const c = createPublicClient({ transport: http('https://rpc.mainnet.arc.io') });
console.log('chainId', await c.getChainId(), 'block', await c.getBlockNumber());
for (const k of ['DEPLOYER','REFEREE','RECIPIENT']) {
  const a = privateKeyToAccount(process.env[k+'_PK']).address;
  const b = await c.readContract({ address:'0x3600000000000000000000000000000000000000', abi: erc20Abi, functionName:'balanceOf', args:[a]});
  console.log(k, a, formatUnits(b,6), 'USDC');
}
