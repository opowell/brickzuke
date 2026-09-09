<script setup lang="ts">
/**
 * What a set is made of, as a number that opens the list behind it.
 *
 * Unlike every other count in the catalogue this one is not stored anywhere
 * until somebody asks for it — BrickLink states an inventory a page at a time,
 * so 199,000 items is 199,000 requests and there is nothing to pre-populate.
 * That leaves the column with three states rather than one, and telling them
 * apart is the point of drawing it with a component:
 *
 * - a set already opened states its count, taken from [partCounts], which is
 *   live: open a set and the cell it was pressed from fills in behind it.
 * - a set still to be looked at counts up its dots. Every uncounted cell puts
 *   its set on [partsFill]'s backlog, which works through them one at a time,
 *   so the animation is not decoration — it is the honest answer to "why is
 *   this blank", and it stops when the answer arrives.
 * - a set that was asked about and came back with nothing keeps the dash. It
 *   is not loading, and animating it would say it was: plenty of old sets have
 *   no inventory on file, and their cells are finished rather than waiting.
 *
 * All three stay pressable, because pressing is what opens the listing — and
 * for the last of them, what asks BrickLink a second time.
 *
 * A row that is not made of anything — a part, an instruction sheet — draws no
 * cell at all, rather than a button leading to an empty table.
 */
import type { ColumnDef, ShellRow } from 'header-content-layout'
import type { PropType } from 'vue'
import { computed, onMounted } from 'vue'
import { formatInteger } from '@/assets/js/utils'
import { hasInventory } from './inventoryFetch'
import { ensurePartCounts, partCounts } from './partCounts'
import { requestPartCount, stillExpected } from './partsFill'

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

/** The BrickLink id a set's inventory is keyed by, which every row here carries. */
const record = computed(() => String(props.row.fields.record ?? ''))

const listable = computed(() => hasInventory(record.value))

const held = computed(() => partCounts.value[record.value])

/** The count, or nothing at all when there is not one yet. */
const text = computed(() => (held.value ? String(formatInteger(held.value.parts) ?? '') : ''))

const counting = computed(() => !held.value && stillExpected(record.value))

/**
 * Why the number and the listing disagree, said where it is asked: the count
 * is pieces and the listing is one row per part and colour. The other two
 * states say which of them the cell is in, the dots being clear that something
 * is happening but not what.
 */
const title = computed(() => {
  const count = held.value
  if (count) {
    return `${count.parts} parts in ${count.lots} lots`
  }
  return counting.value
    ? "Counting this set's parts…"
    : 'No parts listed for this set — open it to look again'
})

/**
 * Ask for the count, then ask for the set.
 *
 * The pass over what is stored is one read for the whole table, held for the
 * session. What it does not have is put on [partsFill]'s backlog, which is the
 * lazy half of this column: a cell counting its dots is a cell that has said
 * it wants a number, and the fill works through those a set at a time, behind
 * anything a person is waiting on.
 *
 * Ordered — counts first, then the ask — so a set already stored is never
 * queued for a page the app has read before.
 */
onMounted(async () => {
  await ensurePartCounts()
  if (!held.value) {
    requestPartCount(record.value)
  }
})

/**
 * Pressing the cell, and not the row under it.
 *
 * A row press narrows the whole result set to that record — see `rowPress` in
 * ItemsShell — and a cell that leads somewhere of its own cannot also be the
 * row's way in: without this, one press on a count both opened the list it
 * counts and narrowed to the row it was on, which is two navigations for one
 * click. The shell's own cells do exactly this; a cell brickzuke draws itself
 * has to say it itself.
 *
 * Guarded rather than unconditional, because a column with nothing to press is
 * drawn here as plain text, and plain text in a row is part of the row.
 */
function press(event: MouseEvent) {
  if (!props.column.click) {
    return
  }
  event.stopPropagation()
  props.column.click(props.row)
}
</script>

<template>
  <template v-if="listable">
    <component :is="column.click ? 'button' : 'span'"
               :type="column.click ? 'button' : undefined"
               :title="title"
               @click="press">
      <template v-if="text">{{ text }}</template>
      <!-- The dots say nothing a reader needs: the title above already names
           the button "Counting this set's parts…". -->
      <span v-else-if="counting" class="counting" aria-hidden="true">
        <span /><span /><span />
      </span>
      <template v-else>—</template>
    </component>
  </template>
</template>

<style scoped>
/*
 * One, two, three dots and round again.
 *
 * Three dots that are always laid out, two of which come and go: sizing the
 * cell off however many are lit would shuffle the column on every frame. The
 * first is always on, so the count reads 1-2-3 rather than 0-1-2-3 — there is
 * no frame where the cell looks empty.
 */
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
  animation: bz-parts-second 1.2s steps(1, end) infinite;
}

.counting span:nth-child(3) {
  animation: bz-parts-third 1.2s steps(1, end) infinite;
}

@keyframes bz-parts-second {
  0%,
  33.33% {
    opacity: 0;
  }

  33.34%,
  100% {
    opacity: 1;
  }
}

@keyframes bz-parts-third {
  0%,
  66.66% {
    opacity: 0;
  }

  66.67%,
  100% {
    opacity: 1;
  }
}

/* Still three dots, just not moving: the cell says the same thing either way. */
@media (prefers-reduced-motion: reduce) {
  .counting span {
    animation: none;
    opacity: 1;
  }
}
</style>
