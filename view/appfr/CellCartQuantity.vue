<script setup lang="ts">
/**
 * How many of a lot are in the active cart — and the box that changes it.
 *
 * The one writing cell on a table nobody owns. The lots are BrickLink's, and
 * every other column of them is read; this one is a number of somebody's own
 * about each lot, held in a cart line rather than on the lot — see [CartLine].
 * So it is [CellUserNumber]'s box without its `own` guard, since the row is
 * never theirs and the write is never to the row.
 *
 * Blank is no line, and nought is the same thing said by typing: either takes
 * the lot out of the cart. Capped at what the seller has, the box's `max`
 * saying so before the write and [setCartQuantity] holding to it after.
 *
 * Disabled, and says why, while no cart is active: the box is still drawn so
 * the column reads as what it is, and the title is where to go to make it take.
 */
import type { ColumnDef, ShellRow } from 'header-content-layout'
import type { PropType } from 'vue'
import { computed, ref, watch } from 'vue'
import { activeCart } from './settings'
import { setCartQuantity } from './userWrites'

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

const active = computed(() => activeCart.value !== '')

/** What the seller has, which is the most that can go in. */
const available = computed(() => {
  const held = Number(props.row.fields.quantity)
  return Number.isFinite(held) && held > 0 ? held : undefined
})

const title = computed(() =>
  active.value
    ? 'How many of this lot to put in the active cart — blank or 0 takes it out'
    : 'Choose an active cart in Settings first, or make one on the Carts table'
)

function write() {
  if (!active.value) {
    return
  }
  // Stringified before it is trimmed, for the reason [CellUserNumber] gives:
  // `v-model` on a number input hands back a number, not a string.
  const text = String(typed.value ?? '').trim()
  const number = text ? Number(text) : 0
  if (!Number.isFinite(number) || number < 0) {
    return
  }
  void setCartQuantity(props.row.fields, number)
}
</script>

<template>
  <!-- The press stops here, as on every cell brickzuke draws itself: reaching
       for a stepper is not a request to be taken somewhere else. -->
  <span
    class="cart-quantity"
    @click.stop
  >
    <input
      v-model="typed"
      class="cart-quantity__value"
      type="number"
      min="0"
      :max="available"
      step="1"
      :disabled="!active"
      :title="title"
      :aria-label="column?.label ?? 'Cart'"
      @change="write"
    />
  </span>
</template>

<style scoped>
.cart-quantity {
  display: inline-flex;
}

/* The width [CellUserNumber] gives a quantity, so the two read alike. */
.cart-quantity__value {
  width: 7ch;
  font: inherit;
  color: inherit;
}

.cart-quantity__value:disabled {
  opacity: 0.5;
}
</style>
