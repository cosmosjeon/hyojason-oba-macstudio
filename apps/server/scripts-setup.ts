import { maws } from './src/maws.ts';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import fs from 'node:fs';
const P='../../secrets.local.json';
const s = fs.existsSync(P)? JSON.parse(fs.readFileSync(P,'utf8')) : {};
if(!s.merchants){ s.merchants={}; for(const n of ['관리사무소','약국','무신사']){ const pk=generatePrivateKey(); s.merchants[n]={address:privateKeyToAccount(pk).address,privateKey:pk}; }
  const pk=generatePrivateKey(); s.scammer={address:privateKeyToAccount(pk).address,privateKey:pk}; }
for(const n of ['맥스튜디오-순자할머니','맥스튜디오-엄마']){ if(!s.agents?.[n]){ const r=await maws('agent.create',{name:n}); console.log(n,r.text.slice(0,600)); s.agents={...(s.agents||{}),[n]:r.data}; } }
fs.writeFileSync(P,JSON.stringify(s,null,2)); process.exit(0);