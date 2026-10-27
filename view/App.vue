<template>
  <!-- Prototype: ?appfr=1 swaps TableComponent for header-content-layout. -->
  <ItemsShell v-if="useAppfr" />
  <template v-else>
    <TheHeader />
    <div v-if="!selectedItemType">
      <button @click="fetchBrickLink">Update BrickLink</button>
      <button @click="updateCatalogTree">Update BrickLink Categories</button>
      <button @click="fetchBrickLinkColorGuide">Update BrickLink Color Guide</button>
      <button @click="fetchCatalogPage">Update BrickLink Item Types</button>
    </div>
    <TheContent />
    <PulseMonitor />
  </template>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import TheHeader from './components/TheHeader.vue'
import ItemsShell from './components/ItemsShell.vue'
import TheContent from './components/TheContent.vue'
import PulseMonitor from './components/PulseMonitor.vue'
import { initStorageUsageFunction } from './assets/js/init-storage-usage-function'
import { fetchCatalogPage, fetchBrickLink, updateCatalogTree } from '../sources/bricklink'
import { makeCall as fetchBrickLinkColorGuide } from '../sources/bricklink/color-guide'
import { filters, itemTypes, pauseRedirect, search, selectedItemType, selectedItemTypeId, setCounts, shellOwnsUrl, updateView } from '../model'
import { useRoute, useRouter } from 'vue-router'
import { getDbConnection } from '../idb/idb'
import { loadCategory } from '../idb/category'
const router = useRouter()
const route = useRoute()
const useAppfr = shellOwnsUrl

const filterDisplayLabelMap = {
  category: 'Category',
  color: 'Color',
  itemType: 'Item type',
  item: 'Item',
}

async function getFilterDisplayValue(key: string, value: string): Promise<string | undefined> {
  const db = await getDbConnection()
  switch (key) {
    case 'category':
    {
      const category = await loadCategory(db, Number.parseInt(value))
      return category.name || value
    }
  }
  db.close()
}

async function processUrl() {
  console.log('processUrl', route, route?.query)
  if (!route?.query) {
    return
  }
  // The shell's `v` is a view and its `s` is a sort field. Reading them as a
  // selected type and a search would import the shell's query as nonsense.
  if (shellOwnsUrl.value) {
    return
  }
  pauseRedirect.value = true
  const queryView = route.query.v?.toString()
  if (queryView) {
    const type = itemTypes.value.find(t => t.id === queryView)
    if (type) {
      selectedItemType.value = type
    }
  }
  search.value = route.query.s?.toString()
  selectedItemTypeId.value = route.query.v?.toString()
  const filtersString = route.query.f?.toString()
  filters.value = []
  if (filtersString) {
    const filterStrings = filtersString.split(',')
    for (let i = 0; i < filterStrings.length; i++) {
      const fs = filterStrings[i]
      const parts = fs.split('_')
      filters.value.push({
        key: parts[0],
        value: parts[1],
        label: filterDisplayLabelMap[parts[0] as keyof typeof filterDisplayLabelMap] || parts[0],
        displayValue: await getFilterDisplayValue(parts[0], parts[1]),
      })
    }
  }
  // const sortsString = route.query.b?.toString()
  // if (sortsString) {
  //   sorts.value = sortsString.split(',').map((bs) => {
  //     const parts = bs.split('_')
  //     return {
  //       key: parts[0],
  //       dir: parts[1],
  //     }
  //   })
  // } else {
  //   sorts.value = []
  // }
  pauseRedirect.value = false
  updateView()
}

onMounted(async () => {
  initStorageUsageFunction()
  // initBrickLinkWorker()
  await router.isReady()
  await processUrl()
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
 *
 * `data-theme` is written onto <html> by view/assets/js/color-mode.ts, always
 * as a concrete `light` or `dark`. The media query is what holds before that
 * script has run, so the first paint is already the right one.
 */
:root {
  color-scheme: light;

  --bz-bg: light-dark(#f8f8f8, #1f1f1f);
  --bz-fg: light-dark(#3b3b3b, #cccccc);
  --bz-raised: light-dark(#ffffff, #2b2b2b);
  --bz-button: light-dark(#e5e5e5, #313131);
  --bz-button-hover: light-dark(#d4d4d4, #3c3c3c);
  --bz-button-border: light-dark(#cecece, #3c3c3c);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    color-scheme: dark;
  }
}

:root[data-theme='dark'] {
  color-scheme: dark;
}

body {
  background: var(--bz-bg);
  color: var(--bz-fg);
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
