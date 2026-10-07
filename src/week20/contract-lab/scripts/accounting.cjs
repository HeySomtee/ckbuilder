const CKB=100000000n, STORAGE=321n*CKB, RESERVE=610n*CKB;
const le=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;};
const hex=b=>'0x'+b.toString('hex');
const raw=h=>Buffer.from(h.slice(2),'hex');
const ticket=(owner,outcome,amount)=>Buffer.concat([raw(owner),Buffer.from([outcome]),le(amount)]);
function shard(id,accepted=[],pending=null) {return hex(Buffer.concat([Buffer.from([1,id,accepted.length,pending?1:0]),...accepted,...pending?[pending]:[]]));}
function parseShard(h) {const b=raw(h);return {id:b[1],accepted:Array.from({length:b[2]},(_,i)=>b.subarray(4+41*i,45+41*i)),pending:b[3]?b.subarray(b.length-41):null};}
function pool(outcome,totals,mask) {return hex(Buffer.concat([Buffer.from([2,outcome]),...totals.map(le),le(mask)]));}
function payout(t,outcome,totals) {
  const amount=t.readBigUInt64LE(33);
  if(outcome===255||totals[outcome]===0n)return STORAGE+amount;
  if(t[32]!==outcome)return STORAGE;
  const losing=totals.reduce((a,b)=>a+b,0n)-totals[outcome];
  return STORAGE+amount+amount*(losing-losing/50n-losing/100n)/totals[outcome];
}
// Local reservations prevent this builder from reusing its own pending inputs.
// Other builders can still conflict. Refresh their live cells before retrying.
class Router {
  constructor(){this.next=0;this.pending=new Set();}
  reserve(available=[true,true,true,true]) {
    for(let offset=0;offset<4;offset++){const id=(this.next+offset)%4;if(available[id]&&!this.pending.has(id)){this.pending.add(id);this.next=(id+1)%4;return id;}}
    throw new Error('All eligible shards are busy or full');
  }
  release(id){this.pending.delete(id);}
  async run(task,{available=()=>[true,true,true,true],refresh,isConflict,retries=2}={}){
    for(let attempt=0;attempt<=retries;attempt++){
      const id=this.reserve(available());
      try{return await task(id);}
      catch(error){if(attempt===retries||!isConflict?.(error))throw error;await refresh(id);}
      finally{this.release(id);}
    }
  }
}
module.exports={CKB,STORAGE,RESERVE,le,hex,raw,ticket,shard,parseShard,pool,payout,Router};
