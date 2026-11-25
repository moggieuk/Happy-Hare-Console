import {test} from 'node:test';
import assert from 'node:assert/strict';
import {actionMotion,settleMotion,withMotion,motionActive,FORM_TRAVEL} from './live-action.js';

test('a cutting action strokes its own blade from clear, through the filament and back, for as long as it lasts',()=>{
 assert.deepEqual([0,210,420,700,910,1200,1400+210].map(t=>Number(actionMotion('Cutting Tip',t).toolhead.toFixed(3))),[0,.5,1,1,.5,0,.5]);
 assert.deepEqual(actionMotion('Cutting Filament',420),{mmu:1});
 assert.deepEqual(actionMotion('Loading',420),{});
});
test('tip forming dips the tip and returns it, and only a filament in the nozzle is moved',()=>{
 assert.deepEqual([0,275,550,1100].map(t=>Number(actionMotion('Forming Tip',t).tip.toFixed(3))),[0,.5,1,0]);
 const s={gate:1,filament_pos:10,tips:[0,750],tip_shapes:['square','square']};
 const frame=withMotion(s,{tip:.5});
 assert.equal(frame.tips[1],750-FORM_TRAVEL/2);assert.equal(frame.tip_shapes[1],'cone');
 assert.deepEqual(s.tips,[0,750]);
 assert.equal(withMotion({...s,filament_pos:3},{tip:.5}).tips,s.tips);
 assert.equal(withMotion(s,{}),s);
 assert.deepEqual(withMotion(s,{mmu:.4}).cutter_stroke,{toolhead:0,mmu:.4});
});
test('motion eases out once its action ends rather than snapping',()=>{
 let motion=settleMotion({},{toolhead:.8},16);
 assert.deepEqual(motion,{toolhead:.8});
 motion=settleMotion(motion,{},125);
 assert.ok(Math.abs(motion.toolhead-.3)<1e-9);assert.ok(motionActive(motion));
 assert.equal(motionActive(settleMotion(motion,{},125)),false);
});
