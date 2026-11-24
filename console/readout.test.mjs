import test from 'node:test';
import assert from 'node:assert/strict';
import {deviceRows} from './readout.js';

test('each Klipper object is a name beside its status, not a name inside it',()=>{
  assert.deepEqual(deviceRows({object_status:{'mmu_encoder unit0':{encoder_pos:1.234},'mmu_extruder extruder':null}}),
    [['mmu_encoder unit0','{"encoder_pos":1.23}'],['mmu_extruder extruder','No status exposed']]);
});
