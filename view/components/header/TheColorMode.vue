<script setup lang="ts">
/**
 * The colour-scheme control: one button cycling auto, light and dark.
 *
 * A button rather than a select because the header is a row of plain buttons
 * and this is one more of them. It shows the setting rather than the state, so
 * `auto` reads as `auto` and not as whichever of the two the system just
 * happens to be answering.
 */
import { colorMode, cycleColorMode, resolvedColorMode } from '../../assets/js/color-mode'

const glyphs = {
  auto: '◐',
  light: '☀',
  dark: '☽',
}
</script>

<template>
  <button
    class="color-mode"
    :title="`Colour scheme: ${colorMode}${colorMode === 'auto' ? ` (${resolvedColorMode})` : ''}`"
    :aria-label="`Colour scheme: ${colorMode}. Press to change.`"
    @click="cycleColorMode"
  >
    {{ glyphs[colorMode] }}
  </button>
</template>

<style scoped>
/*
 * The glyphs have no common baseline, so the header's `align-items: baseline`
 * would step this button up or down as the setting changed.
 */
.color-mode {
  align-self: center;
}
</style>
