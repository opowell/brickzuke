<script setup lang="ts">
/**
 * A setting's value, as the control that changes it.
 *
 * The one cell in the catalogue that writes rather than reads. A number field
 * for a number with a stated range, and a `<select>` for a country — in each
 * case the control the browser already has for exactly this, so it arrives
 * with its own steppers or its own list, its own keyboard handling and its own
 * validation, and brickzuke paints none of it.
 *
 * Written on `change` and not on `input`: typing `150` passes through `1` and
 * `15` on the way, and a fill that restarted at each of those would be three
 * runs for one edit. The clamp is in [setSetting], so what a reader types is
 * held to the range whatever the field lets through.
 *
 * The countries are the directory's own, read from the store when the cell
 * mounts: BrickLink lists them, and a country nobody sells from is not one an
 * order can be posted from. Blank is a real choice — no country yet — and a
 * stored code the directory has not fetched is kept as a choice of its own, so
 * the picker never shows a value other than the one that is set.
 */
import type { ColumnDef, ShellRow } from 'header-content-layout'
import type { PropType } from 'vue'
import { computed, onMounted, ref } from 'vue'
import { setSetting, settingFor } from './settings'
import { readCountries } from './storesFetch'

const props = defineProps({
  row: {
    type: Object as PropType<ShellRow>,
    required: true
  },
  // Passed by the shell alongside `row`; declared so it does not land on the
  // control as a stray attribute.
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

const setting = computed(() => settingFor(String(props.row.fields.setting ?? '')))

/** The directory's countries, by name, once read. */
const countries = ref<{ value: string; label: string }[]>([])

onMounted(async () => {
  if (setting.value?.kind !== 'country') {
    return
  }
  const stored = await readCountries()
  countries.value = stored
    .map((country) => ({
      value: country.countryCode,
      label: country.countryName
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
})

/** Blank first, then the countries — and the set code among them, whatever it is. */
const choices = computed(() => {
  const current = setting.value?.kind === 'country' ? setting.value.value.value : ''
  const known = countries.value.some((country) => country.value === current)
  return [
    {
      value: '',
      label: 'Not set'
    },
    ...(current && !known ? [{
      value: current,
      label: current 
    }] : []),
    ...countries.value
  ]
})

function write(event: Event) {
  const field = event.target as HTMLInputElement | HTMLSelectElement
  const key = String(props.row.fields.setting ?? '')
  setSetting(key, setting.value?.kind === 'country' ? field.value : Number(field.value))
}
</script>

<template>
  <!--
    The press stops here. A row press narrows the whole result set to that
    record, and reaching for a stepper is not a request to be taken somewhere
    else — see the same guard on every cell brickzuke draws itself.
  -->
  <span
    v-if="setting"
    class="setting"
    @click.stop
  >
    <select
      v-if="setting.kind === 'country'"
      class="setting__pick"
      :value="setting.value.value"
      :aria-label="setting.name"
      @change="write"
    >
      <option
        v-for="choice in choices"
        :key="choice.value"
        :value="choice.value"
      >{{ choice.label }}</option
      >
    </select>
    <template v-else>
      <input
        class="setting__value"
        type="number"
        :value="setting.value.value"
        :min="setting.min"
        :max="setting.max"
        :aria-label="setting.name"
        @change="write"
      />
      <span
        v-if="setting.unit"
        class="setting__unit"
      >{{ setting.unit }}</span
      >
    </template>
  </span>
</template>

<style scoped>
.setting {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
}

/*
 * Wide enough for the longest value any number here takes — five figures, the
 * pause being in milliseconds — so the column does not resize as one is typed.
 */
.setting__value {
  width: 7ch;
  font: inherit;
  color: inherit;
}

/* The column's width, less the shell's padding: a country name wants the room. */
.setting__pick {
  max-width: 100%;
  font: inherit;
  color: inherit;
}

.setting__unit {
  opacity: 0.7;
}
</style>
