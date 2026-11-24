import test from 'node:test';
import assert from 'node:assert/strict';
import {deviceRows} from './readout.js';

test('each Klipper object is a name beside its status, not a name inside it',()=>{
  assert.deepEqual(deviceRows({object_status:{'mmu_encoder unit0':{encoder_pos:1.234},'mmu_extruder extruder':null}}),
    [['mmu_encoder unit0','{"encoder_pos":1.23}'],['mmu_extruder extruder','No status exposed']]);
});

test('sensor chips follow the filament path, whatever order the source lists them in',async()=>{
  const {sensorOrder}=await import('./readout.js');
  const sorted=['unit1:mmu_entry_9','unit1:mmu_exit_9','unit1:filament_tension','unit1:filament_compression','default:extruder','default:toolhead'];
  assert.deepEqual(['default:extruder','default:toolhead','unit1:filament_compression','unit1:filament_tension','unit1:mmu_entry_9','unit1:mmu_exit_9'].sort(sensorOrder),sorted);
  assert.deepEqual(['unit0:encoder','default:extruder','default:toolhead','unit0:mmu_entry_7'].sort(sensorOrder),
    ['unit0:mmu_entry_7','unit0:encoder','default:extruder','default:toolhead']);
});
