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
 * the column's own `format` is applied here.
 */
import type { ColumnDef, ShellRow } from 'header-content-layout'
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

function press() {
  props.column.click?.(props.row)
}
</script>

<template>
  <template v-if="text">
    <button v-if="column.click" type="button" @click="press">{{ text }}</button>
    <template v-else>{{ text }}</template>
  </template>
</template>
