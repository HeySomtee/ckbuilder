const {test}=require('node:test');
const assert=require('node:assert/strict');
const {CKB,STORAGE,ticket,payout,Router}=require('./accounting.cjs');
const owner='0x'+'11'.repeat(32);
test('sequential reservations wrap, skip busy shards, and recover after conflicts',()=>{
 const r=new Router();assert.deepEqual([r.reserve(),r.reserve(),r.reserve(),r.reserve()],[0,1,2,3]);
 assert.throws(()=>r.reserve(),/busy or full/);r.release(2);assert.equal(r.reserve(),2);r.release(0);assert.equal(r.reserve(),0);
 r.release(1);assert.throws(()=>r.reserve([true,false,true,true]),/busy or full/);assert.equal(r.reserve(),1);
});
test('known pool pays 294 CKB for 100 of 1000 winning CKB against 2000 losing CKB',()=>{
 assert.equal(payout(ticket(owner,0,100n*CKB),0,[1000n*CKB,2000n*CKB,0n])-STORAGE,294n*CKB);
});
test('conflict retries refresh cells, rebuild in sequence and release reservations',async()=>{
 const r=new Router(),seen=[],refreshed=[];
 const result=await r.run(async id=>{seen.push(id);if(id===0)throw new Error('spent');return 'committed';},{isConflict:e=>e.message==='spent',refresh:async id=>refreshed.push(id)});
 assert.equal(result,'committed');assert.deepEqual(seen,[0,1]);assert.deepEqual(refreshed,[0]);assert.equal(r.pending.size,0);
 await assert.rejects(()=>r.run(async()=>{throw new Error('invalid signature');},{isConflict:()=>false}),/invalid signature/);assert.equal(r.pending.size,0);
 let attempts=0;await assert.rejects(()=>r.run(async()=>{attempts++;throw new Error('spent');},{isConflict:()=>true,refresh:async()=>{},retries:2}),/spent/);assert.equal(attempts,3);assert.equal(r.pending.size,0);
});
test('1000 deterministic portfolios conserve backing regardless of claim order',()=>{
 let seed=271828n;const next=()=>{seed=(seed*48271n)%2147483647n;return seed;};
 for(let run=0;run<1000;run++){
  const ts=Array.from({length:1+Number(next()%32n)},()=>ticket(owner,Number(next()%3n),100n*CKB+next()));
  const totals=[0n,0n,0n];for(const t of ts)totals[t[32]]+=t.readBigUInt64LE(33);
  const outcome=Number(next()%3n),total=totals.reduce((a,b)=>a+b),losing=totals[outcome]===0n?0n:total-totals[outcome];
  const fees=losing/50n+losing/100n,expected=total+BigInt(ts.length)*STORAGE;
  const values=ts.map(t=>payout(t,outcome,totals));const paid=values.reduce((a,b)=>a+b,0n);
  assert(paid+fees<=expected);assert(expected-paid-fees<BigInt(ts.length));
  let remaining=expected-fees;for(const value of [...values].reverse()){assert(remaining>=value);remaining-=value;}
  for(const t of ts)assert.equal(payout(t,255,totals),STORAGE+t.readBigUInt64LE(33));
 }
});
