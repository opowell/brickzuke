<script setup lang="ts">
/**
 * What can be done with a cart as a whole — one thing, so far: hand it to
 * BrickLink.
 *
 * A button, and beside it what the last press came to. The press itself is
 * [moveCartToBrickLink], which takes as long as the sellers in the cart take
 * to answer, so the cell reads its state off [cartTransfers] rather than
 * waiting on the call: `Adding… 2 of 3 sellers` while it runs, then how many
 * went in, with the lots that did not and why on the hover. A cart with
 * nothing in it has nothing to send, and the button says so instead of
 * sending it.
 *
 * Once something is in the cart over there, a link to it — BrickLink's cart
 * page is where the order is actually placed, and the point of the press is
 * to end up on it.
 */
import type { ColumnDef, ShellRow } from 'header-content-layout'
import type { PropType } from 'vue'
import { computed } from 'vue'
import { BRICKLINK_CART_URL } from '../stores/bricklink/cart-add'
import { cartTransferOf, moveCartToBrickLink } from './cartToBrickLink'

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

const cartId = computed(() => Number(props.row.fields.id))

const empty = computed(() => !(Number(props.row.fields.lots) > 0))

const transfer = computed(() => cartTransferOf(cartId.value))

const working = computed(() => transfer.value?.state === 'working')

const title = computed(() =>
  empty.value
    ? 'The cart holds no lots — put some in from the quantity box on the lots table first'
    : working.value
      ? 'Sending the lots to BrickLink…'
      : 'Put every lot in this cart into your BrickLink cart, one seller at a time. You need to be signed in to BrickLink in this browser.'
)

/** Where the hover on the status is worth a read — and the result after it. */
const detail = computed(() => transfer.value?.detail ?? '')

/** Done, or done in part: either way there is something over there to look at. */
const added = computed(() => {
  const state = transfer.value?.state
  return state === 'done' || (state === 'failed' && /^Added/.test(transfer.value?.text ?? ''))
})

function press() {
  if (empty.value || working.value) {
    return
  }
  void moveCartToBrickLink(cartId.value)
}
</script>

<template>
  <!-- The press stops here, as on every cell brickzuke draws itself: pressing
       a button is not a request to be taken somewhere else. -->
  <span
    class="cart-actions"
    @click.stop
  >
    <button
      type="button"
      class="cart-actions__button"
      :disabled="empty || working"
      :title="title"
      @click="press"
    >
      {{ working ? 'Adding…' : 'Add to BrickLink' }}
    </button>
    <span
      v-if="transfer"
      class="cart-actions__status"
      :class="{
        'cart-actions__status--failed': transfer.state === 'failed',
        'cart-actions__status--done': transfer.state === 'done'
      }"
      :title="detail"
    >
      {{ transfer.text }}
    </span>
    <a
      v-if="added"
      class="cart-actions__link"
      :href="BRICKLINK_CART_URL"
      target="_blank"
      rel="noopener"
      title="Open your cart on BrickLink, in a new tab"
    >
      Open
    </a>
  </span>
</template>

<style scoped>
/* Fills the cell rather than sizing to its text, so the status has a width
   to be cut short at instead of running on into the next column. */
.cart-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  min-width: 0;
}

.cart-actions__button {
  font: inherit;
  color: inherit;
  white-space: nowrap;
}

.cart-actions__button:disabled {
  opacity: 0.5;
}

/* One line, cut short rather than wrapped, with the whole of it on hover —
   which is where the lots that were refused are listed. */
.cart-actions__status {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dc-fg-3);
}

.cart-actions__status--failed {
  color: var(--dc-danger);
}

.cart-actions__status--done {
  color: var(--dc-ok);
}

.cart-actions__link {
  color: inherit;
  white-space: nowrap;
}
</style>
