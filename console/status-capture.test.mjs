import {test} from 'node:test';
import assert from 'node:assert/strict';
import {captureRows} from './status-capture.js';
test('a status update is captured as one row per Happy Hare object, with each changed field',()=>{
 assert.deepEqual(captureRows({mmu:{filament_pos:3,action:'Loading'},'mmu_encoder unit0':{encoder_pos:12.5},
   extruder:{target:210},'gcode_macro _MMU_CUT_TIP':{blade_pos:37}}),
  [['mmu',[['filament_pos','3'],['action','"Loading"']]],['mmu_encoder unit0',[['encoder_pos','12.5']]]]);
});
