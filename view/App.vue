<template>
  <ItemsShell />
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import ItemsShell from './components/ItemsShell.vue'
import { initStorageUsageFunction } from './assets/js/init-storage-usage-function'
import { setCounts } from '../model'

onMounted(() => {
  initStorageUsageFunction()
  setCounts()
})
</script>

<style>
/*
 * Dark mode, in full.
 *
 * The page, its ink and its buttons are the few colours brickzuke names, and
 * ItemsShell mounts the appfr shell with `theme="mono-size"` so it draws from
 * them too. They were the browser's system colours — `Canvas`, `CanvasText`,
 * `ButtonFace` — until it showed that each browser picks those for itself and
 * picks them loud: Chrome's dark page is #121212 under near-white ink, Firefox's
 * another dark again, and the light page pure white under pure black. These are
 * VS Code's Modern themes instead, a grey page under grey ink with buttons a
 * step off it, and the same in every browser.
 *
 * `light-dark()` chooses by `color-scheme`, so that is still the whole switch:
 * the inputs and scrollbars, which stay the browser's own, follow it as well.
 * The scheme is the operating system's.
 */
:root {
  color-scheme: light;

  --bz-bg: light-dark(#f8f8f8, #1f1f1f);
  --bz-fg: light-dark(#3b3b3b, #cccccc);
  --bz-raised: light-dark(#ffffff, #2b2b2b);
  --bz-button: light-dark(#e5e5e5, #313131);
  --bz-button-hover: light-dark(#d4d4d4, #3c3c3c);
  --bz-button-border: light-dark(#cecece, #3c3c3c);
  --bz-field: light-dark(#ffffff, #181818);
}

@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
  }
}

body {
  margin: 0;
  background: var(--bz-bg);
  color: var(--bz-fg);
}

/* The shell is the whole window, and its results are the only thing that
   scrolls: the page never does, so the bar and the table's headings stay. */
body:has(.items-shell) {
  overflow: hidden;
}

/* Outside the shell: ItemsShell states the same button for the shell's own. */
button:not(.dc-shell button) {
  background: var(--bz-button);
  border: 1px solid var(--bz-button-border);
  border-radius: 4px;
  color: var(--bz-fg);
}

button:not(.dc-shell button):hover:not(:disabled) {
  background: var(--bz-button-hover);
}

* {
  font-size: 18px;
  font-family: Arial, Helvetica, sans-serif;
  line-height: 18px;
}

#app {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
</style>
