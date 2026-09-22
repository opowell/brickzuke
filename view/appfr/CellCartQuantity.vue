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
 *
 * Where the header has proposed a figure for this lot — see [cartDraft] — the
 * box shows that instead, marked as proposed, until Apply writes it or Reset
 * drops it. Typing into the box is the word for this lot either way: it
 * writes at once, and the proposal for it goes.
 *
 * The row carries its own Max, 0, Apply, Reset too — what the header's do to
 * the whole table, done to this one lot, through the same draft.
 */
import type { ColumnDef, ShellRow } from 'header-content-layout'
import type { PropType } from 'vue'
import { computed, ref, watch } from 'vue'
import { cartQuantityOf } from './activeCart'
import { draftQuantityOf, dropDraft, proposeOne } from './cartDraft'
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

/**
 * What the cart holds of this lot now.
 *
 * Off the held lines rather than off `value`: the row was built with the
 * figure the cart held then, and a write from this column does not rebuild
 * the row — see [userRevision] for why not. The lines are refreshed on every
 * write, so this is the figure after Apply, where `value` is the one before
 * it; the box fell back to that and went blank over a line it had just
 * written.
 */
const held = computed(() => cartQuantityOf(props.row.fields.id))

const typed = ref(shown(held.value))

/** The header's proposal for this lot, where it made one. */
const proposed = computed(() => draftQuantityOf(props.row.fields.id))

/*
 * The box follows the proposal while there is one, and the stored figure
 * otherwise — including the moment the proposal is dropped, when it has to
 * fall back to what the cart holds rather than keep the number it was showing.
 */
watch(
  [held, proposed],
  ([value, draft]) => {
    typed.value = draft === undefined ? shown(value) : String(draft)
  },
  {
    immediate: true
  }
)

const active = computed(() => activeCart.value !== '')

/** What the seller has, which is the most that can go in. */
const available = computed(() => {
  const held = Number(props.row.fields.quantity)
  return Number.isFinite(held) && held > 0 ? held : undefined
})

const title = computed(() =>
  !active.value
    ? 'Choose an active cart in Settings first, or make one on the Carts table'
    : proposed.value !== undefined
      ? 'Proposed by the buttons over the column — Apply writes it, Reset drops it, typing here writes this lot now'
      : 'How many of this lot to put in the active cart — blank or 0 takes it out'
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
      :class="{ 'cart-quantity__value--proposed': proposed !== undefined }"
      type="number"
      min="0"
      :max="available"
      step="1"
      :disabled="!active"
      :title="title"
      :aria-label="column?.label ?? 'Cart'"
      @change="write"
    />
    <button
      type="button"
      class="cart-quantity__button"
      :disabled="!active"
      title="Propose the most the seller has of this lot — Apply writes it"
      @click="proposeOne(row, 'max')"
    >
      Max
    </button>
    <button
      type="button"
      class="cart-quantity__button"
      :disabled="!active"
      title="Propose none of this lot — Apply takes it out of the cart"
      @click="proposeOne(row, 'none')"
    >
      0
    </button>
    <button
      type="button"
      class="cart-quantity__button"
      :disabled="!active || proposed === undefined"
      title="Write the proposed figure to the cart"
      @click="write"
    >
      Apply
    </button>
    <button
      type="button"
      class="cart-quantity__button"
      :disabled="proposed === undefined"
      title="Drop what is proposed, so the box reads what the cart holds"
      @click="dropDraft(row.fields.id)"
    >
      Reset
    </button>
  </span>
</template>

<style scoped>
.cart-quantity {
  display: inline-flex;
  align-items: center;
  gap: 4px;
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

/* Proposed and not yet written: the same box, edged in a dashed line, which
   is the difference between a figure the cart holds and one it might. */
.cart-quantity__value--proposed {
  outline: 1px dashed currentColor;
  outline-offset: 1px;
}

/* Tighter than the table's other buttons, there being four of them beside a
   box: the shell's padding is for a cell on its own. */
.cart-quantity__button {
  padding: 1px 5px;
  font: inherit;
  color: inherit;
}
</style>
