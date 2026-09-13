<script setup lang="ts">
/**
 * One of a fixed few, on a record of somebody's own.
 *
 * The third of the writing cells, and the only one whose choices are not typed:
 * a condition is New, Used, or either, and a `<select>` is what the browser
 * already has for that. The blank option is a real answer rather than an absent
 * one — a wanted part with no condition set will take it in either, which is
 * what the planner does with a line naming none.
 *
 * The choices come from the column's own key, so which field this is and what
 * it may hold are stated in one place.
 */
import type { ColumnDef, ShellRow } from 'header-content-layout'
import type { PropType } from 'vue'
import { computed, ref, watch } from 'vue'
import { recordId, writableRow, writeField } from './userWrites'
import { categoryChoices } from './userCounts'

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

/** What each field may hold, by the column that draws it. */
const CHOICES: Record<string, { value: string; label: string }[]> = {
  condition: [
    {
      value: '',
      label: 'Either'
    },
    // BrickLink's own codes, which is what a lot carries and so what the
    // planner compares against.
    {
      value: 'N',
      label: 'New'
    },
    {
      value: 'U',
      label: 'Used'
    }
  ]
}

/**
 * The choices for this column — fixed for a condition, and read for a category.
 *
 * A category's are BrickLink's couple of thousand and whatever somebody has
 * made, theirs first, so they are not a constant: they come from
 * [userCounts], which re-reads them after every write and so has the new one
 * before the picker next drops. A couple of thousand options is a lot for a
 * `<select>`, and one is drawn per row of somebody's items — bearable for the
 * tens of rows that table runs to, and the browser's own control is still the
 * one that arrives with keyboard search built in.
 */
const choices = computed(() =>
  props.column?.key === 'category'
    ? categoryChoices.value
    : (CHOICES[props.column?.key ?? ''] ?? [])
)

const writable = computed(() => writableRow(props.row))

/** What the picked choice is called, for a row that gets no picker. */
const pickedLabel = computed(
  () => choices.value.find((choice) => choice.value === picked.value)?.label ?? picked.value
)

function shown(value: unknown): string {
  return value === undefined || value === null ? '' : String(value)
}

const picked = ref(shown(props.value))

watch(
  () => props.value,
  (value) => {
    picked.value = shown(value)
  }
)

function write() {
  const id = recordId(props.row.fields)
  const field = props.column?.key
  if (!id || !field) {
    return
  }
  // Blank is "either" for a condition and "none" for a category, which in both
  // cases is the field not being set at all.
  const value = picked.value || undefined
  void writeField(
    props.row.entityKey,
    id,
    field,
    // A category is held as the number that names it — see [userCategoryRef];
    // a condition is a code.
    field === 'category' && value !== undefined ? Number(value) : value
  )
}
</script>

<template>
  <span v-if="!writable">{{ pickedLabel }}</span>
  <span
    v-else
    class="user-pick"
    @click.stop
  >
    <select
      v-model="picked"
      class="user-pick__value"
      :aria-label="column?.label ?? 'Value'"
      @change="write"
    >
      <option
        v-for="choice in choices"
        :key="choice.value"
        :value="choice.value"
      >{{ choice.label }}</option
      >
    </select>
  </span>
</template>

<style scoped>
.user-pick {
  display: inline-flex;
}

.user-pick__value {
  font: inherit;
  color: inherit;
}
</style>
