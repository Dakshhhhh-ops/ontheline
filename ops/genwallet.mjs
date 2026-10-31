import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import fs from 'fs';
if (fs.existsSync('.env')) { console.log('exists'); process.exit(0); }
const names=['DEPLOYER','REFEREE','RECIPIENT'];
let out='';
for (const n of names){ const pk=generatePrivateKey(); out+=`${n}_PK=${pk}\n`; console.log(n, privateKeyToAccount(pk).address); }
fs.writeFileSync('.env', out, {mode:0o600});
