import test from 'node:test';
import assert from 'node:assert/strict';
import {syncChildren, brightness, spanArrow} from './util.js';

// The few DOM calls syncChildren makes, with a count of the nodes it moved
function parentOf(names) {
  const parent={children:[], moves:0,
    insertBefore(node, before) {
      parent.moves++;
      parent.children=parent.children.filter(child=>child!==node);
      const index=before ? parent.children.indexOf(before) : parent.children.length;
      parent.children.splice(index, 0, node);
    }};
  const node=name=>({name, remove() { parent.children=parent.children.filter(child=>child!==this); }});
  parent.children=names.map(node);
  return {parent, node};
}

test('rows already in place are left alone when new ones are appended or one is replaced', () => {
  const {parent, node}=parentOf(['a', 'b', 'c']);
  const [a, b, c]=parent.children, d=node('d');
  syncChildren(parent, [a, b, c, d]);
  assert.deepEqual(parent.children, [a, b, c, d]);
  assert.equal(parent.moves, 1);                       // Only the new row was inserted
  const changed=node('c2');
  syncChildren(parent, [a, b, changed, d]);
  assert.deepEqual(parent.children, [a, b, changed, d]);
  assert.equal(parent.moves, 2);                       // One more: the replacement
  syncChildren(parent, [d]);
  assert.deepEqual(parent.children, [d]);
  assert.equal(parent.moves, 2);                       // Removing rows moves nothing
});

test('brightness is the relative luminance of a hex colour, from 0 for black to 1 for white',()=>{
  assert.equal(brightness('000000'),0);
  assert.equal(brightness('#FFFFFF'),1);
  assert.ok(brightness('ffff00')>.9);
  assert.ok(brightness('0000ff')<.1);
  assert.ok(Math.abs(brightness('808080')-.2159)<.001);
  assert.equal(brightness('not a colour'),0);
});

test('an arrow between two lines points up at the upper one and down at the lower one, whichever is given first',()=>{
  const expected='M10 102 V198 M7 106 L10 102 L13 106 M7 194 L10 198 L13 194';
  assert.equal(spanArrow(10,100,200),expected);
  assert.equal(spanArrow(10,200,100),expected);
});

test('the spool spacing setting of 10 to 60 scales to 45 to 75 pixels',async()=>{
 const {spoolSpacingPixels}=await import('./util.js');
 assert.equal(spoolSpacingPixels(10),45);
 assert.equal(spoolSpacingPixels(25),54);
 assert.equal(spoolSpacingPixels(60),75);
 assert.equal(spoolSpacingPixels(99),75);
});
