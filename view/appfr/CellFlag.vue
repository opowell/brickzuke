<script setup lang="ts">
/**
 * A country's name with its flag in front of it — one cell, where the table
 * used to spend a column on each.
 *
 * A flag is not a picture *of* a country the way a thumbnail is a picture of
 * a part: it is the name again, drawn. Two columns for one thing put two
 * controls beside each other that led two different places, the flag to the
 * sellers and the name to the same sellers, and neither of them to the
 * country. So the pair is one cell now, and it presses as `narrowingTo` does —
 * see `countryColumns` — which is the same record-scoped narrow a row press
 * used to make before rows stopped taking presses of their own. The count
 * beside it is the cell that leads out to the sellers.
 *
 * The picture comes off the row rather than the column, the column's own
 * value being the name — the identity, which is what a card heads and a tile
 * captions, and what the header sorts by.
 */
import { pressOptions, type ColumnDef, type ShellRow } from 'header-content-layout'
import type { PropType } from 'vue'
import { computed } from 'vue'

const props = defineProps({
  row: {
    type: Object as PropType<ShellRow>,
    required: true
  },
  // Passed by the shell alongside `row`; declared so it does not land on the
  // element as a stray attribute.
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

const flag = computed(() => String(props.row.fields.image ?? ''))

/** Pressing the cell, and not the row under it — see CellCount for the twin. */
function press(event: MouseEvent) {
  if (!props.column.click) {
    return
  }
  event.stopPropagation()
  props.column.click(props.row, pressOptions(event))
}
</script>

<template>
  <button v-if="column.click" type="button" class="flagged" @click="press">
    <img v-if="flag" :src="flag" alt="" />
    <span class="flagged__name">{{ value }}</span>
  </button>
  <span v-else class="flagged">
    <img v-if="flag" :src="flag" alt="" />
    <span class="flagged__name">{{ value }}</span>
  </span>
</template>

<style scoped>
.flagged {
  display: inline-flex;
  align-items: center;
  gap: 0.5em;
  max-width: 100%;
}

/* A flag no taller than the line it sits on, as the picture column drew it. */
img {
  height: 1.25em;
  flex: none;
}

.flagged__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
