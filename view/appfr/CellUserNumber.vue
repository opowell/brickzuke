<script setup lang="ts">
/**
 * A number on a record of somebody's own — a quantity, a price limit.
 *
 * [CellUserText] with the browser's number control instead, which arrives with
 * its own steppers, its own keyboard handling and its own validation. Blank is
 * kept as blank and not read as nought: a wanted part with no price limit is
 * not a wanted part priced at zero, and the planner tells the two apart.
 *
 * `step` is the one thing the two numbers here differ in. A quantity is whole,
 * and a price limit is pennies — so it is read off the column's own kind rather
 * than stated twice.
 */
import type { ColumnDef, ShellRow } from 'header-content-layout'
import type { PropType } from 'vue'
import { computed, ref, watch } from 'vue'
import { recordId, writableRow, writeField } from './userWrites'

const props = defineProps({
  row: {
    type: Object as PropType<ShellRow>,
    required: true
  },
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

function shown(value: unknown): string {
  return value === undefined || value === null || value === '' ? '' : String(value)
}

const typed = ref(shown(props.value))

watch(
  () => props.value,
  (value) => {
    typed.value = shown(value)
  }
)

const writable = computed(() => writableRow(props.row))

/** A quantity counts and a price measures — see the note up top. */
const whole = computed(() => props.column?.key === 'quantity')
const step = computed(() => (whole.value ? '1' : '0.01'))

function write() {
  const id = recordId(props.row.fields)
  const field = props.column?.key
  if (!id || !field) {
    return
  }
  /*
   * Stringified before it is trimmed, because `v-model` on a number input does
   * not hand back a string: Vue casts what was typed, so `typed` holds the
   * number 8 and not `'8'`. Calling `.trim()` on that threw inside the change
   * handler, where nothing was watching — so a quantity somebody typed was
   * silently never written, which is how this was found.
   */
  const text = String(typed.value ?? '').trim()
  if (!text) {
    // Cleared rather than nought — the two mean different things here.
    void writeField(props.row.entityKey, id, field, undefined)
    return
  }
  const number = Number(text)
  if (!Number.isFinite(number) || number < 0) {
    return
  }
  void writeField(props.row.entityKey, id, field, whole.value ? Math.round(number) : number)
}
</script>

<template>
  <!-- Plain on a row nobody may write, as [CellUserText] is — and written the
       way the column says, where it says: a BrickLink set's quantities are
       formatted as counts. -->
  <span v-if="!writable">{{ column?.format ? column.format(value, row) : typed }}</span>
  <span
    v-else
    class="user-number"
    @click.stop
  >
    <input
      v-model="typed"
      class="user-number__value"
      type="number"
      min="0"
      :step="step"
      :aria-label="column?.label ?? 'Value'"
      @change="write"
    />
  </span>
</template>

<style scoped>
.user-number {
  display: inline-flex;
}

/* Wide enough for a four-figure quantity and its steppers, so the column does
   not resize as one is typed — as [CellSetting]'s is. */
.user-number__value {
  width: 7ch;
  font: inherit;
  color: inherit;
}
</style>
