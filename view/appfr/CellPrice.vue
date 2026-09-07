<script setup lang="ts">
/**
 * A price as a number, with the currencies on hover.
 *
 * A column of prices is read down, and `EUR` repeated on every row of it is
 * three characters that never differ — the currency belongs in the header's
 * meaning, not in each cell. So the cell is the figure alone.
 *
 * The currency still has to be somewhere, because two of them are in play.
 * BrickLink converts every lot into the viewer's own currency and keeps the
 * seller's asking price beside it, and the converted one is what makes a
 * column of sellers comparable at all — so that is the number shown, and the
 * hover states both: what it was converted to, and what the seller actually
 * charges. Where a seller prices in the viewer's currency there is only the
 * one figure, and the hover says it once.
 *
 * Not the `format` on an ordinary cell, which would have to put the currency
 * back into the text to say it at all: the shell's own hover is the cell's
 * value, and this needs a hover that is not the cell.
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

/**
 * Two decimals, or four for the ones that would otherwise read as nothing.
 *
 * Most of a bulk seller's inventory is worth well under a cent a piece, and
 * `toFixed(2)` prints every one of those as `0.00` — a column of noughts that
 * sorts perfectly and says nothing. Below a cent the extra places are the
 * whole content of the number.
 */
const text = computed(() => {
  const amount = Number(props.value)
  if (!Number.isFinite(amount)) {
    return ''
  }
  return amount.toFixed(amount !== 0 && Math.abs(amount) < 0.01 ? 4 : 2)
})

/** What was converted, and what the seller asks — the same thing said once. */
const title = computed(() => {
  const converted = String(props.row.fields.price ?? '')
  const native = String(props.row.fields.nativePrice ?? '')
  if (!native || native === converted) {
    return converted
  }
  return `${converted} — seller charges ${native}`
})
</script>

<template>
  <span v-if="text" :title="title">{{ text }}</span>
</template>
