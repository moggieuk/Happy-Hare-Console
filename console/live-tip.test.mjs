import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveTip,tipRange,lastingWarnings} from './live-tip.js';
import {LiveState,liveDuration,liveSteady} from './live-state.js';
import {bowdenLengthLabel,bowdenProgressLabel} from './playback.js';
import {liveObjects as status} from './live-fixture.mjs';

// A 700mm Bowden from a gate sensor at 0: extruder sensor 690, gears 700, toolhead sensor 730, nozzle 750
const at=pos=>({'-1':-20,0:-10,1:0,2:0,3:350,4:700,5:690,6:700,7:715,8:730,9:740,10:750})[pos];
const scene=(sensors={},extra={})=>({unit:'u',gate:0,gate_status:[2],retained_segment:null,encoder_reference:{endstop:'mmu_exit'},
 sensors:Object.fromEntries(Object.entries({mmu_exit_0:[0],extruder:[690],toolhead:[730],...sensors}).filter(([,v])=>v[1]!==undefined)
  .map(([name,[position,state]])=>[`u:${name}`,{position,state,enabled:true,assumed:false}])),...extra});
const run=(steps,s=scene())=>{
 let memory=null;
 return steps.map(step=>{
  const r=resolveTip(memory,{bowden_progress:-1,...step},step.scene || s,at,0);
  memory=r.memory;return r;
 });
};

test('each state has a reference place, and a state with a span keeps a tip already inside it',()=>{
 assert.deepEqual([0,1,3,5,6,8,10].map(pos=>run([{filament_pos:pos}])[0].tip),[-10,0,350,690,700,730,750]);
 assert.deepEqual(tipRange(9,at),[730,750,740]);
 const tips=run([{filament_pos:2},{filament_pos:2,bowden_progress:90},{filament_pos:4}]).map(r=>r.tip);
 assert.deepEqual(tips,[0,630,630]);
});
test('filament_position moves the tip only within a state, never while homing, and not past the state',()=>{
 const tips=run([{filament_pos:9,filament_position:-10},{filament_pos:9,filament_position:-15},
  {filament_pos:9,filament_position:185,homing:{endstops:[],triggered:true}},{filament_pos:9,filament_position:-18},
  {filament_pos:9,filament_position:-500},{filament_pos:3,filament_position:-900}]).map(r=>r.tip);
 assert.deepEqual(tips,[740,735,735,732,730,350]);
});
test('an unload driven by Bowden progress never moves the tip forward',()=>{
 const tips=run([{filament_pos:10},{filament_pos:9},{filament_pos:5},{filament_pos:3,bowden_progress:100},
  {filament_pos:3,bowden_progress:50},{filament_pos:3,bowden_progress:6},{filament_pos:3},{filament_pos:1},{filament_pos:0}]).map(r=>r.tip);
 assert.deepEqual(tips,[750,740,690,700,350,42,42,0,-10]);
 assert.ok(tips.slice(4).every((tip,i,all)=>i===0 || tip<=all[i-1]));
});
test('sensors hold the tip and a state they contradict is reported',()=>{
 const held=run([{filament_pos:3}],scene({toolhead:[730,false],extruder:[690,false],mmu_exit_0:[0,true]}))[0];
 assert.deepEqual([held.tip,held.warnings],[350,[]]);
 const early=run([{filament_pos:3}],scene({toolhead:[730,true]}))[0];
 assert.equal(early.tip,730);assert.deepEqual(early.warnings,['IN BOWDEN but the toolhead sensor is triggered']);
 const late=run([{filament_pos:3}],scene({mmu_exit_0:[0,false]}))[0];
 assert.equal(late.tip,0);assert.deepEqual(late.warnings,['IN BOWDEN but the mmu_exit sensor is clear']);
 assert.deepEqual(run([{filament_pos:10}],scene({toolhead:[730,false]}))[0].warnings,['LOADED IN NOZZLE but the toolhead sensor is clear']);
 // Homing back to a sensor leaves it clear; a parked filament says nothing; the retained fragment explains the toolhead sensor
 assert.deepEqual(run([{filament_pos:8}],scene({toolhead:[730,false]}))[0].warnings,[]);
 assert.deepEqual(run([{filament_pos:0}],scene({mmu_exit_0:[0,false]}))[0].warnings,[]);
 assert.deepEqual(run([{filament_pos:0}],scene({toolhead:[730,true]},{retained_segment:{start:725,end:745}}))[0],
  {tip:-10,warnings:[],memory:{unit:'u',gate:0,pos:0,filamentPosition:undefined,tip:-10}});
 assert.deepEqual(run([{filament_pos:3}],scene({toolhead:[730,true],extruder:[690,false]}))[0].warnings,
  ['IN BOWDEN but the toolhead sensor is triggered','presence sensors disagree']);
 assert.deepEqual(run([{filament_pos:-1}])[0].warnings,['filament position is unknown']);
 assert.deepEqual(run([{filament_pos:3}],scene({},{gate_status:[0]}))[0].warnings,['IN BOWDEN but the gate is marked empty']);
 assert.deepEqual(run([{filament_pos:6,bowden_progress:40}])[0].warnings,['EXTRUDER ENTRY but Bowden progress is reported']);
});
test('a gate sensor the gate does not home on has no known place, so only its being clear is evidence',()=>{
 const shared={encoder_reference:{endstop:'unit0:mmu_shared_exit'}};
 const parked=run([{filament_pos:0}],scene({mmu_exit_0:[0,true]},shared))[0];
 assert.deepEqual([parked.tip,parked.warnings],[-10,[]]);
 assert.deepEqual(run([{filament_pos:3}],scene({mmu_exit_0:[0,false]},shared))[0],
  {tip:350,warnings:['IN BOWDEN but the mmu_exit sensor is clear'],memory:{unit:'u',gate:0,pos:3,filamentPosition:undefined,tip:350}});
});
test('a disagreement is shown once it has lasted, at once when idle, and forgotten when it goes',()=>{
 const seen=new Map();
 assert.deepEqual(lastingWarnings(seen,['a'],0,false),[]);
 assert.deepEqual(lastingWarnings(seen,['a','b'],1000,false),['a']);
 assert.deepEqual(lastingWarnings(seen,['b'],1500,true),['b']);
 assert.deepEqual(lastingWarnings(seen,['a'],1600,false),[]);
});
test('the live snapshot carries the resolved tip, its warnings and steps of filament_position',()=>{
 const r=new LiveState();r.accept(status(),1);
 const loaded={mmu_entry:true,encoder:false,extruder:true,toolhead:true};
 const a=r.accept({mmu:{filament_pos:9,filament_position:-20,sensors:loaded}},2);
 const b=r.accept({mmu:{filament_position:-22}},3);
 assert.equal(a.tip_resolved,true);assert.deepEqual(b.live_warnings,[]);
 assert.equal(b.tips[b.gate],a.tips[a.gate]-2);
 assert.deepEqual(r.accept({mmu:{filament_pos:3,sensors:{...loaded,extruder:false}}},4).live_warnings,
  ['IN BOWDEN but the toolhead sensor is triggered','presence sensors disagree']);
});
test('a movement lasts as long as the updates are apart, a long step sweeps, and an update that moves nothing does not restart it',()=>{
 const state=tip=>({unit:'u',gate:0,tips:[tip],devices:{b:{travel:1}},motors:{}});
 assert.equal(liveDuration(state(0),state(10),0),300);
 assert.equal(liveDuration(state(0),state(10),500),600);
 assert.equal(liveDuration(state(0),state(10),5000),1200);
 assert.equal(liveDuration(state(0),state(700),250),1500);
 assert.equal(liveSteady(state(5),state(5)),true);
 assert.equal(liveSteady(state(5),state(6)),false);
 assert.equal(liveSteady(state(5),{...state(5),devices:{b:{travel:2}}}),false);
});
test('the Bowden label reports progress only for a status that carries it',()=>{
 assert.equal(bowdenProgressLabel({bowden_progress:42}),'42% travelled');
 assert.equal(bowdenProgressLabel({bowden_progress:-1}),'');
 assert.equal(bowdenProgressLabel({}),'');
 assert.match(bowdenLengthLabel({gate:-1}),/Uncalibrated/);
});
