<script setup lang="ts">
/**
 * The buttons over the Cart column: the whole table's boxes at once.
 *
 * Max and 0 fill a draft — every lot the query matches, or every ticked one,
 * proposed at what the seller has or at none — which the boxes show in place
 * of what the cart holds. Apply writes it; Reset drops it. See [cartDraft]
 * for why the four are a draft and not four writes, and [ColumnDef.header]
 * for how a header comes to hold them at all.
 *
 * Disabled rather than hidden while no cart is active, as the boxes are, so
 * the column reads the same whether or not there is a cart to fill; and Apply
 * and Reset are disabled while there is nothing proposed, which is what tells
 * a reader whether the boxes are showing the cart or a proposal for it.
 */
import type { ColumnDef, EntitySchema } from 'header-content-layout'
import type { PropType } from 'vue'
import { computed, ref } from 'vue'
import { cartSelection, draftCount, proposeAll, resetDraft } from './cartDraft'
import { activeCart } from './settings'
import { applyCartDraft } from './userWrites'

defineProps({
  column: {
    type: Object as PropType<ColumnDef>,
    required: true
  },
  entity: {
    type: Object as PropType<EntitySchema | null>,
    default: null
  }
})

const active = computed(() => activeCart.value !== '')

/** How many are ticked, which is what Max and 0 are then for. */
const ticked = computed(() => cartSelection.value.length)

const scope = computed(() =>
  ticked.value ? `the ${ticked.value} ticked lot${ticked.value === 1 ? '' : 's'}` : 'every lot on this table'
)

/** Whether a press is still being worked out, so it cannot be made twice. */
const busy = ref(false)

async function run(work: () => Promise<void>) {
  if (busy.value) {
    return
  }
  busy.value = true
  try {
    await work()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <span
    class="cart-header"
    @click.stop
  >
    <button
      type="button"
      class="cart-header__button"
      :disabled="!active || busy"
      :title="`Propose ${scope} at as many as the seller has — Apply writes it`"
      @click="run(() => proposeAll('max'))"
    >
      Max
    </button>
    <button
      type="button"
      class="cart-header__button"
      :disabled="!active || busy"
      :title="`Propose none of ${scope} — Apply takes them out of the cart`"
      @click="run(() => proposeAll('none'))"
    >
      0
    </button>
    <button
      type="button"
      class="cart-header__button"
      :disabled="!active || !draftCount || busy"
      :title="draftCount ? `Write the ${draftCount} proposed figure${draftCount === 1 ? '' : 's'} to the cart` : 'Nothing proposed — Max or 0 first'"
      @click="run(applyCartDraft)"
    >
      <!-- Not `Apply {{ draftCount }}`: a Max with nothing ticked can propose
           thousands of rows, and this header's width is fixed — a count with
           no bound would grow past it and the shell clips the whole span,
           taking Reset with it and leaving no way back. The count is still
           the title above. -->
      Apply
    </button>
    <button
      type="button"
      class="cart-header__button"
      :disabled="!draftCount || busy"
      title="Drop what is proposed, so the boxes read what the cart holds"
      @click="resetDraft"
    >
      Reset
    </button>
  </span>
</template>

<style scoped>
.cart-header {
  display: inline-flex;
  gap: 4px;
  /* A header is set in the shell's small caps; the buttons are words. */
  text-transform: none;
  letter-spacing: normal;
}

/* Tighter than the table's other buttons, there being four of them on one
   line: the shell's padding is for a cell, and these share a header. */
.cart-header__button {
  padding: 1px 5px;
  font: inherit;
  color: inherit;
}
</style>
