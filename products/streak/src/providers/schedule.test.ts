import assert from 'assert/strict';
import { ApiFootballProvider } from './football';

async function main(): Promise<void> {
  const originalFetch=global.fetch;
  const originalEnv={...process.env};
  process.env.API_SPORTS_KEY='synthetic-test-only';
  process.env.FOOTBALL_LEAGUE_IDS='39,140';
  process.env.FOOTBALL_FIXTURE_PAST_DAYS='0';
  const calls:URL[]=[];
  let failed=false;
  global.fetch=async input=>{
    const url=new URL(String(input));calls.push(url);
    if(failed && url.searchParams.get('league')==='140')return new Response('{}',{status:503});
    return new Response(JSON.stringify({response:['NS','FT','PST'].map((status,i)=>({
      fixture:{id:Number(url.searchParams.get('league'))*10+i,date:'2026-10-16T12:00:00Z',status:{short:status}},
      league:{id:Number(url.searchParams.get('league')),name:'Synthetic competition',logo:'https://example.test/league.png'},
      teams:{home:{id:1,name:'Home',logo:'https://example.test/home.png'},away:{id:2,name:'Away',logo:'https://example.test/away.png'}},
    }))}),{headers:{'content-type':'application/json'}});
  };
  try {
    const provider=new ApiFootballProvider();
    await provider.init();
    assert.equal(calls.length,2);
    const today=new Date().toISOString().slice(0,10);
    assert.ok(Date.parse(today)-Date.parse(calls[0].searchParams.get('from')!)>=4*86400000,'Even a low configuration retains Friday with UTC margin on Monday.');
    assert.equal(provider.loadFixtures().length,2,'Settlement admission catalogue stays unchanged.');
    assert.equal(provider.scheduleFixtures().length,6,'Read-only schedule includes final and postponed fixtures.');
    assert.equal(provider.scheduleFixtures()[0].home.logo,'https://example.test/home.png');
    assert.equal(provider.scheduleCoverage()?.complete,true);
    failed=true;
    await provider.init();
    assert.equal(provider.scheduleCoverage()?.complete,false,'A partial league failure cannot claim full schedule coverage.');
    assert.equal(provider.scheduleFixtures().length,6,'Retain cached fixture evidence on partial failure.');
    console.log('Schedule passed: minimum lookback, full read-only catalogue, API logos, bounded requests and partial-coverage reporting.');
  } finally {
    global.fetch=originalFetch;
    for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];
    Object.assign(process.env,originalEnv);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
