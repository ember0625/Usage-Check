import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { startDevice, pollDevice, publicDevice, normalize, refreshTokens, requestUsage, tokensFromResponse, CLIENT_ID } from "../src/grok-protocol.js";
import { AuthExpiredError } from "../src/util.js";
import { renderGrokPage } from "../src/grok-page.js";
const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });
const now = () => Math.floor(Date.now()/1000);
const pending = () => ({device_code:'private-device',user_code:'ABCD-1234',url:'https://accounts.x.ai/oauth2/device',interval:5,next_poll:now()-1,expires_at:now()+600});
const fixture = (percent = 42.5) => ({ config:{creditUsagePercent:percent,currentPeriod:{type:'USAGE_PERIOD_TYPE_WEEKLY',end:'2026-11-22T00:00:00Z'},private:'drop-me'} });

test('Grok device start pins endpoints, minimizes scopes and never returns the private device code', async () => {
  globalThis.fetch = async (url, opts) => {
    assert.equal(url,'https://auth.x.ai/oauth2/device/code'); assert.equal(opts.redirect,'manual');
    assert.equal(opts.body.get('client_id'),CLIENT_ID); assert.equal(opts.body.get('scope'),'openid offline_access grok-cli:access');
    return Response.json({device_code:'private-device',user_code:'ABCD-1234',verification_uri:'https://accounts.x.ai/oauth2/device',expires_in:1800,interval:5});
  };
  const d=await startDevice(); assert.equal(d.interval,5); assert.equal(publicDevice(d).device_code,undefined);
  assert.ok(!JSON.stringify(publicDevice(d)).includes('private-device'));
  globalThis.fetch=async()=>Response.json({device_code:'secret',user_code:'ABCD',verification_uri:'https://attacker.test/',expires_in:900});
  await assert.rejects(startDevice());
});

test('poll respects interval and expiry; slowdown persists and denials do not reflect upstream secrets', async () => {
  let calls=0; globalThis.fetch=async()=>{calls++;return Response.json({error:'slow_down',error_description:'secret-upstream'},{status:400});};
  const d=pending(); assert.equal((await pollDevice({...d,next_poll:now()+10})).pending.next_poll>now(),true);assert.equal(calls,0);
  assert.equal((await pollDevice({...d,expires_at:now()-1})).terminal,true);assert.equal(calls,0);
  const slow=await pollDevice(d); assert.equal(slow.pending.interval,10);assert.ok(slow.pending.next_poll>=now()+10);
  globalThis.fetch=async()=>Response.json({error:'access_denied',error_description:'secret-upstream'},{status:400});
  const denied=await pollDevice(d);assert.equal(denied.terminal,true);assert.ok(!JSON.stringify(denied).includes('secret-upstream'));
});

test('Grok usage reads weekly percentage without rescaling or inventing a 5-hour limit', () => {
  for(const percent of [0,0.5,42.5,100]) {
    const u=normalize(fixture(percent));assert.equal(u.windows.length,1);assert.equal(u.windows[0].used_percent,percent);
    assert.equal(u.windows[0].resets_at,1795305600);assert.ok(!JSON.stringify(u).includes('drop-me'));
  }
  for(const d of [null,{},fixture('42'),fixture(null),fixture(NaN),fixture(101),{config:{creditUsagePercent:3,currentPeriod:{type:'UNKNOWN',end:'2026-11-22'}}}]) assert.throws(()=>normalize(d));
});

test('refresh keeps an unrotated token, stores rotations and distinguishes terminal auth from transient failures', async () => {
  const previous={access_token:'old',refresh_token:'refresh-old',expires_at:1};
  globalThis.fetch=async (url,opts)=>{assert.equal(opts.body.get('refresh_token'),'refresh-old');return Response.json({access_token:'new',expires_in:3600});};
  assert.equal((await refreshTokens(previous)).refresh_token,'refresh-old');
  globalThis.fetch=async()=>Response.json({access_token:'new',refresh_token:'rotated',expires_in:3600});
  assert.equal((await refreshTokens(previous)).refresh_token,'rotated');
  globalThis.fetch=async()=>Response.json({error:'invalid_grant',error_description:'private-token'},{status:400});
  await assert.rejects(refreshTokens(previous),e=>e instanceof AuthExpiredError && !e.message.includes('private-token'));
  globalThis.fetch=async()=>new Response('private-token',{status:503});
  await assert.rejects(refreshTokens(previous),e=>!(e instanceof AuthExpiredError) && !e.message.includes('private-token'));
  assert.throws(()=>tokensFromResponse({access_token:'new'}));
});

test('billing request sends bearer only to the pinned provider and generated phone page parses', async () => {
  globalThis.fetch=async(url,opts)=>{assert.equal(url,'https://cli-chat-proxy.grok.com/v1/billing?format=credits');assert.equal(opts.redirect,'manual');
    assert.equal(opts.headers.Authorization,'Bearer test-token');assert.equal(opts.headers['X-XAI-Token-Auth'],'xai-grok-cli');return Response.json(fixture());};
  assert.equal((await requestUsage({access_token:'test-token'})).status,200);
  for(const m of renderGrokPage().matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(()=>new Function(m[1]));
});
