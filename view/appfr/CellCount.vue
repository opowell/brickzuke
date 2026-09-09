<script setup lang="ts">
/**
 * A count that leads somewhere, drawn only when there is a count.
 *
 * The shell makes a cell pressable from the presence of `ColumnDef.click`
 * alone, so a column whose number the catalogue never stored renders a row of
 * empty buttons — which is what item types do today, their `Items` and
 * `Categories` being absent rather than zero. This draws the button when there
 * is something to press and leaves the cell empty when there is not, so the
 * column is right both now and once an update run fills those numbers in.
 *
 * The `component` kind is handed the raw value and formats nothing itself, so
 * the column's own `format` is applied here — and, with it, the hover the
 * shell puts on the cells it draws itself: `1.3k` is worth pressing precisely
 * when you can see it is 1300.
 */
import { cellFull, type ColumnDef, type ShellRow } from 'header-content-layout'
import type { PropType } from 'vue'
import { computed } from 'vue'

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
    required: true
  }
})

const text = computed(() => props.column.format?.(props.value, props.row) ?? String(props.value ?? ''))

const title = computed(() => cellFull(props.column, props.row))

/**
 * Pressing the cell, and not the row under it.
 *
 * A row press narrows the whole result set to that record — see `rowPress` in
 * ItemsShell — and a cell that leads somewhere of its own cannot also be the
 * row's way in: without this, one press on a count both opened the list it
 * counts and narrowed to the row it was on, which is two navigations for one
 * click. The shell's own cells do exactly this; a cell brickzuke draws itself
 * has to say it itself.
 *
 * Guarded rather than unconditional, because a column with nothing to press is
 * drawn here as plain text, and plain text in a row is part of the row.
 */
function press(event: MouseEvent) {
  if (!props.column.click) {
    return
  }
  event.stopPropagation()
  props.column.click(props.row)
}
</script>

<template>
  <template v-if="text">
    <button v-if="column.click" type="button" :title="title" @click="press">{{ text }}</button>
    <template v-else><span :title="title">{{ text }}</span></template>
  </template>
</template>
