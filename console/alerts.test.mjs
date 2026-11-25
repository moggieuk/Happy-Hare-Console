import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAlerts} from './alerts.js';

const page=()=>{
 const nodes={}, pending=[];
 const node=()=>({hidden:true,style:{},textContent:'',classes:new Set(),
  get classList() { const c=this.classes; return {add:n=>c.add(n),remove:n=>c.delete(n)}; }});
 const $=id=>nodes[id] ||= node();
 const clock={t:0};
 const run=()=>{ for (let i=0,n=pending.length;i<n;i++) { const fn=pending[i]; pending[i]=null; fn?.(); } };  // One round of timers
 return {$,nodes,pending,clock,run,show:createAlerts($,{later:fn=>pending.push(fn)-1,cancel:i=>{ if (i!==undefined) pending[i]=null; },now:()=>clock.t})};
};
test('the newest box to appear goes above the others, and a box already showing keeps its place',()=>{
 const {show,$}=page();
 show('a','first');show('b','second');
 assert.ok($('b').style.order<$('a').style.order);
 const placed=$('a').style.order;
 show('a','first, updated');
 assert.equal($('a').style.order,placed);assert.equal($('a-message').textContent,'first, updated');
});
test('a box that no longer applies stays to be read, then fades, and comes back on top if it applies again',()=>{
 const {show,$,clock,run}=page();
 show('a','one');clock.t=3000;show('b','two');show('a','');
 assert.equal($('a').hidden,false);assert.equal($('a').classes.has('leaving'),false);   // Seen for 3s of its 10
 assert.equal($('a-message').textContent,'one');
 run();assert.ok($('a').classes.has('leaving'));
 run();assert.equal($('a').hidden,true);
 clock.t=30000;show('a','again');
 assert.ok($('a').style.order<$('b').style.order);
 show('b','');assert.ok($('b').classes.has('leaving'));   // It had its time already
 show('b','still');run();
 assert.equal($('b').hidden,false);assert.equal($('b').classes.has('leaving'),false);
});
test('a third box sends a lingering one off at once, and a box told not to linger goes straight away',()=>{
 const {show,$,clock,run}=page();
 show('a','one');show('b','two');show('a','');
 assert.equal($('a').classes.has('leaving'),false);
 clock.t=1000;show('c','three');
 assert.ok($('a').classes.has('leaving'));assert.equal($('b').classes.has('leaving'),false);
 show('c','',{linger:false});
 assert.ok($('c').classes.has('leaving'));
 run();assert.equal($('c').hidden,true);
});
