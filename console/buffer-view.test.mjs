import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderBuffer} from './buffer-view.js';

test('the buffer carries its range and maximum range as dimensions, with the title beside them',()=>{
 const svg=renderBuffer({buffers:{},gate:0},{maximum:20,range:8,travel:10},[],()=>'#fff',{homingRing:()=>'',pulse:null,now:()=>0});
 assert.match(svg,/class="buffer-dimensions"/);
 assert.match(svg,/Max range · 20mm/);assert.match(svg,/Range · 8mm/);
 assert.equal(svg.match(/Sync-feedback buffer/g).length,2);
 assert.doesNotMatch(renderBuffer({buffers:{},gate:0},{maximum:0},[],()=>'#fff',{homingRing:()=>'',pulse:null,now:()=>0}),/buffer-dimensions/);
});
