<script setup lang="ts">
/**
 * The factor on every lot of one colour, seller, category, condition, country
 * or item type — and the box that sets it.
 *
 * A writing cell on tables nobody owns, as [CellCartQuantity] is: the colours
 * and the sellers are BrickLink's, and every other column of them is read.
 * This one is a number of somebody's own about each row, held apart from the
 * row — see [PriceModifier] — so it is [CellUserNumber]'s box without the
 * `own` guard, and the write goes to the modifiers and never to the row.
 *
 * Blank is no factor, and it is what the box goes back to when cleared; a
 * factor of one would be a row saying nothing. Nought and less are refused at
 * the box and again at the store, a price scaled to nothing being nothing
 * anybody meant.
 */
import type { ColumnDef, ShellRow } from 'header-content-layout'
import type { PropType } from 'vue'
import { ref, watch } from 'vue'
import { setPriceModifierFor } from './userWrites'

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
    default: undefined
  }
})

function shown(value: unknown): string {
  return value === undefined || value === null || value === '' ? '' : String(value)
}

const typed = ref(shown(props.value))

watch(
  () => props.value,
  (value) => {
    typed.value = shown(value)
  }
)

function write() {
  // Stringified before it is trimmed, for the reason [CellUserNumber] gives:
  // `v-model` on a number input hands back a number, not a string.
  const text = String(typed.value ?? '').trim()
  if (!text) {
    void setPriceModifierFor(props.row.entityKey, props.row.fields, undefined)
    return
  }
  const number = Number(text)
  if (!Number.isFinite(number) || number <= 0) {
    // Put back what stands, rather than leaving a refused figure in the box
    // looking as though it took.
    typed.value = shown(props.value)
    return
  }
  void setPriceModifierFor(props.row.entityKey, props.row.fields, number)
}
</script>

<template>
  <!-- The press stops here, as on every cell brickzuke draws itself: reaching
       for a stepper is not a request to be taken somewhere else. -->
  <span
    class="price-modifier"
    @click.stop
  >
    <input
      v-model="typed"
      class="price-modifier__value"
      type="number"
      min="0.01"
      step="0.01"
      placeholder="1"
      title="What to multiply the price of every lot of this by — blank leaves it alone"
      :aria-label="column?.label ?? 'Price modifier'"
      @change="write"
    />
  </span>
</template>

<style scoped>
.price-modifier {
  display: inline-flex;
}

/* The width [CellUserNumber] gives a number, so the boxes read alike. */
.price-modifier__value {
  width: 7ch;
  font: inherit;
  color: inherit;
}
</style>
