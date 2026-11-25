import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pauseStatus} from './pause-status.js';

const objects=(mmu,extra={})=>({configfile:{settings:{mmu_parameters:{disable_heater:600,timeout_pause:72000}}},
 idle_timeout:{state:'Ready',idle_timeout:72000},extruder:{target:220,temperature:219.6},
 mmu:{print_state:'printing',reason_for_pause:'',pause_hint:'',config_changes:{},...mmu},...extra});
const paused={print_state:'pause_locked',reason_for_pause:'Filament not detected at extruder',pause_hint:'Check the gate'};

test('nothing is reported unless the MMU has paused the print',()=>{
 assert.deepEqual(pauseStatus(objects({}),'extruder',null,0),{memory:{paused:false},text:''});
});
test('a pause seen starting counts both timers down, and unlocking reports the reheat',()=>{
 let {memory}=pauseStatus(objects({}),'extruder',null,100);
 let r=pauseStatus(objects(paused),'extruder',memory,110);
 assert.equal(r.text,['MMU paused: Filament not detected at extruder','Check the gate',
  'Locked: MMU_UNLOCK restores the extruder temperature','Extruder heater off in 10:00','Idle timeout in about 20:00:00'].join('\n'));
 r=pauseStatus(objects(paused),'extruder',r.memory,175);
 assert.match(r.text,/heater off in 8:55/);assert.match(r.text,/Idle timeout in about 19:58:55/);
 r=pauseStatus(objects(paused,{extruder:{target:0,temperature:140}}),'extruder',r.memory,800);
 assert.match(r.text,/Extruder heater is off \(now 140°C\)/);
 // MMU_UNLOCK restores the temperature and the printer's own idle timeout
 const unlocked=objects({...paused,print_state:'paused'},{extruder:{target:220,temperature:150},idle_timeout:{state:'Ready',idle_timeout:900}});
 r=pauseStatus(unlocked,'extruder',r.memory,820);
 assert.match(r.text,/Unlocked: RESUME continues the print\nExtruder heating to 220°C \(now 150°C\)\nIdle timeout in about 15:00/);
 assert.match(pauseStatus(objects({...paused,print_state:'paused'}),'extruder',r.memory,900).text,/Extruder at 220°C/);
 assert.match(pauseStatus(objects(paused,{idle_timeout:{state:'Idle',idle_timeout:72000}}),'extruder',r.memory,900).text,/Idle timeout has expired/);
});
test('a printer that has not run anything is idle without a timeout having expired, and an older Klipper has no timeout to read',()=>{
 const idle={idle_timeout:{state:'Idle',printing_time:0}};
 let {memory}=pauseStatus(objects({},idle),'extruder',null,0);
 const r=pauseStatus(objects(paused,idle),'extruder',memory,5);
 assert.doesNotMatch(r.text,/Idle timeout/);assert.match(r.text,/heater off in 10:00/);
 assert.match(pauseStatus(objects(paused,{idle_timeout:{state:'Ready'}}),'extruder',r.memory,65).text,/Idle timeout in about 19:59:00/);
});
test('a heater-off time published by Happy Hare is counted down exactly, even for a pause already under way',()=>{
 const r=pauseStatus(objects({...paused,hotend_off_time:5000}),'extruder',null,500,4877.4);
 assert.match(r.text,/Extruder heater off in 2:03\n/);
});
test('a pause already under way is given its limits, not a countdown',()=>{
 const r=pauseStatus(objects(paused),'extruder',null,500);
 assert.match(r.text,/Extruder heater off within 10:00\nIdle timeout within 20:00:00/);
 assert.equal(pauseStatus(objects(paused),'extruder',r.memory,560).text,r.text);
 assert.match(pauseStatus(objects({...paused,config_changes:{mmu_parameters:{disable_heater:120}}}),'extruder',r.memory,560).text,/within 2:00/);
});
