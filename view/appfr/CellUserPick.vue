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
import { recordId, writeField } from './userWrites'
import { userCategoryChoices } from './userCounts'

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
 * A category's are whatever somebody has made, so they are not a constant: they
 * come from [userCounts], which re-reads them after every write and so has the
 * new one before the picker next drops.
 */
const choices = computed(() =>
  props.column?.key === 'usercategory'
    ? userCategoryChoices.value
    : (CHOICES[props.column?.key ?? ''] ?? [])
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
    // A category is held as the number it is keyed by; a condition is a code.
    field === 'usercategory' && value !== undefined ? Number(value) : value
  )
}
</script>

<template>
  <span
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
