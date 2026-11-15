export function renderGrokPage() {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Grok 연결 · AI 사용량</title><style>
:root{color-scheme:light dark;font:16px -apple-system,BlinkMacSystemFont,sans-serif;background:light-dark(#f5f5f7,#161719);color:light-dark(#1d1d1f,#f5f5f7)}
body{max-width:520px;margin:0 auto;padding:32px 22px}a{color:light-dark(#0067c5,#8cc5ff)}
section{margin:24px 0;padding:24px;border-radius:20px;background:light-dark(#fff,#242528)}h1{font-size:28px}h2{font-size:18px;margin-top:0}p{line-height:1.6}
button,.approve{display:inline-block;font:inherit;padding:12px 18px;border:0;border-radius:12px;background:light-dark(#e9e9ec,#383a3d);color:inherit;margin:4px 8px 4px 0;text-decoration:none}button:disabled{opacity:.5}
.approve{background:#0071e3;color:white}#code{font-size:26px;letter-spacing:3px;font-weight:600}#message{white-space:pre-wrap}#value{font-size:32px;font-weight:600}small{opacity:.7}progress{width:100%;height:12px} [hidden]{display:none!important}
</style></head><body><a href="/">← 사용량 대시보드</a><h1>Grok 연결</h1>
<p>아이폰에서 로그인하고 승인하면 주간 사용량을 자동으로 조회해요.</p>
<section><h2 id="state">연결 상태 확인 중…</h2>
<button id="connect" disabled>Grok 연결</button><button id="disconnect" hidden>연결 해제</button>
<div id="approval" hidden><p>Grok 승인 화면의 코드가 아래 코드와 같은지 확인하세요. 개인 계정을 선택한 뒤 이 화면으로 돌아오세요.</p>
<div id="code"></div><a id="approve" class="approve" target="_blank" rel="noopener noreferrer">Grok에서 승인하기</a><p><small id="expiry"></small></p>
<button id="check">승인 완료 · 확인</button></div><p id="message" role="status"></p></section>
<section id="usage" hidden><h2>Grok 주간 사용량</h2><div id="value"></div><progress id="bar" max="100"></progress>
<p id="reset"></p><small id="updated"></small><p><button id="refresh">지금 갱신</button></p>
<small>Grok이 제공하는 구독 공용 사용량이에요. API 요금과는 별개이며 5시간 수치는 만들지 않아요.</small></section>
<p><small>로그인 정보는 서버에 보관하고 만료 전에 자동 갱신해요. 승인이 취소되거나 갱신이 거부되면 다시 연결해야 해요.</small></p>
<script>
const $ = (id) => document.getElementById(id);
let pending = false, polling = false, timer, nextPoll = 0, stopped = false;
const pendingKey = 'usage-check:grok:pending';
function remember(value) { try { if(value) sessionStorage.setItem(pendingKey, '1'); else sessionStorage.removeItem(pendingKey); } catch {} }
async function api(action, method = 'POST') {
  const r = await fetch('/api/grok/' + action, {method, credentials:'same-origin', cache:'no-store',
    headers: method === 'POST' ? {'Content-Type':'application/json'} : {}, ...(method === 'POST' ? {body:'{}'} : {})});
  if(r.status === 401) { stopped = true; clearTimeout(timer); throw new Error('사이트 로그인이 필요해요. 위의 대시보드 링크로 돌아가 로그인해 주세요.'); }
  const d = await r.json(); if(!r.ok) throw new Error(d.error || '연결하지 못했어요. 잠시 후 다시 시도해 주세요.'); return d;
}
function message(text) { $('message').textContent = text || ''; }
function showPending(d) {
  pending = true; remember(true); $('approval').hidden = false; $('code').textContent = d.user_code;
  $('approve').href = d.url; $('expiry').textContent = '코드 만료: ' + new Date(d.expires_at * 1000).toLocaleTimeString('ko-KR');
  $('state').textContent = 'Grok 승인 대기 중'; $('connect').disabled = true; $('disconnect').hidden = false;
  nextPoll = Date.now() + Math.max(1,d.interval || 5) * 1000;
  schedule();
}
function schedule() { clearTimeout(timer); if(pending && !stopped) timer = setTimeout(poll, Math.max(1000,nextPoll-Date.now())); }
function stopPending() { pending = false; remember(false); clearTimeout(timer); $('approval').hidden = true; $('connect').disabled = false; }
async function status(refresh = false) {
  const d = await api(refresh ? 'refresh' : 'status', refresh ? 'POST' : 'GET');
  if(!pending) { $('state').textContent = d.connected ? 'Grok 연결됨' : 'Grok 미연결'; $('connect').disabled = false;
    $('connect').textContent = d.connected ? '다시 로그인' : 'Grok 연결'; $('disconnect').hidden = !d.connected; }
  const u = d.usage, w = u?.windows?.[0]; $('usage').hidden = !w;
  if(w) { $('value').textContent = w.used_percent.toLocaleString('ko-KR',{maximumFractionDigits:1}) + '% 사용'; $('bar').value = w.used_percent;
    const mins = Math.max(0, Math.ceil((w.resets_at - d.now)/60)), days = Math.floor(mins/1440), hrs = Math.floor(mins%1440/60);
    $('reset').textContent = mins ? '초기화까지 ' + (days ? days + '일 ' : '') + hrs + '시간 ' + (mins%60) + '분' : '초기화 시각이 지났어요. 다시 조회해 주세요.';
    $('updated').textContent = (u.ok ? '최근 갱신 ' : '마지막 성공 ') + new Date(u.fetched_at*1000).toLocaleString('ko-KR'); }
  if(!pending) message(u?.error || (d.connected && !w ? '연결됐어요. 사용량을 조회하고 있어요.' : ''));
}
async function poll() {
  if(!pending || polling || stopped) return;
  if(document.hidden || Date.now()<nextPoll) { nextPoll = Math.max(nextPoll,Date.now()+1000); schedule(); return; }
  polling = true; nextPoll = Date.now()+5000;
  try { const d = await api('poll');
    if(d.error) { message(d.error); if(d.terminal) stopPending(); }
    else if(d.pending) { showPending(d); message('승인을 기다리고 있어요.'); }
    else { stopPending(); await status(); }
  } catch(e) { message(e.message); }
  finally { polling=false; schedule(); }
}
$('connect').onclick = async () => { $('connect').disabled=true; message('인증 코드를 요청하고 있어요…');
  try { const d=await api('start'); if(d.error) throw new Error(d.error); showPending(d); message('아래 버튼으로 승인한 뒤 돌아오세요.'); }
  catch(e) { message(e.message); $('connect').disabled=false; } };
$('check').onclick = poll;
$('refresh').onclick = async () => { $('refresh').disabled=true; try { await status(true); } catch(e) {message(e.message);} finally {$('refresh').disabled=false;} };
$('disconnect').onclick = async () => { if(!confirm('Grok 연결과 대기 중인 로그인을 해제할까요?')) return;
  $('disconnect').disabled=true;
  try { const d=await api('disconnect'); if(d.error) throw new Error(d.error); stopPending(); await status(); }
  catch(e) {message(e.message);} finally {$('disconnect').disabled=false;} };
document.addEventListener('visibilitychange', () => { if(!document.hidden) { if(pending) poll(); else if(!stopped) status().catch(e=>message(e.message)); } });
setInterval(() => { if(!document.hidden && !pending && !stopped) status().catch(e=>message(e.message)); }, 60000);
(async () => { try { await status(); let resume=false; try {resume=sessionStorage.getItem(pendingKey)==='1';} catch {}
  if(resume) { pending=true; await poll(); } } catch(e) {message(e.message);} })();
</script></body></html>`;
}
