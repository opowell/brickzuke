<script setup lang="ts">
/**
 * How many of this piece the stores the current query reaches have on offer.
 *
 * Unlike [CellParts] this never sits blank forever: the field it reads is a
 * per-record fold over every lot brickzuke already holds — see
 * [storeInventoryCounts] — so a cell answers as soon as that one pass has run,
 * whatever it says. What does take time is a `store:` term the fold has never
 * seen before: pressing that filter for the first time is what fetches the
 * seller's own front, the same page browsing them by hand would, and every
 * cell showing that seller's business counts up its dots until it lands.
 *
 * A zero here is a real answer, not a missing one: it says every lot brickzuke
 * holds of this record belongs to a seller the query does not reach. Nothing
 * at all — the dash — says brickzuke holds no lots of the record whatsoever,
 * which is the ordinary case for the great majority of the catalogue: only a
 * seller somebody has actually looked at is known here.
 */
import { pressOptions } from 'header-content-layout'
import type { ColumnDef, ShellRow } from 'header-content-layout'
import { PARAM_EXPR, parseExpression } from 'header-content-layout'
import type { PropType } from 'vue'
import { computed, watch } from 'vue'
import router from '@/router'
import { formatInteger } from '@/assets/js/utils'
import {ensureStoreInventories,
  ensureStoreLots,
  storeInventoriesReady,
  storeInventoryOf,
  storeLotsPending} from './storeInventoryCounts'

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

const record = computed(() => String(props.row.fields.record ?? ''))

/** The expression the shell is showing, which is the one in the URL. */
const expr = computed(() => String(router.currentRoute.value.query[PARAM_EXPR] ?? ''))

/** The one store a plain `store:"…"` term in the query names, if any. */
const addressedStore = computed(() => {
  for (const group of parseExpression(expr.value)) {
    for (const term of group) {
      if (
        term.kind === 'field' &&
        term.field === 'store' &&
        term.comparator === ':' &&
        !term.negated
      ) {
        return term.value
      }
    }
  }
  return undefined
})

const count = computed(() => storeInventoryOf(record.value, expr.value))

const text = computed(() => (count.value === undefined ? '' : String(formatInteger(count.value) ?? '0')))

const counting = computed(() => {
  if (count.value !== undefined) {
    return false
  }
  if (!storeInventoriesReady()) {
    return true
  }
  return Boolean(addressedStore.value && storeLotsPending(addressedStore.value))
})

const title = computed(() => {
  if (count.value !== undefined) {
    return `${count.value} in stock across the stores this query reaches`
  }
  return counting.value
    ? 'Counting stock at the stores this query reaches…'
    : 'No stock on file yet for this piece'
})

/**
 * The fold over every stored lot, asked for once and shared by every cell —
 * see [ensurePartCounts] for the same shape. A `store:` term this session has
 * not fetched yet is what asks BrickLink for it, same as pressing that
 * seller's own front would; a cell just narrows what it is asking about.
 */
void ensureStoreInventories()
watch(
  addressedStore,
  (store) => {
    if (store) {
      ensureStoreLots(store)
    }
  },
  {
    immediate: true
  }
)

/**
 * Pressing the cell, and not the row under it — see [CellParts] for why.
 */
function press(event: MouseEvent) {
  if (!props.column.click) {
    return
  }
  event.stopPropagation()
  props.column.click(props.row, pressOptions(event))
}
</script>

<template>
  <component :is="column.click ? 'button' : 'span'"
             :type="column.click ? 'button' : undefined"
             :title="title"
             @click="press">
    <template v-if="text">{{ text }}</template>
    <span v-else-if="counting" class="counting" aria-hidden="true">
      <span /><span /><span />
    </span>
    <template v-else>—</template>
  </component>
</template>

<style scoped>
/* Same three dots as [CellParts], and the same reason for them. */
.counting {
  display: inline-flex;
  align-items: center;
  gap: 0.18em;
}

.counting span {
  width: 0.28em;
  height: 0.28em;
  border-radius: 50%;
  background: currentColor;
}

.counting span:nth-child(2) {
  animation: bz-store-inventory-second 1.2s steps(1, end) infinite;
}

.counting span:nth-child(3) {
  animation: bz-store-inventory-third 1.2s steps(1, end) infinite;
}

@keyframes bz-store-inventory-second {
  0%,
  33.33% {
    opacity: 0;
  }

  33.34%,
  100% {
    opacity: 1;
  }
}

@keyframes bz-store-inventory-third {
  0%,
  66.66% {
    opacity: 0;
  }

  66.67%,
  100% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .counting span {
    animation: none;
    opacity: 1;
  }
}
</style>
