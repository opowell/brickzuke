/**
 * The one place the colour scheme is decided.
 *
 * brickzuke paints almost nothing: its screens are browser-default text,
 * buttons and inputs, and the appfr shell is mounted with `theme="inherit"`
 * so it takes its colours from the host too. Dark mode is therefore not a
 * palette but a single CSS `color-scheme` switch — see the rules in App.vue.
 *
 * All this module does is decide which of `light` and `dark` is in force and
 * write it to `<html data-theme>`, where that CSS can see it. `useColorMode`
 * resolves `auto` against the system setting, so the attribute is always one
 * of the two concrete values even while the stored choice is `auto`.
 */
import { useColorMode } from '@vueuse/core'
import { computed } from 'vue'

/**
 * A module-level instance rather than a call per component: every caller then
 * reads and writes the same ref, and the header's control and the page it
 * recolours cannot disagree.
 */
const mode = useColorMode({
  attribute: 'data-theme',
  storageKey: 'brickzuke-color-mode',
})

/** The three settings, in the order the header cycles them. */
export const COLOR_MODES = ['auto', 'light', 'dark'] as const

export type ColorMode = (typeof COLOR_MODES)[number]

/**
 * The setting as chosen, which is the one thing the plain `useColorMode` ref
 * will not tell you: it resolves `auto` to the system's answer before handing
 * the value back, so a control bound to it could never show `auto` and could
 * never be cycled through it. `store` is the choice itself.
 */
export const colorMode = computed<ColorMode>({
  get: () => mode.store.value as ColorMode,
  set: (value) => {
    mode.store.value = value
  },
})

/** What that setting currently amounts to, with `auto` resolved. */
export const resolvedColorMode = mode.state

/** Advance to the next setting, wrapping past the end. */
export function cycleColorMode() {
  const next = (COLOR_MODES.indexOf(colorMode.value) + 1) % COLOR_MODES.length
  colorMode.value = COLOR_MODES[next]
}
