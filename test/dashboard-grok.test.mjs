import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { renderPage } from '../src/page.js';

// Execute the dashboard renderer with a minimal DOM; no provider credentials or network needed.
test('main dashboard shows Grok weekly usage, errors and connects inside the card', () => {
  class Element {
    constructor(tag) { this.tagName=tag;this.children=[];this.attrs={};this.listeners={}; }
    setAttribute(k,v) {this.attrs[k]=v;}
    addEventListener(k,v) {this.listeners[k]=v;}
    append(...children) {this.children.push(...children);}
    replaceChildren(...children) {this.children=children;}
  }
  const cards=new Element('div'),refresh=new Element('button');
  const document={activeElement:null,createElement:tag=>new Element(tag),querySelector:s=>s==='#cards'?cards:refresh,querySelectorAll:()=>[]};
  const data={now:Math.floor(Date.now()/1000),grok:{connected:true,usage:{ok:true,fetched_at:Math.floor(Date.now()/1000),windows:[{label:'주간',used_percent:7,resets_at:1795305600}]}}};
  const html=renderPage({authed:true});
  let script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
  script=script.slice(0,script.lastIndexOf('$("#refresh").addEventListener'));
  function render(provider) {
    runInNewContext(script+'\nstate = fixture; render();',{document,fixture:{...data,grok:provider},sessionStorage:{getItem:()=>null},setTimeout(){},clearTimeout(){}});
    return cards.children.find(c=>c.children.some(h=>h.children?.some(n=>n.children?.includes('Grok'))));
  }
  const descend=n=>[n,...(n.children||[]).flatMap(c=>typeof c==='object'?descend(c):[])];
  let card=render(data.grok);assert.ok(card,'Grok is on the main dashboard');
  let nodes=descend(card),text=nodes.flatMap(n=>n.children.filter(c=>typeof c==='string'));
  assert.ok(text.includes('주간'));assert.ok(text.includes('7'));assert.ok(!text.includes('5시간'));
  assert.match(nodes.find(n=>n.tagName==='img').attrs.src,/^data:image\/png;base64,/);
  // 연결·다시 연결은 다른 화면으로 가는 링크가 아니라 카드 안에서 시작하는 버튼이에요.
  card=render({connected:false,usage:null});nodes=descend(card);text=nodes.flatMap(n=>n.children.filter(c=>typeof c==='string'));
  assert.ok(text.includes('연결 안 됨'));
  let button=nodes.find(n=>n.children.includes('연결하기'));
  assert.equal(button.tagName,'button');assert.equal(typeof button.listeners.click,'function');assert.equal(button.attrs.href,undefined);
  card=render({...data.grok,usage:{...data.grok.usage,ok:false,error:'다시 승인해 주세요',needs_reconnect:true}});nodes=descend(card);
  button=nodes.find(n=>n.children.includes('다시 연결'));
  assert.equal(button.tagName,'button');assert.equal(typeof button.listeners.click,'function');
  assert.ok(nodes.some(n=>n.children.some(c=>typeof c==='string'&&c.includes('다시 승인해 주세요'))));
});
