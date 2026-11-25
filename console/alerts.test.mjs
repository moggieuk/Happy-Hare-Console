import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAlerts} from './alerts.js';

const page=()=>{
 const nodes={}, pending=[];
 const node=()=>({hidden:true,style:{},textContent:'',classes:new Set(),
  get classList() { const c=this.classes; return {add:n=>c.add(n),remove:n=>c.delete(n)}; }});
 const $=id=>nodes[id] ||= node();
 return {$,nodes,pending,show:createAlerts($,{later:fn=>pending.push(fn)-1,cancel:i=>{ if (i!==undefined) pending[i]=null; }})};
};
test('the newest box to appear goes above the others, and a box already showing keeps its place',()=>{
 const {show,$}=page();
 show('a','first');show('b','second');
 assert.ok($('b').style.order<$('a').style.order);
 const placed=$('a').style.order;
 show('a','first, updated');
 assert.equal($('a').style.order,placed);assert.equal($('a-message').textContent,'first, updated');
});
test('a box that no longer applies fades before it goes, and comes back on top if it applies again',()=>{
 const {show,$,pending}=page();
 show('a','one');show('b','two');show('a','');
 assert.equal($('a').hidden,false);assert.ok($('a').classes.has('leaving'));
 pending.filter(Boolean).forEach(fn=>fn());
 assert.equal($('a').hidden,true);assert.equal($('a').classes.has('leaving'),false);
 show('a','again');
 assert.ok($('a').style.order<$('b').style.order);
 show('b','');show('b','still');
 assert.equal($('b').classes.has('leaving'),false);
 pending.filter(Boolean).forEach(fn=>fn());
 assert.equal($('b').hidden,false);
});
