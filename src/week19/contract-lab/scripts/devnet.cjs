const assert=require('node:assert/strict');
const ccc=require('@ckb-ccc/core');
const {JsonRpcTransformers:J}=require('@ckb-ccc/core/advanced');
const {boot}=require('./harness.cjs');
const A=require('./accounting.cjs');
const {CKB,STORAGE,RESERVE,hex,raw,le,ticket,shard,parseShard,pool,payout,Router}=A;
async function main(){
 const h=await boot(); const {admin,owner,guarded,build,commit,rejects,record,rpc,mine}=h;
 const plain=(capacity,lock)=>({capacity,lock});
 const headers=cells=>[...new Set(cells.map(c=>c.blockHash))];
 async function create(cutoff){
  const ty=h.protocol(hex(Buffer.concat([Buffer.from(ccc.OutPoint.from(admin.fund.outPoint).toBytes()),raw(admin.lock.hash()),le(cutoff),raw(h.guardHash),raw(admin.lock.hash()),raw(owner.lock.hash())])));
  const tx=await build(admin,[],Array.from({length:5},()=>guarded(ty,RESERVE)),['0x0000ff',...Array.from({length:4},(_,i)=>shard(i))]);
  const cells=await commit(admin,tx);record('Market and all four unique shards created',{transaction:tx.hash()});return {ty,market:cells[0],shards:cells.slice(1,5),cutoff};
 }
 async function deposit(m,id,outcome,amount,actor=owner,shouldCommit=true){
  const old=m.shards[id],s=parseShard(old.data),t=ticket(actor.lock.hash(),outcome,amount);
  let capacity=old.output.capacity+amount+STORAGE;const outs=[],data=[];
  if(s.pending){const header=await rpc('get_header',[old.blockHash]);if(Number(BigInt(header.timestamp))<m.cutoff)s.accepted.push(s.pending);else{const refund=s.pending.readBigUInt64LE(33)+STORAGE;capacity-=refund;const lock=s.pending.subarray(0,32).equals(raw(owner.lock.hash()))?owner.lock:admin.lock;outs.push(plain(refund,lock));data.push('0x');}}
  const tx=await build(actor,[old],[guarded(m.ty,capacity),...outs],[shard(id,s.accepted,t),...data],{deps:[m.market],headers:headers([old])});
  if(shouldCommit){[m.shards[id]]=await commit(actor,tx);}return tx;
 }
 async function close(m,voided=false){
  const tickets=[],late=[],totals=[0n,0n,0n];let capacity=m.market.output.capacity;
  for(const c of m.shards){capacity+=c.output.capacity;const s=parseShard(c.data);tickets.push(...s.accepted);if(s.pending){const header=await rpc('get_header',[c.blockHash]);if(Number(BigInt(header.timestamp))<m.cutoff)tickets.push(s.pending);else late.push(s.pending);}}
  for(const t of tickets)totals[t[32]]+=t.readBigUInt64LE(33);
  const outcome=voided?255:raw(m.market.data)[2],mask=(1n<<BigInt(tickets.length))-1n;
  const outputs=[guarded(m.ty,0n),...tickets.map(()=>guarded(m.ty,STORAGE))];
  const data=[pool(outcome,totals,mask),...tickets.map((t,i)=>hex(Buffer.concat([Buffer.from([3,i]),t])))];capacity-=BigInt(tickets.length)*STORAGE;
  for(const t of late){const refund=t.readBigUInt64LE(33)+STORAGE;outputs.push(plain(refund,t.subarray(0,32).equals(raw(owner.lock.hash()))?owner.lock:admin.lock));data.push('0x');capacity-=refund;}
  const losing=outcome===255||totals[outcome]===0n?0n:totals.reduce((a,b)=>a+b,0n)-totals[outcome];
  if(losing>0n)for(const [lock,fee] of [[admin.lock,losing/50n],[owner.lock,losing/100n]]){outputs.push(plain(100n*CKB+fee,lock));data.push('0x');capacity-=100n*CKB+fee;}
  if(voided){outputs.push(plain(100n*CKB,owner.lock));data.push('0x');capacity-=100n*CKB;}
  outputs[0].capacity=capacity;
  const tx=await build(owner,[m.market,...m.shards],outputs,data,{headers:headers([m.market,...m.shards]),since:voided?0x4000000000000000n|BigInt(Math.ceil((m.cutoff+21600000)/1000)):0n});
  return {tx,tickets,totals,outcome,mask,capacity};
 }
 async function redeemAll(m,closed,reverse=false){
  const cells=await commit(owner,closed.tx);let p=cells[0],mask=closed.mask;
  const indices=closed.tickets.map((_,i)=>i);if(reverse)indices.reverse();
  for(const i of indices){const t=closed.tickets[i],value=payout(t,closed.outcome,closed.totals),next=mask&~(1n<<BigInt(i));const lock=t.subarray(0,32).equals(raw(owner.lock.hash()))?owner.lock:admin.lock;
   const tx=await build(owner,[p,cells[i+1]],[guarded(m.ty,p.output.capacity+STORAGE-value),plain(value,lock)],[pool(closed.outcome,closed.totals,next),'0x']);
   if(i===indices[0]){
    const wrong=await build(owner,[p,cells[i+1]],[guarded(m.ty,p.output.capacity+STORAGE-value+1n),plain(value-1n,lock)],[pool(closed.outcome,closed.totals,next),'0x']);await rejects('Underpayment cannot release a share',wrong,9);
    const theft=await build(owner,[p,cells[i+1]],[guarded(m.ty,p.output.capacity+STORAGE-value),plain(value,lock.eq(owner.lock)?admin.lock:owner.lock)],[pool(closed.outcome,closed.totals,next),'0x']);await rejects('Redemption cannot redirect the owner payment',theft,6);
   }
   [p]=await commit(owner,tx);mask=next;record('Share burned and exact owner entitlement paid',{id:i,paidShannons:value.toString(),transaction:tx.hash()});
   await rejects('Consumed share cannot be redeemed twice',tx,/Resolve failed Unknown/);
  }
  const cleanup=await build(owner,[p],[plain(p.output.capacity,admin.lock)],['0x']);await commit(owner,cleanup);record('Only after all claims, reserve and rounding dust returned to sponsor',{capacity:p.output.capacity.toString(),transaction:cleanup.hash()});
 }
 const m=await create(h.getClock()+10000),router=new Router();
 // Two independently signed transactions reference different shard inputs.
 const id0=router.reserve(),id1=router.reserve();assert.deepEqual([id0,id1],[0,1]);
 const tx0=await deposit(m,id0,0,100n*CKB,owner,false),tx1=await deposit(m,id1,1,200n*CKB,admin,false);
 await rpc('send_transaction',[J.transactionFrom(tx0),'passthrough']);await rpc('send_transaction',[J.transactionFrom(tx1),'passthrough']);
 [m.shards[0]]=await commit(owner,tx0,true);[m.shards[1]]=await commit(admin,tx1,true);router.release(0);router.release(1);
 record('Independent wallets submitted deposits into two shards before either committed',{transactions:[tx0.hash(),tx1.hash()]});
 await deposit(m,router.reserve(),0,300n*CKB);router.release(2);
 await deposit(m,router.reserve(),2,101n*CKB);router.release(3);
 const stale=await deposit(m,0,1,100n*CKB,admin,false);await deposit(m,0,0,100n*CKB,owner);await rejects('Competing builders cannot consume the same shard twice',stale,/Resolve failed Unknown/);
 h.setClock(m.cutoff+1000);await mine(40);
 await deposit(m,1,2,100n*CKB);record('Late deposit remains provisional and cannot change accepted totals');
 const report=await build(admin,[m.market],[guarded(m.ty,RESERVE)],['0x000100']);[m.market]=await commit(admin,report);
 const closed=await close(m);assert.deepEqual(closed.totals,[500n*CKB,200n*CKB,101n*CKB]);
 const omitted=closed.tx.clone();omitted.inputs.splice(4,1);omitted.outputs.at(-1).capacity-=m.shards[3].output.capacity;await rejects('Closure cannot omit a configured shard',await owner.signer.signTransaction(omitted),5);
 const changed=closed.tx.clone();const altered=raw(changed.outputsData[0]);altered.writeBigUInt64LE(501n*CKB,2);changed.outputsData[0]=hex(altered);await rejects('Builder cannot invent the frozen winning denominator',await owner.signer.signTransaction(changed),8);
 record('Closure checks all shards, refunds the late stake and freezes global totals',{totalsShannons:closed.totals.map(String),shares:closed.tickets.length});
 await redeemAll(m,closed,true);
 const v=await create(h.getClock()+10000);await deposit(v,0,1,100n*CKB);await deposit(v,1,2,200n*CKB);
 const early=await close(v,true);await rejects('Consensus rejects a premature six-hour cancellation',early.tx,/Immature.*since requirement/);
 h.setClock(v.cutoff+21600000+1000);await mine(40);await redeemAll(v,await close(v,true));record('Unresolved market voided with full principal and share storage refunds');
 const z=await create(h.getClock()+10000);await deposit(z,0,1,100n*CKB);h.setClock(z.cutoff+1000);await mine(40);
 [z.market]=await commit(admin,await build(admin,[z.market],[guarded(z.ty,RESERVE)],['0x000100']));const empty=await close(z);assert.equal(empty.totals[0],0n);await redeemAll(z,empty);record('An empty winning outcome refunds principal instead of dividing by zero');
 const late=await create(h.getClock()+10000);await deposit(late,0,0,100n*CKB);
 h.setClock(late.cutoff+21600000+1000);await mine(40);
 [late.market]=await commit(admin,await build(admin,[late.market],[guarded(late.ty,RESERVE)],['0x000100']));
 await rejects('A late oracle report cannot resolve the market before someone voids it',(await close(late)).tx,7);
 await redeemAll(late,await close(late,true));record('Late oracle report takes the rewarded void path with no betting fees');
 await h.finish();
}
main().catch(e=>{console.error(e);process.exitCode=1;});
