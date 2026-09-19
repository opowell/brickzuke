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
 *
 * Draws the modified price as well, under the `modPrice` column: the same
 * figure with the factors on the lot applied — see [priceModifiers] — and a
 * hover that shows the working, which is the one thing a scaled number
 * needs beside it.
 *
 * The figure is in the units the price units setting names — cents or whole
 * euros — through [priceText]. The hovers are not: they quote what BrickLink
 * printed, sign and all, and a quote is not restated.
 */
import type { ColumnDef, ShellRow } from 'header-content-layout'
import type { PropType } from 'vue'
import { computed } from 'vue'
import { modifiersApplying } from './priceModifiers'
import { priceText } from './priceText'

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

/** The figure in the units the reader chose — see [priceText]. */
const text = computed(() => priceText(Number(props.value)))

/** Which column this is, the two being drawn by the one cell. */
const modified = computed(() => props.column.key === 'modPrice')

/** What was converted, and what the seller asks — the same thing said once. */
const title = computed(() => {
  const converted = String(props.row.fields.price ?? '')
  if (modified.value) {
    return working(converted)
  }
  const native = String(props.row.fields.nativePrice ?? '')
  if (!native || native === converted) {
    return converted
  }
  return `${converted} — seller charges ${native}`
})

/** The tables a factor can be on, as the hover names them. */
const ON: Record<string, string> = {
  colors: 'colour',
  stores: 'seller',
  categories: 'category',
  conditions: 'condition',
  countries: 'country',
  itemTypes: 'type',
  regions: 'region',
  provinces: 'province'
}

/**
 * The price and every factor on it — `EUR 0.10 × 1.2 (colour) × 0.9
 * (seller)` — or the price alone, which says no factor applies.
 */
function working(price: string): string {
  const applied = modifiersApplying(props.row.fields)
  if (!applied.length) {
    return price ? `${price} — no price modifier applies` : ''
  }
  return [price, ...applied.map(({
    entity, factor
  }) => `${factor} (${ON[entity] ?? entity})`)].join(' × ')
}
</script>

<template>
  <span v-if="text" :title="title">{{ text }}</span>
</template>
