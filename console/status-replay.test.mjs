import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StatusReplay,stepDuration} from './status-replay.js';

const state=(tip,extra={})=>({unit:'u',gate:0,tool:0,num_toolchanges:0,tips:[tip],devices:{},motors:{},...extra});
const recorded=()=>{
 const r=new StatusReplay();
 r.record(state(0),10);r.record(state(100),10.25);r.record(state(100,{tool:1,num_toolchanges:1}),11);r.record(state(300,{tool:1,num_toolchanges:1}),20);
 return r;
};
test('status is followed until a step is chosen, and playing to the end follows again',()=>{
 const r=recorded();
 assert.equal(r.frame(0),null);assert.equal(r.index,3);
 r.seek(1);
 assert.equal(r.frame(0).tips[0],100);assert.equal(r.index,1);
 r.play(1000);
 assert.equal(r.frame(1000+375).tips[0],100);          // Half way through a 750ms step between equal tips
 assert.equal(r.frame(1000+750),r.entries[2].state);   // That step done, the next under way
 assert.equal(r.index,2);
 assert.equal(r.frame(1000+750+750).tips[0],200);      // The 9s gap is played in 1.5s
 assert.equal(r.frame(1000+750+1500),r.entries[3].state);   // The last step done: nothing left to replay
 assert.equal(r.following,true);assert.equal(r.frame(5000),null);assert.equal(r.index,3);
});
test('one step can be played forwards or back, and pausing lets the step under way finish',()=>{
 const r=recorded();
 r.seek(1);r.play(0,{reverse:true});
 assert.equal(r.frame(125).tips[0],50);
 assert.equal(r.frame(250).tips[0],0);assert.equal(r.index,0);assert.equal(r.playing,null);
 r.play(1000);r.pause();
 r.frame(1250);
 assert.equal(r.index,1);assert.equal(r.playing,null);
 r.follow();r.pause();
 assert.equal(r.following,false);assert.equal(r.index,3);
});
test('toolchanges are marked where the count rises or the tool changes, and can be jumped between',()=>{
 const r=recorded();
 assert.deepEqual(r.markers(),[{index:2,label:'T1'}]);
 r.seek(0);
 assert.equal(r.toolchange(1),2);assert.equal(r.toolchange(-1),-1);
 r.seek(3);assert.equal(r.toolchange(-1),2);
});
test('a load, an unload and a toolchange are each marked where they start, labelled as telemetry labels them',()=>{
 const r=new StatusReplay(), at=(action,filament_pos,extra={})=>state(0,{action,filament_pos,...extra});
 [at('Idle',0),at('Loading',2),at('Loading Ext',8),at('Idle',10),                                       // MMU_LOAD
  at('Idle',10),at('Cutting Tip',10),at('Unloading',3),at('Idle',0),                                    // MMU_UNLOAD
  at('Selecting',0),at('Idle',0),                                                                       // Moves no filament
  at('Loading',3),at('Idle',10),
  at('Unloading',3),at('Loading',3,{tool:2}),at('Idle',10,{tool:2,num_toolchanges:1}),                  // A toolchange
  at('Unloading',4,{tool:2,num_toolchanges:1})].forEach((s,i)=>r.record(s,i));                          // Under way
 assert.deepEqual(r.markers(),[{index:1,label:'T0'},{index:5,label:'U'},{index:10,label:'T0'},{index:12,label:'T2'},{index:15,label:'U'}]);
 r.seek(6);
 assert.equal(r.toolchange(1),10);assert.equal(r.toolchange(-1),5);
 r.record(at('Loading',3,{tool:3,num_toolchanges:1}),16);
 assert.equal(r.markers().at(-1).label,'T3');
});
test('steps whose capture rows have gone are dropped, keeping the place in the replay',()=>{
 const r=recorded();
 r.seek(2);r.trim(3);
 assert.deepEqual(r.entries.map(entry=>entry.seq),[3,4]);assert.equal(r.index,0);
 assert.equal(r.record(state(300),21).seq,5);
});
test('a step lasts as long as its updates were apart, within limits',()=>{
 const at=(time,tip=0)=>({time,state:state(tip)});
 assert.deepEqual([stepDuration(at(1),at(1.01)),stepDuration(at(1),at(1.5)),stepDuration(at(1),at(60))],[150,500,1500]);
});
test('only the latest updates are kept, however many rows the capture panel still lists',()=>{
 const r=new StatusReplay(3);
 for (let i=0;i<5;i++) r.record(state(i),i);
 assert.deepEqual(r.entries.map(e=>e.seq),[3,4,5]);
});
test('lowering the history limit lets the oldest updates go and keeps the one being shown',()=>{
 const replay=new StatusReplay(10);
 for (let i=1;i<=10;i++) replay.record({tool:0,num_toolchanges:0},i);
 replay.seek(8);
 replay.resize(4);
 assert.deepEqual(replay.entries.map(e=>e.seq),[7,8,9,10]);
 assert.equal(replay.index,2);
 replay.record({tool:0,num_toolchanges:0},11);
 assert.equal(replay.count,4);
});
