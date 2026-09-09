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
 * Enough places to keep two figures, and never more than four.
 *
 * Most of a bulk seller's inventory is worth a fraction of a cent a piece, and
 * two decimals round all of that to a handful of values — `0.02` for anything
 * from 0.015 to 0.025, `0.00` for everything under half a cent. A column of
 * those sorts perfectly and says nothing, because the figure that separates
 * one lot from the next has been rounded off. Each tenth of the way down, one
 * more place goes on, so the second figure of the price survives however small
 * it is: `0.016`, not `0.02`.
 */
const text = computed(() => {
  const amount = Number(props.value)
  if (!Number.isFinite(amount)) {
    return ''
  }
  const size = Math.abs(amount)
  const places = size === 0 || size >= 0.1 ? 2 : size >= 0.01 ? 3 : 4
  return amount.toFixed(places)
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
