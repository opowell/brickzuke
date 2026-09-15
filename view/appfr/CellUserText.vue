<script setup lang="ts">
/**
 * A field of somebody's own record, as the box that changes it.
 *
 * The sibling of [CellSetting], and the same three decisions: the browser's own
 * control rather than one painted here; written on `change` and not on `input`,
 * so typing a name is one write and not one per letter; and the press stopped
 * at the cell, because reaching for a text box is not a request to be taken
 * somewhere else.
 *
 * What it writes is the column's own key, so a cell that draws `name` writes
 * `name` and the two cannot drift apart. What it writes it *to* is the row's
 * type and key, which every row of these types carries.
 *
 * It holds what was typed rather than waiting to be told: the table is re-read
 * after a write, but a box that empties and refills on the way would be a box
 * that flickers under the hand that filled it.
 *
 * And on a row nobody may write — BrickLink's own categories, in the table
 * that now lists theirs beside them — it is the value as plain text, cut short
 * with the whole on hover the way the shell's own text cell is. The box is
 * what says a row is theirs; offering one on a row that is not would be a
 * promise the write cannot keep.
 *
 * That plain text is a button where the column says pressing it leads
 * somewhere — see CellCount and CellFlag for the same press. The box never is,
 * whatever the column says: reaching for a text box to change it is not a
 * request to be taken to the items it heads, and a name of somebody's own
 * still narrows by the count beside it.
 */
import { pressOptions, type ColumnDef, type ShellRow } from 'header-content-layout'
import type { PropType } from 'vue'
import { computed, ref, watch } from 'vue'
import { recordId, writableRow, writeField } from './userWrites'

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

const typed = ref(props.value === undefined || props.value === null ? '' : String(props.value))

const writable = computed(() => writableRow(props.row))

/* The row a cell is drawing changes under it as the table is sorted, filtered
   or paged — same cell, different record — so what is shown follows the value
   the shell hands in wherever it is not what somebody is part-way through. */
watch(
  () => props.value,
  (value) => {
    typed.value = value === undefined || value === null ? '' : String(value)
  }
)

function write() {
  const id = recordId(props.row.fields)
  const field = props.column?.key
  if (!id || !field) {
    return
  }
  void writeField(props.row.entityKey, id, field, typed.value.trim())
}

/** Pressing the cell, and not the row under it — see CellCount for the twin. */
function press(event: MouseEvent) {
  if (!props.column?.click) {
    return
  }
  event.stopPropagation()
  props.column.click(props.row, pressOptions(event))
}
</script>

<template>
  <button
    v-if="!writable && column?.click"
    type="button"
    class="user-text__plain"
    :title="typed"
    @click="press"
  >{{ typed }}</button>
  <span
    v-else-if="!writable"
    class="user-text__plain"
    :title="typed"
  >{{ typed }}</span
  >
  <span
    v-else
    class="user-text"
    @click.stop
  >
    <input
      v-model="typed"
      class="user-text__value"
      type="text"
      :aria-label="column?.label ?? 'Value'"
      @change="write"
      @keyup.enter="write"
    />
  </span>
</template>

<style scoped>
.user-text {
  display: inline-flex;
}

/* The shell's own text cell, near enough: one line, the rest on hover. */
.user-text__plain {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/*
 * The width of the column it is in rather than a measured one: a name runs to
 * whatever somebody types, and the table states a width per column already.
 */
.user-text__value {
  width: 100%;
  min-width: 0;
  font: inherit;
  color: inherit;
}
</style>
