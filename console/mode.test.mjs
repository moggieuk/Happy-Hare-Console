import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {detectConnection, telemetryAvailable, hasMmuConfig, versionProblem, versionAtLeast} from './simulator.js';
import {connectionControls} from './telemetry-stream.js';
const app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
const isSimulator=app.match(/function isSimulator\(\) \{.*\}/)[0];
const initialize=app.slice(app.indexOf('async function initializeConnection()'),app.indexOf('async function subscribeLive()'));
async function connection(kind,chosen=false,mode='live',offline=false,components=[]) {
 const calls=[];
 const c=vm.createContext({store:{connectionGeneration:1,modeChosen:chosen,viewMode:mode,setup:null,offline,socket:{readyState:1}},
   rpc:async method=>{ if (method==='server.info') return {components};
     if (kind!=='simulator') throw Error(`Method not found: ${method}`); return {units:[]}; },
   detectConnection,telemetryAvailable,versionProblem:async()=>null,$:()=>({value:'0'}),sourceMode:()=>{},setConnection:()=>{},refreshLiveEditor:async()=>{},message:()=>{},
   refresh:async probed=>{c.store.setup=probed;},
   startStream:async()=>calls.push('telemetry'),
   changeView:async mode=>calls.push(mode),subscribeLive:async()=>calls.push('subscribe')});
 vm.runInContext(isSimulator+initialize,c);await vm.runInContext('initializeConnection()',c);return calls;
}
test('simulator and a printer with telemetry default to the stream, a printer without it to subscriptions',async()=>{
 assert.deepEqual(await connection('simulator'),['playback']);
 assert.deepEqual(await connection('live_machine'),['subscribe']);
 assert.deepEqual(await connection('live_machine',false,'live',false,['mmu_telemetry']),['playback']);
 assert.deepEqual(await connection('live_machine',true,'live',false,['mmu_telemetry']),['subscribe']);
});
test('the connection panel shows what the source in use allows',()=>{
 const show=o=>connectionControls({connected:true,offline:false,viewMode:'playback',telemetryAvailable:true,records:0,...o});
 const printer=show({kind:'live_machine',telemetryAvailable:false,viewMode:'live'});
 assert.deepEqual([printer.sourceRow,printer.telemetryOption,printer.hint,printer.save,printer.simulator],[true,false,true,false,false]);
 const stream=show({kind:'live_machine'});
 assert.deepEqual([stream.telemetryOption,stream.hint,stream.save,stream.saveEnabled],[true,false,true,false]);
 assert.equal(show({kind:'live_machine',records:3}).saveEnabled,true);
 const sim=show({kind:'simulator'});
 assert.deepEqual([sim.sourceRow,sim.simulator,sim.save],[true,true,true]);
 const file=show({kind:'simulator',offline:true,records:5});
 assert.deepEqual([file.sourceRow,file.simulator,file.save,file.saveEnabled],[false,false,true,true]);
 const unknown=show({kind:undefined});
 assert.deepEqual([unknown.sourceRow,unknown.save,unknown.simulator],[false,false,false]);
});
test('reconnect preserves explicitly selected live or playback mode',async()=>{
 assert.deepEqual(await connection('simulator',true,'live'),['subscribe']);
 assert.deepEqual(await connection('simulator',true,'playback'),['telemetry']);
 assert.deepEqual(await connection('live_machine',true,'playback'),['telemetry']);
});

const warning=app.slice(app.indexOf('function renderWarning('),app.indexOf('const RPC_TIMEOUT_MS'));
test('the subscription note is information that gives way, the amber box is for ambiguous status, and both clear on mode and connection changes',()=>{
 const nodes={'filament-warning':{},'filament-warning-message':{},'filament-notice':{},'filament-notice-message':{}};
 let clock=1000;
 const c=vm.createContext({store:{viewMode:'live',offline:false,socket:{readyState:1},setup:{connection_kind:'simulator'}},$:id=>nodes[id],
  NOTE_MS:10000,performance:{now:()=>clock},showAlert:(id,text)=>{ nodes[id].hidden=!text; nodes[`${id}-message`].textContent=text; }});
 vm.runInContext(isSimulator+warning,c);
 const draw=()=>vm.runInContext('renderWarning()',c);
 draw();assert.equal(nodes['filament-warning'].hidden,true);
 assert.match(nodes['filament-notice-message'].textContent,/subscriptions may skip/);
 assert.equal(nodes['filament-notice'].hidden,false);
 vm.runInContext("renderWarning(['IN BOWDEN but the toolhead sensor is triggered'])",c);
 assert.equal(nodes['filament-warning-message'].textContent,'Status is ambiguous: IN BOWDEN but the toolhead sensor is triggered');
 assert.equal(nodes['filament-warning'].hidden,false);
 assert.equal(nodes['filament-notice'].hidden,true);   // Pushed out by the warning, and it stays out
 draw();assert.equal(nodes['filament-notice'].hidden,true);
 c.store.viewMode='playback';draw();assert.equal(nodes['filament-warning'].hidden,true);assert.equal(nodes['filament-notice'].hidden,true);
 vm.runInContext("renderWarning(['sensor conflict'])",c);
 assert.match(nodes['filament-warning-message'].textContent,/sensor conflict/);
 assert.equal(nodes['filament-notice'].hidden,true);
 vm.runInContext("renderWarning([], 'Selector: moved')",c);
 assert.equal(nodes['filament-notice-message'].textContent,'Selector: moved');
 assert.equal(nodes['filament-notice'].hidden,false);assert.equal(nodes['filament-warning'].hidden,true);
 vm.runInContext("renderWarning(['sensor conflict'], 'Selector: moved')",c);   // Each in its own box
 assert.equal(nodes['filament-notice-message'].textContent,'Selector: moved');
 assert.equal(nodes['filament-warning-message'].textContent,'Displayed tip adjusted to sensor readings: sensor conflict');
 assert.equal(nodes['filament-notice'].hidden,false);assert.equal(nodes['filament-warning'].hidden,false);
 c.store.viewMode='live';c.store.setup.connection_kind='live_machine';draw();assert.equal(nodes['filament-notice'].hidden,false);
 assert.match(nodes['filament-notice-message'].textContent,/^Status subscriptions may skip/);
 clock+=9000;draw();assert.equal(nodes['filament-notice'].hidden,false);
 clock+=2000;draw();assert.equal(nodes['filament-notice'].hidden,true);   // A reminder, not a fixture
 c.store.socket.readyState=3;draw();c.store.socket.readyState=1;draw();assert.equal(nodes['filament-notice'].hidden,false);
 c.store.setup.connection_kind='simulator';c.store.socket.readyState=3;draw();
 assert.equal(nodes['filament-notice'].hidden,true);assert.equal(nodes['filament-warning'].hidden,true);
});

test('an uploaded folder is a configuration only when it holds mmu.cfg',()=>{
 assert.equal(hasMmuConfig(['cfg/mmu/base/mmu.cfg','cfg/printer.cfg']),true);
 assert.equal(hasMmuConfig(['mmu.cfg']),true);
 assert.equal(hasMmuConfig(['cfg/mmu/base/mmu_hardware.cfg','cfg/printer.cfg']),false);
});

test('a source older than the required Happy Hare, or without it, is a problem; one that cannot answer is not',async()=>{
 const source=(version,objects=['mmu_machine'])=>async method=>method==='printer.objects.list' ? {objects} : {status:{mmu_machine:{happy_hare_version:version}}};
 assert.equal(await versionProblem(source('4.3.0')),null);
 assert.equal(await versionProblem(source('4.10.1')),null);
 assert.match(await versionProblem(source('4.2.0')),/This is Happy Hare 4\.2\.0\. The Console needs 4\.3\.0 or later/);
 assert.match(await versionProblem(source(null,['mmu'])),/Happy Hare was not found/);
 assert.equal(await versionProblem(async()=>{throw Error('Klippy Disconnected');}),null);
 assert.equal(versionAtLeast('5.0','4.3.0'),true);assert.equal(versionAtLeast('4.3','4.3.0'),true);assert.equal(versionAtLeast('3.99.9','4.3.0'),false);
});

test('reconnect leaves loaded recordings offline',async()=>{
 assert.deepEqual(await connection('simulator',true,'playback',true),[]);
 assert.deepEqual(await connection('live_machine',true,'playback',true),[]);
});

test('a failed simulator probe is a live machine and nothing else calls sim.* afterwards',async()=>{
 const methods=[];
 const live=await detectConnection(async method=>{methods.push(method);throw Error('Method not found');},2);
 assert.equal(live.connection_kind,'live_machine');assert.deepEqual(methods,['sim.console.setup']);
 const sim=await detectConnection(async(method,params)=>({units:[],unit:params.unit}),1);
 assert.equal(sim.connection_kind,'simulator');assert.equal(sim.unit,1);
});

test('a simulator too busy to answer the probe in time is asked again, not taken for a printer',async()=>{
 let calls=0;
 const sim=await detectConnection(async()=>{ if (++calls<3) throw Error('sim.console.setup timed out'); return {units:[]}; });
 assert.equal(sim.connection_kind,'simulator');assert.equal(calls,3);
});

test('a command from elsewhere never pulls a paused view back to live; one typed in the console follows it',()=>{
 const handler=app.slice(app.indexOf('data.method === "notify_gcode_command"'),app.indexOf('data.method === "notify_gcode_response"'));
 assert.ok(!handler.includes('followLive'));
 const send=app.slice(app.indexOf('function sendScript('),app.indexOf('$("command-form").onsubmit'));
 assert.match(send,/followLive\(\)/);
 const form=app.slice(app.indexOf('$("command-form").onsubmit'),app.indexOf('$("restart").onclick'));
 assert.match(form,/sendScript\(script\)/);
});
