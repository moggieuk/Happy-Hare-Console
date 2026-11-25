import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StatusLog,captureConfig,isStatusCapture} from './status-log.js';
import {parseRecords} from './telemetry.js';

test('a saved capture loads back as the same steps, and is told apart from telemetry',()=>{
 const log=new StatusLog(captureConfig({configfile:{settings:{mmu_machine:{units:['u']},printer:{kinematics:'corexy'}}}}));
 log.add({mmu:{gate:0,tool:0},extruder:{target:0}},10,1);
 log.add({extruder:{target:240}},10.5);            // Not a step: carried into the next
 log.add({mmu:{gate:1}},11,2);
 const records=parseRecords(log.serialize());
 assert.equal(isStatusCapture(records),true);
 assert.equal(isStatusCapture([{event:'session'}]),false);
 const loaded=StatusLog.parse(records);
 assert.deepEqual(loaded.config,{configfile:{settings:{mmu_machine:{units:['u']}}}});
 assert.deepEqual(loaded.records.map(r=>[r.eventtime,r.status]),
  [[10,{mmu:{gate:0,tool:0},extruder:{target:0}}],[11,{extruder:{target:240},mmu:{gate:1}}]]);
});
test('steps dropped from the front leave a complete status in the oldest one kept',()=>{
 const log=new StatusLog();
 log.add({mmu:{gate:0,tool:0}},10,1);log.add({mmu:{gate:1}},11,2);log.add({mmu:{tool:1}},12,3);
 log.trim(2);
 assert.deepEqual(log.records.map(r=>r.status),[{mmu:{gate:1,tool:0}},{mmu:{tool:1}}]);
 log.clear();
 log.add({mmu:{gate:2}},13,4);
 assert.deepEqual(log.records.map(r=>r.status),[{mmu:{gate:2,tool:1}}]);
});
test('a capture trimmed mid-movement reloads with the tip where it was shown',async()=>{
 const {LiveState}=await import('./live-state.js'), {liveObjects}=await import('./live-fixture.mjs');
 const live=new LiveState(), log=new StatusLog(), shown=[];
 const updates=[liveObjects(),{mmu:{filament_pos:2,bowden_progress:-1,filament_position:0}},{mmu:{filament_position:40}},{mmu:{filament_position:90}}];
 updates.forEach((status,i)=>{
  const s=live.accept(status,i+1);
  shown.push(s.tips[s.gate]);
  log.add(status,i+1,i+1,live.memory());
 });
 assert.notEqual(shown[2],shown[1]);
 log.trim(3);
 const loaded=StatusLog.parse(parseRecords(log.serialize())), again=new LiveState();
 again.restore(loaded.start);
 assert.deepEqual(loaded.records.map(r=>{ const s=again.accept(r.status,r.eventtime); return s.tips[s.gate]; }),shown.slice(2));
});
