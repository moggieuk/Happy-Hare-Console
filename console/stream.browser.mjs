// Optional browser integration: node --test console/stream.browser.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {liveObjects} from './live-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
test('printer telemetry arrives by subscription and stops when leaving playback',async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try {
  const page=await browser.newPage(), errors=[],calls=[];
  page.on('pageerror',e=>errors.push(e.message));
  const records=JSON.parse(readFileSync(new URL('./fixtures/emu.json',import.meta.url)));
  const status=liveObjects();
  let socket;
  const batch=(items,delivery,reset=false)=>({stream_id:'browser-test',delivery_id:delivery,reset,records:items});
  await page.routeWebSocket('**/websocket',ws=>{
   socket=ws;
   ws.onMessage(text=>{
    const req=JSON.parse(text);calls.push(req.method);let result={};
    if(req.method==='server.info') result={moonraker_version:'v0.9.3',components:['mmu_telemetry']};
    else if(req.method==='printer.objects.list') result={objects:Object.keys(status)};
    else if(req.method==='printer.objects.query'||req.method==='printer.objects.subscribe') result={status,eventtime:1};
    else if(req.method==='server.mmu.telemetry.subscribe') result=batch(records.slice(0,20),1,true);
    else if(!req.method.startsWith('server.mmu.telemetry.')) {ws.send(JSON.stringify({id:req.id,error:{message:'Method not found'}}));return;}
    ws.send(JSON.stringify({id:req.id,result}));
   });
  });
  await page.route('http://console.test/**',route=>{
   const name=new URL(route.request().url()).pathname.split('/').at(-1)||'index.html';
   assert.notEqual(name,'telemetry');
   route.fulfill({body:readFileSync(new URL('./'+name,import.meta.url)),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'});
  });
  await page.goto('http://console.test/');
  await page.locator('#scene [data-part="espooler"]').first().waitFor();
  await page.waitForFunction(()=>document.querySelector('#trace').textContent.includes('move'));   // A printer with telemetry starts on the stream
  assert.equal(await page.locator('#view-mode').inputValue(),'playback');
  assert.equal(calls.filter(c=>c==='server.mmu.telemetry.ack').length,1);
  const before=await page.locator('#trace').textContent();
  socket.send(JSON.stringify({method:'notify_mmu_telemetry',params:[batch(records.slice(20),2)]}));
  await page.waitForTimeout(250);
  assert.notEqual(await page.locator('#trace').textContent(),before);
  assert.equal(calls.filter(c=>c==='server.mmu.telemetry.ack').length,2);
  await page.locator('#live').click();
  await page.waitForFunction(()=>document.querySelector('#console-live').classList.contains('active'));
  // While following the stream at rest, subscribed sensor readings are overlaid on the recorded state
  socket.send(JSON.stringify({method:'notify_status_update',params:[{mmu:{sensors:{mmu_entry:true,encoder:false}}},2]}));
  await page.waitForTimeout(150);
  await page.locator('#previous').click();
  await page.waitForFunction(()=>!document.querySelector('#console-live').classList.contains('active'));
  await page.locator('#view-mode').selectOption('live');
  await page.waitForTimeout(100);
  assert.ok(calls.includes('server.mmu.telemetry.unsubscribe'));
  await page.locator('#view-mode').selectOption('playback');
  await page.locator('#telemetry-file').setInputFiles(new URL('./fixtures/emu.json',import.meta.url).pathname);
  await page.waitForFunction(()=>document.querySelector('#source-row').hidden);
  const subscribed=calls.filter(c=>c==='server.mmu.telemetry.subscribe').length;
  socket.send(JSON.stringify({method:'notify_klippy_ready',params:[]}));
  await page.waitForTimeout(100);
  assert.equal(calls.filter(c=>c==='server.mmu.telemetry.subscribe').length,subscribed);
  assert.equal(await page.locator('#source-row').isVisible(),false);
  assert.equal(await page.locator('#console-live').getAttribute('aria-label'),'Not live');
  assert.deepEqual(errors,[]);
 } finally {await browser.close();}
});
