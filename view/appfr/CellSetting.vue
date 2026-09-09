<script setup lang="ts">
/**
 * A setting's value, as the control that changes it.
 *
 * The one cell in brickzuke that writes rather than reads. A number field
 * because every setting here is a number with a stated range — the control the
 * browser already has for exactly this, so it arrives with its own steppers,
 * its own keyboard handling and its own validation, and brickzuke paints none
 * of it.
 *
 * Written on `change` and not on `input`: typing `150` passes through `1` and
 * `15` on the way, and a fill that restarted at each of those would be three
 * runs for one edit. The clamp is in [setSetting], so what a reader types is
 * held to the range whatever the field lets through.
 */
import type { ColumnDef, ShellRow } from 'header-content-layout'
import type { PropType } from 'vue'
import { computed } from 'vue'
import { setSetting, settingFor } from './settings'

const props = defineProps({
  row: {
    type: Object as PropType<ShellRow>,
    required: true
  },
  // Passed by the shell alongside `row`; declared so it does not land on the
  // control as a stray attribute.
  entry: {
    type: Object,
    default: undefined
  },
  value: {
    type: null,
    default: undefined
  },
  column: {
    type: Object as PropType<ColumnDef>,
    default: undefined
  }
})

const setting = computed(() => settingFor(String(props.row.fields.setting ?? '')))

function write(event: Event) {
  const field = event.target as HTMLInputElement
  setSetting(String(props.row.fields.setting ?? ''), Number(field.value))
}
</script>

<template>
  <!--
    The press stops here. A row press narrows the whole result set to that
    record, and reaching for a stepper is not a request to be taken somewhere
    else — see the same guard on every cell brickzuke draws itself.
  -->
  <span
    v-if="setting"
    class="setting"
    @click.stop
  >
    <input
      class="setting__value"
      type="number"
      :value="setting.value.value"
      :min="setting.min"
      :max="setting.max"
      :aria-label="setting.name"
      @change="write"
    />
    <span
      v-if="setting.unit"
      class="setting__unit"
    >{{ setting.unit }}</span
    >
  </span>
</template>

<style scoped>
.setting {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
}

/*
 * Wide enough for the longest value any setting here takes — five figures, the
 * pause being in milliseconds — so the column does not resize as one is typed.
 */
.setting__value {
  width: 7ch;
  font: inherit;
  color: inherit;
}

.setting__unit {
  opacity: 0.7;
}
</style>
