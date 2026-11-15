import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

test('Grok phone login, concurrent polls, automatic refresh, failure cache and disconnect work through the Worker', async () => {
  const built=await build({entryPoints:['src/index.js'],bundle:true,write:false,format:'esm',external:['cloudflare:workers']});
  let deviceCalls=0,tokenCalls=0,refreshCalls=0,billingCalls=0,billingFailure=false;
  const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'grok-test',modules:true,script:built.outputFiles[0].text,
    compatibilityDate:'2026-09-01',kvNamespaces:['KV'],durableObjects:{TOKENS:{className:'TokenStore',useSQLite:true}},
    bindings:{DASHBOARD_PASSWORD:'test'},outboundService:async request=>{
      const url=new URL(request.url);
      if(url.pathname==='/oauth2/device/code') {deviceCalls++;return Response.json({device_code:'private-device',user_code:'ABCD-1234',verification_uri:'https://accounts.x.ai/oauth2/device',expires_in:900,interval:1});}
      if(url.pathname==='/oauth2/token') {
        const form=new URLSearchParams(await request.text());
        if(form.get('grant_type')==='refresh_token') {refreshCalls++;assert.equal(form.get('refresh_token'),'private-refresh');
          return Response.json({access_token:'rotated-access',refresh_token:'rotated-refresh',expires_in:3600});}
        tokenCalls++;assert.equal(form.get('device_code'),'private-device');
        return Response.json({access_token:'private-access',refresh_token:'private-refresh',expires_in:3600});
      }
      if(url.hostname==='cli-chat-proxy.grok.com') {billingCalls++;assert.match(request.headers.get('Authorization'),/^Bearer (private-access|rotated-access)$/);
        if(billingFailure) return new Response('private-error',{status:503});
        return Response.json({config:{creditUsagePercent:8,currentPeriod:{type:'USAGE_PERIOD_TYPE_WEEKLY',end:'2026-11-22T00:00:00Z'}}});}
      throw new Error('Unexpected request '+url.origin+url.pathname);
    }}]}));
  try {
    const kv=await mf.getKVNamespace('KV');await kv.put('session:s','1');await kv.put('widget:key','w');
    const ns=await mf.getDurableObjectNamespace('TOKENS'),store=ns.get(ns.idFromName('main'));
    const api=(action,method='POST')=>mf.dispatchFetch('https://worker.test/api/grok/'+action,{method,headers:{Cookie:'uc_session=s','Content-Type':'application/json'},...(method==='POST'?{body:'{}'}:{})});
    assert.equal((await mf.dispatchFetch('https://worker.test/api/grok/start',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
    assert.equal((await mf.dispatchFetch('https://worker.test/api/grok/start',{method:'POST',headers:{Cookie:'uc_session=s'},body:'{}'})).status,415);
    assert.equal(deviceCalls,0);
    assert.equal((await mf.dispatchFetch('https://worker.test/grok',{headers:{Cookie:'uc_session=s'}})).status,200);
    const starts=await Promise.all([api('start'),api('start')]);const start=await starts[0].json();await starts[1].json();
    assert.equal(deviceCalls,1,JSON.stringify(start));assert.equal(start.pending,true);assert.ok(!JSON.stringify(start).includes('private-device'));
    assert.equal((await (await api('poll')).json()).pending,true);assert.equal(tokenCalls,0);
    await new Promise(resolve=>setTimeout(resolve,1100));
    const polls=await Promise.all([api('poll'),api('poll')]);for(const p of polls) assert.equal((await p.json()).ok,true);
    assert.equal(tokenCalls,1);
    let status=await (await api('status','GET')).json();assert.equal(status.connected,true);assert.equal(status.usage.windows[0].used_percent,8);
    assert.ok(!JSON.stringify(status).includes('private-'));
    // The token manager must refresh only once even when two requests see an expired token.
    const t=await store.read('grok');await store.write('grok',{...t,expires_at:1});
    await Promise.all([api('refresh'),api('refresh')]);assert.equal(refreshCalls,1);
    const good=(await (await api('status','GET')).json()).usage;
    billingFailure=true;status=await (await api('refresh')).json();assert.equal(status.usage.ok,false);
    assert.equal(status.usage.fetched_at,good.fetched_at);assert.equal(status.usage.windows[0].used_percent,8);assert.ok(!JSON.stringify(status).includes('private-error'));
    billingFailure=false;
    const widget=await (await mf.dispatchFetch('https://worker.test/api/widget?key=w&refresh=1&force=1')).json();
    assert.equal(widget.grok.windows[0].used_percent,8);assert.equal(widget.grok.ok,true);assert.ok(!JSON.stringify(widget).includes('private-'));
    assert.ok(billingCalls>=4);
    await api('disconnect');status=await (await api('status','GET')).json();assert.equal(status.connected,false);assert.equal(status.usage,null);assert.equal(await store.read('grok'),null);
  } finally {await mf.dispose();}
});
