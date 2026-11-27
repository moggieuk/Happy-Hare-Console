import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LiveState,liveFrame,liveMmuFields,purged,liveDuration} from './live-state.js';
import {liveObjects as status} from './live-fixture.mjs';
import {qualifySensors} from './live-config.js';
import {bowdenLengthLabel} from './playback.js';
test('live status needs no telemetry session or movement records',()=>{
 const r=new LiveState(),s=r.accept(status(),1);
 assert.equal(s.filament_pos,0);assert.equal(s.extruder_target_temperature,210);
 assert.equal(r.events,undefined);assert.equal(r.tips,undefined);
 assert.equal(s.devices[`${s.unit}:buffer`].value,-1);
});
test('live spool fill follows subscribed gate weights',()=>{
 const r=new LiveState();r.accept(status(),1);
 assert.deepEqual(r.accept({mmu:{gate_initial_weight:[1000,1000,-1],gate_remaining_weight:[750,0,-1]}},2)
  .spool_percentages.slice(0,3),[75,0,null]);
 assert.equal(r.accept({mmu:{gate_remaining_weight:[500,0,-1]}},3).spool_percentages[0],50);
});
test('Bowden progress sets the target, and a step of filament_position across a state change does not',()=>{
 const r=new LiveState();r.accept(status(),1);
 const s=r.accept({mmu:{filament_pos:3,bowden_progress:50,filament_position:99999}},2);
 const length=r.objects.save_variables.variables[`mmu_${s.unit}_bowden_lengths`][s.gate];
 assert.equal(s.tips[s.gate],s.layout.extruder_gears-length/2);
 const end=r.accept({mmu:{filament_pos:6,bowden_progress:-1,sensors:{mmu_entry:true,encoder:false,extruder:true,toolhead:false}}},3);
 assert.equal(end.tips[end.gate],end.layout.extruder_gears);
});
test('with a calibrated Bowden the live position carries the tip on from the gate park',()=>{
 const r=new LiveState();r.accept(status(),1);
 const parked=r.accept({mmu:{filament_position_live:0,filament_direction:1}},2);
 const s=r.accept({mmu:{filament_pos:3,filament_position_live:300,sensors:{mmu_entry:true,encoder:true,extruder:false,toolhead:false}}},3);
 assert.equal(s.tips[s.gate],parked.tips[parked.gate]+300);
});
test('an uncalibrated gate is labelled as one, drawn at a nominal length and not placed by the live position',()=>{
 const objects=status(),key=Object.keys(objects.save_variables.variables)[0];
 objects.save_variables.variables[key]=objects.save_variables.variables[key].map(()=>-1);
 const r=new LiveState();r.accept(objects,1);
 const parked=r.accept({mmu:{filament_position_live:0,filament_direction:1}},2);
 assert.match(bowdenLengthLabel(parked),/Uncalibrated/);
 assert.ok(parked.layout.extruder_gears>=700 && parked.layout.extruder_gears<=720);
 const s=r.accept({mmu:{filament_pos:3,filament_position_live:300,sensors:{mmu_entry:true,encoder:true,extruder:false,toolhead:false}}},3);
 assert.notEqual(s.tips[s.gate],parked.tips[parked.gate]+300);
});
test('dictionary fields replace rather than retain removed sensors',()=>{
 const r=new LiveState();r.accept(status(),1);
 const s=r.accept({mmu:{sensors:{}}},2);
 assert.deepEqual(s.sensors,{});
 assert.equal(r.accept({mmu:{gate:9}},1),null);
 assert.notEqual(r.objects.mmu.gate,9);
});
test('homing target and direction survive status adaptation',()=>{
 const r=new LiveState();r.accept(status(),1);
 const homing={endstops:['unit0:filament_compression'],triggered:false};
 assert.deepEqual(r.accept({mmu:{homing}},2).homing,homing);
 assert.equal(r.accept({mmu:{homing:null}},3).homing,null);
});
test('shared toolhead sensors are named for the unit toolhead',()=>{
 assert.deepEqual(Object.keys(qualifySensors({extruder:false,toolhead:true},'u0',0,'b','head2')),['head2:extruder','head2:toolhead']);
 assert.ok('default:extruder' in qualifySensors({extruder:false},'u0',0,'b'));
 const objects=status(),section=Object.keys(objects.configfile.settings).find(k=>k.startsWith('mmu_unit ') && !k.includes('parameters'));
 const old=objects.configfile.settings[section].toolhead;
 objects.configfile.settings[section].toolhead='head2';
 objects.configfile.settings['mmu_toolhead head2']=objects.configfile.settings[`mmu_toolhead ${old}`];
 const s=new LiveState().accept(objects,1);
 assert.ok('head2:extruder' in s.sensors);assert.ok(!('default:extruder' in s.sensors));
});
test('grip comes from the selector status',()=>{
 for (const [selector,gripped] of [[{grip:'Gripped'},true],[{grip:'Released'},false],[{grip:'Unknown'},false]]) {
  const r=new LiveState();
  const s=r.accept({...status(),mmu:{...status().mmu,selector}},1);
  assert.equal(s.mmu_gripped,gripped,JSON.stringify(selector));
 }
});
test('active sensors are requalified from the short names Klipper reports',()=>{
 const r=new LiveState();r.accept(status(),1);
 const s=r.accept({mmu:{gate:0,sensors:{mmu_entry:true,encoder:false,extruder:null,toolhead:false}}},2);
 assert.deepEqual(Object.keys(s.sensors).sort(),['default:extruder','default:toolhead','mmu_entry_0','unit0:encoder']);
 assert.equal(s.sensors['mmu_entry_0'].state,true);assert.equal(s.sensors['mmu_entry_0'].enabled,true);
 assert.equal(s.sensors['default:extruder'].enabled,false);
 assert.equal(s.homing,null);
});
test('runtime edits arrive in config_changes keyed by section and override startup values',()=>{
 const r=new LiveState();r.accept(status(),1);
 const section=`mmu_toolhead ${r.objects.configfile.settings['mmu_unit unit0'].toolhead}`;
 const s=r.accept({mmu:{config_changes:{[section]:{toolhead_extruder_to_nozzle:120}}}},2);
 assert.equal(s.layout.nozzle-s.layout.extruder_gears,120);
});
test('cosmetic frames land exactly on reported state and do not mutate it',()=>{
 const r=new LiveState(),a=r.accept(status(),1);
 const b=r.accept({mmu:{filament_pos:6,bowden_progress:-1}},2);
 const before=structuredClone(b),half=liveFrame(a,b,.5);
 assert.equal(half.tips[b.gate],(a.tips[a.gate]+b.tips[b.gate])/2);
 assert.deepEqual(b,before);assert.equal(liveFrame(a,b,1),b);
});

test('proportional position remains authoritative with released gears',()=>{
 const r=new LiveState();r.accept(status(),1);
 const s=r.accept({mmu:{filament_pos:6},'unit0:filament_proportional':{value:.6}},2);
 const d=s.devices['unit0:buffer'];
 assert.equal(d.displacement,d.maximum/2+.6*d.range/2);
 assert.equal(d.excess,0);
});

test('a gate change slides to the new gate as the telemetry view does, and a late frame still draws the result',async()=>{
 const {liveDuration,liveProgress}=await import('./live-state.js');
 const a={unit:'unit0',gate:7,tips:[],devices:{},motors:{}},b={unit:'unit1',gate:9,tips:[],devices:{},motors:{}};
 assert.ok(liveDuration(a,b)>liveDuration(a,{...a}));
 const half=liveFrame(a,b,.5);
 assert.equal(half.gate_focus,8);assert.equal(half.gate_from,7);assert.equal(half.gate_to,9);
 assert.equal(liveFrame(a,b,1),b);
 assert.deepEqual(liveProgress(1000,350,false),{fraction:1,draw:true,settled:true});
 assert.equal(liveProgress(1000,350,true).draw,false);
});
test('configuration read at startup is kept when a status update arrived first',()=>{
 const {configfile,...objects}=status(), r=new LiveState();
 assert.equal(r.accept(objects,5),null);
 r.seed({configfile});
 assert.equal(r.accept({mmu:{gate:1}},5).gate,1);
});
test('the snapshot carries the filament position Happy Hare reports, for the heading',()=>{
 const r=new LiveState();r.accept(status(),1);
 assert.equal(r.accept({mmu:{filament_position_live:715}},2).filament_position_live,715);
});
test('the mmu subscription asks for every field except the encoder, which has its own object',()=>{
 assert.deepEqual(liveMmuFields({gate:1,encoder:{encoder_pos:1},operation:''}),['gate','operation']);
});
test('a loaded filament parked with a retraction is drawn back from the melt it left in the nozzle',()=>{
 const r=new LiveState();r.accept(status(),1);
 const loaded={mmu:{filament_pos:10,sensors:{mmu_entry:true,encoder:false,extruder:true,toolhead:true}}};
 const full=r.accept(loaded,2), melt=full.layout.nozzle-full.filament.residual_mm;   // Not purged: it stops at the melt
 assert.equal(full.tips[full.gate],melt);
 const parked=r.accept({'gcode_macro _MMU_PARK':{retracted_length:4}},3);
 assert.equal(parked.tips[parked.gate],parked.layout.nozzle-parked.filament.residual_mm-4);
 assert.equal(parked.tip_shapes[parked.gate],'cone');assert.equal(parked.filament.retracted_length,4);
 assert.equal(r.accept({'gcode_macro _MMU_PARK':{retracted_length:0}},4).tips[parked.gate],melt);
});
test('a purge is counted from the live position, else from the suggested volume, and falls when the filament leaves',()=>{
 const area=Math.PI*(1.75/2)**2, start={extruded:0,base:0,start:0,active:false,from:0,amount:0,position:null,origin:null};
 const run=steps=>steps.reduce((all,step)=>[...all,purged(all.at(-1),step)],[start]).slice(1);
 // The extruder is not the stepper followed: the volume is taken from the second update of the purge
 const told=run([{action:'Idle',filament_pos:10},{action:'Purging',filament_pos:10,toolchange_purge_volume:20*area},
  {action:'Purging',filament_pos:10,toolchange_purge_volume:20*area},{action:'Idle',filament_pos:10,toolchange_purge_volume:0},{action:'Unloading',filament_pos:9}]);
 assert.deepEqual(told.map(p=>[Math.round(p.extruded),Math.round(p.base)]),[[0,0],[0,0],[20,0],[20,0],[20,20]]);
 // The live position moves: it is counted as it happens, and nothing is added at the end
 // and a suggestion larger than what was seen to move is not made up
 // a suggestion larger than what was seen to move is not made up, and priming again after a retraction adds nothing
 const seen=run([{action:'Idle',filament_pos:10,filament_position_live:100},{action:'Purging',filament_pos:10,toolchange_purge_volume:40*area,filament_position_live:104},
  {action:'Purging',filament_pos:10,filament_position_live:112},{action:'Purging',filament_pos:10,filament_position_live:110},{action:'Purging',filament_pos:10,filament_position_live:125},
  {action:'Idle',filament_pos:10,filament_position_live:127},{action:'Idle',filament_pos:10,filament_position_live:130}]);
 assert.deepEqual(seen.map(p=>Math.round(p.extruded)),[0,0,8,8,21,23,23]);
 const at=(extruded_mm,purge_base_mm=0)=>({unit:'u',gate:0,tips:[750],devices:{},extruded_mm,purge_base_mm});
 assert.equal(liveDuration(at(0),at(5),250),2000);
});
test('the nozzle keeps the colour that was in it until the purge, and the pile falls at the park retraction, even one reported as the purge ends',()=>{
 const area=Math.PI*(1.75/2)**2, start={extruded:0,base:0,start:0,active:false,from:0,amount:0,position:null,origin:null,old:null,loaded:null};
 const steps=[[{action:'Loading Ext',filament_pos:8},2,'aa0000'],[{action:'Purging',filament_pos:10,toolchange_purge_volume:20*area},0,'00bb00'],
  [{action:'Purging',filament_pos:10},0,'00bb00'],[{action:'Idle',filament_pos:10},2,'00bb00'],[{action:'Unloading',filament_pos:9},2,'00bb00']];
 const run=steps.reduce((all,step)=>[...all,purged(all.at(-1),...step)],[start]).slice(1);
 assert.deepEqual(run.map(p=>[p.old,Math.round(p.extruded),Math.round(p.base)]),
  [['aa0000',0,0],['aa0000',0,0],['aa0000',20,0],['aa0000',20,20],['00bb00',20,20]]);
});
test('a filament purged through the nozzle leaves its colour in the outlet when it retracts, fading to what was there',()=>{
 const r=new LiveState(), before=r.accept(status(),1);
 r.accept({mmu:{gate_color:before.gate_colors.map(()=>'00bb00')}},1);
 r.accept({mmu:{filament_pos:10,action:'Purging',toolchange_purge_volume:before.filament.residual_mm*Math.PI*(1.75/2)**2,sensors:{mmu_entry:true,encoder:false,extruder:true,toolhead:true}}},2);
 const purging=r.accept({mmu:{action:'Purging'}},3);
 const parked=r.accept({mmu:{action:'Idle'},'gcode_macro _MMU_PARK':{retracted_length:4}},4);
 assert.notEqual(before.nozzle_outlet_color,'00bb00');
 assert.equal(parked.nozzle_outlet_color,parked.filament.incoming_color);
 assert.equal(liveFrame(purging,parked,.5).nozzle_outlet_color,parked.filament.incoming_color);
 assert.equal(parked.purge_transition.nozzle_arrival_mm,parked.extruded_mm);   // The outlet's fade is drawn from here
});
test('an eject and a preload play in the live view as they do from telemetry, and a gate marked empty just switches',async()=>{
 const {EJECT_TAIL_MS,EJECT_WITHDRAW_MS,PRELOAD_FADE_MS,PRELOAD_FEED_MS}=await import('./playback.js'), {liveSteady}=await import('./live-state.js');
 const at=(status,percent,homing=null)=>({unit:'u',gate:1,filament_pos:0,tips:[0,0],devices:{},motors:{},homing,gate_status:status,spool_percentages:percent,gate_colors:['aa0000','00bb00']});
 const homing={endstops:['mmu_entry_0'],triggered:false};
 const full=at([1,1],[80,60],homing), ejected=at([0,1],[null,60],homing), marked=at([0,1],[80,60]);
 // The same change with nothing moving is the gate map edited by hand: it just switches
 assert.equal(liveDuration(at([1,1],[80,60]),at([0,1],[null,60]),250),300);
 assert.equal(liveFrame(at([0,1],[null,60]),at([1,1],[80,60]),.5).gate_eject,undefined);
 assert.equal(liveDuration(full,ejected,250),EJECT_TAIL_MS);
 assert.equal(liveSteady(full,ejected),false);
 const frame=liveFrame(full,ejected,EJECT_WITHDRAW_MS/2/EJECT_TAIL_MS);
 assert.equal(frame.gate_status[0],1);assert.deepEqual(frame.gate_eject,{gate:0,withdraw:.5,fade:0});
 assert.equal(liveFrame(full,ejected,1),ejected);
 // Back again: drawn on the new state, the spool fading in before the filament comes up
 assert.equal(liveDuration(ejected,full,250),PRELOAD_FADE_MS+PRELOAD_FEED_MS);
 const back=liveFrame(ejected,full,.1);
 assert.equal(back.gate_status[0],1);assert.equal(back.gate_eject.withdraw,1);assert.ok(back.gate_eject.fade>0 && back.gate_eject.fade<1);
 // Marked empty, its spool's weight kept
 assert.equal(liveDuration(full,marked,250),300);
 assert.equal(liveFrame(full,marked,.5).gate_eject,undefined);assert.equal(liveFrame(full,marked,.5).gate_status[0],0);
});
test('a gate ejected and then left plays the eject in full before the gate changes',async()=>{
 const {EJECT_TAIL_MS,EJECT_WITHDRAW_MS,duration}=await import('./playback.js');
 const at=(gate,status,percent)=>({unit:'u',gate,filament_pos:0,tips:[0,0],devices:{},motors:{},homing:{endstops:['mmu_entry_0'],triggered:false},gate_status:status,spool_percentages:percent,gate_colors:['aa0000','00bb00']});
 const full=at(0,[1,1],[80,60]), left=at(1,[0,1],[null,60]);
 const change=duration({kind:'gate_changed',before:full,state:left}), total=change+EJECT_TAIL_MS;
 assert.equal(liveDuration(full,left,250),total);
 const frame=liveFrame(full,left,EJECT_WITHDRAW_MS/2/total);
 assert.equal(frame.gate,0);assert.deepEqual(frame.gate_eject,{gate:0,withdraw:.5,fade:0});
 const after=liveFrame(full,left,(EJECT_TAIL_MS+change/2)/total);
 assert.equal(after.gate_eject,undefined);assert.equal(after.gate_status[0],0);
});
test('a gate change between units plays in the live view as it does from telemetry',async()=>{
 const {playbackFrame,duration}=await import('./playback.js');
 const at=(unit,gate)=>({unit,gate,filament_pos:0,tips:[0,0],devices:{},motors:{},gate_status:[1,1],gate_colors:['aa0000','00bb00']});
 const from=at('a',0), to=at('b',1), event={kind:'gate_changed',before:from,state:to}, ms=duration(event);
 assert.equal(liveDuration(from,to,250),ms);
 for (const fraction of [.1,.3,.5,.7,.9]) assert.deepEqual(liveFrame(from,to,fraction),playbackFrame(event,fraction*ms,ms).state);
 assert.equal(liveFrame(from,to,.5).gate_full_opacity,0);   // The Bowden is faded out while the rack slides
});
test('a gate on another unit is shown on that unit before Happy Hare reports the unit itself',async()=>{
 const {liveObjects}=await import('./live-fixture.mjs');
 const live=new LiveState(), first=live.accept(liveObjects('ercf-vvd'),1);
 const other=first.unit_layouts.find(layout=>layout.name!==first.unit);
 const moved=live.accept({mmu:{gate:other.gates[0]}},2);
 assert.equal(moved.unit,other.name);
});
