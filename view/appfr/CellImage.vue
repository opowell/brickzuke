<script setup lang="ts">
/**
 * A picture in a table cell, drawn the two ways the original TableCell draws
 * one: inside a button when the column leads somewhere, and bare when it does
 * not.
 *
 * One reason left of the two this had. The shell's own `image` kind puts the
 * press on the `<img>` itself, so a picture that leads somewhere never reads as
 * pressable — a thumbnail with an edge and a hand on it is the whole of what
 * says this one can be pressed, and that is what the button is for.
 *
 * The other was the empty cell: the kind used to render `src=""` for a row with
 * no picture, which draws a broken-image icon where the original leaves the
 * cell empty — and colours have no pictures stored, so that was every row of
 * that table. appfr 0.18.1 made blank its own case throughout, so the guard
 * below is now brickzuke agreeing with the shell rather than working around it.
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
