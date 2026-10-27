<script setup lang="ts">
import { ref } from 'vue'

const showPulse = ref(false)
document.addEventListener('pulse', async function () {
  showPulse.value = true
  setTimeout(() => {
    showPulse.value = false
  }, 200)
})
</script>

<template>
  <div class="pulse" :class="{ 'pulse-show': showPulse }"></div>
</template>

<style scoped>
/*
 * Mixed from the page's own ink and paper rather than fixed greys: a fixed
 * #aaa dot under a #333 ring is a light-mode object, and on a dark page it
 * read as a bright blob in a ring nobody could see against the background.
 * Stated this way the dot stays a mid-tone and the ring stays darker than it
 * in either scheme.
 */
.pulse {
  border-radius: 50%;
  width: 1rem;
  height: 1rem;
  color: color-mix(in oklab, var(--bz-fg) 55%, var(--bz-bg));
  opacity: 0;
  position: absolute;
  bottom: 2rem;
  right: 2rem;
  transition: opacity 0.1s ease-in;
  background-color: color-mix(in oklab, var(--bz-fg) 35%, var(--bz-bg));
  border: 1px solid color-mix(in oklab, var(--bz-fg) 75%, var(--bz-bg));
}
.pulse-show {
  opacity: 1;
}
</style>
