<script setup lang="ts">
/**
 * What a seller would charge to post the order, with the currency after it.
 *
 * Not [CellPrice], which leaves the currency to the header, because here it
 * cannot be: the lots are all converted into the one currency, but a seller's
 * postage is read off their own terms in their own currency, and a column
 * that says `6.61` for an Austrian and `7.35` for an American is comparing
 * euros with dollars without saying so. Each figure names its own.
 *
 * The hover is the line the figure was read off, under the heading it sat
 * under — the reading is a guess, and this is what to check it against. A
 * seller with no figure says why in the secondary ink, and a seller nobody
 * has asked yet says nothing.
 *
 * The figure is in the units the price units setting names, and the currency
 * after it says so — `499 EUR cents`, `4.99 EUR` — see [priceText].
 */
import type { ColumnDef, ShellRow } from 'header-content-layout'
import type { PropType } from 'vue'
import { computed } from 'vue'
import { priceText, priceUnitsPhrase } from './priceText'

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

/** Whole cents: postage is counted in them, unlike a bulk lot's price — see [priceText]. */
const figure = computed(() =>
  props.value === undefined || props.value === '' ? '' : priceText(Number(props.value), true)
)

const currency = computed(() => priceUnitsPhrase(String(props.row.fields.postageCurrency ?? '')))
const source = computed(() => String(props.row.fields.postageSource ?? ''))
const note = computed(() => String(props.row.fields.postageNote ?? ''))
</script>

<template>
  <span v-if="figure" :title="source">{{ figure }} <span class="currency">{{ currency }}</span></span>
  <span v-else-if="note" class="note">{{ note }}</span>
</template>

<style scoped>
.currency,
.note {
  color: var(--dc-fg-3);
}
.currency {
  font-size: var(--dc-text-meta);
}
</style>
