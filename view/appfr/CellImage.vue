<script setup lang="ts">
/**
 * A picture in a table cell, drawn the two ways the original TableCell draws
 * one: inside a button when the column leads somewhere, bare when it does not,
 * and not at all when the row has no picture.
 *
 * All three matter. The shell's own `image` kind puts the press on the `<img>`
 * itself, so a picture that leads somewhere never reads as pressable; and it
 * renders `src=""` for a row with no image, which is a broken-image icon where
 * the original leaves the cell empty — colours have no pictures stored, so that
 * is every row of that table.
 *
 * It stays generic by calling whatever `click` the column declares rather than
 * knowing what narrowing means.
 */
import type { ColumnDef, ShellRow } from 'header-content-layout'
import type { PropType } from 'vue'

const props = defineProps({
  row: {
    type: Object as PropType<ShellRow>,
    required: true
  },
  // Passed by the shell alongside `row`; declared so it does not land on the
  // button as a stray attribute.
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

function press() {
  props.column.click?.(props.row)
}
</script>

<template>
  <template v-if="value">
    <button v-if="column.click" type="button" @click="press">
      <img :src="String(value)" :style="{ maxHeight: column.height }" alt="" />
    </button>
    <img v-else :src="String(value)" :style="{ maxHeight: column.height }" alt="" />
  </template>
</template>

<style scoped>
/* The one rule the original image cell has, so a wide picture stays in column. */
img {
  max-width: 100%;
}
</style>
