<script setup lang="ts">
/**
 * Prototype: the `items` table drawn by header-content-layout instead of
 * TableComponent. Reachable at `?appfr=1`.
 *
 * The shell owns the address bar here: `createVueRouterAdapter` makes every
 * query change an ordinary navigation, so the query is a link someone can
 * paste and the back button works. brickzuke's own writer stands down while
 * this is up — see `shellOwnsUrl` in model.ts.
 *
 * It is also meant to look like the table it replaces, which is to say like
 * nothing: brickzuke styles no cell, so what is pressable here is a plain
 * browser button and what is not is plain text. `theme="inherit"` takes the
 * host's font, and the three tokens below turn off the decoration that theme
 * still brings — the accent colour that makes a button read as a link, and the
 * capitals and tracking on the header row.
 */
import {DataShell,
  PARAM_ENTITY,
  createVueRouterAdapter,
  parseQuery,
  serializeQuery} from 'header-content-layout'
import type { ShellQuery } from 'header-content-layout'
import 'header-content-layout/style.css'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { catalogSchema } from '../appfr/catalogSchema'
import { catalogSource } from '../appfr/catalogSource'
import { colorItemsNotice } from '../appfr/colorItemsNotice'
import { openedQuery, shellDefaultsFor } from '../appfr/openingOrder'

const router = useRouter()
const route = createVueRouterAdapter(router)

/**
 * The type the URL names, and so the type whose opening order is in force: a
 * URL that states no sort falls back to the one that type opens in, rather
 * than to one name-ascending default for every table.
 */
const urlEntity = computed(() => {
  const named = router.currentRoute.value.query[PARAM_ENTITY]
  return typeof named === 'string' ? named : null
})

const shellDefaults = computed(() => shellDefaultsFor(urlEntity.value))

/**
 * The shell's own writer, so the query it reads back is the query written here
 * — and so `appfr=1`, which is not the shell's, is left alone. It replaces
 * rather than pushes, so Back from the table reaches the home screen instead of
 * a cards view nobody asked for.
 */
let shownEntity = parseQuery(window.location.search, catalogSchema.value, shellDefaults.value)
  .entity

function onQueryChange(query: ShellQuery) {
  const opened = openedQuery(query, shownEntity)
  shownEntity = query.entity
  if (opened === query) {
    return
  }
  void router.replace(
    '/' + serializeQuery(opened, catalogSchema.value, shellDefaults.value, window.location.search)
  )
}

const plainTokens = {
  '--dc-accent': 'currentColor',
  '--dc-caps': 'none',
  '--dc-tracking-caps': 'normal'
}
</script>

<template>
  <!-- The shell fills the box it is given, so give it a height. -->
  <div class="items-shell">
    <!--
      No `@activate`: a row press reports one, and the original table has no
      row press at all. Every cell that leads somewhere says so itself.
    -->
    <DataShell
      :schema="catalogSchema"
      :source="catalogSource"
      :route="route"
      theme="inherit"
      :tokens="plainTokens"
      :previews-per-type="0"
      :defaults="shellDefaults"
      @query-change="onQueryChange"
    >
      <!--
        A colour too long to fetch whole says so beside the count, which is the
        number it would otherwise be quietly contradicting.
      -->
      <template #actions>
        <span
          v-if="colorItemsNotice"
          class="items-shell__partial"
          title="This colour runs to more pages than brickzuke fetches at once, so the list below is not all of it."
        >{{ colorItemsNotice }}</span
        >
      </template>
    </DataShell>
  </div>
</template>

<style scoped>
/*
 * A flex column, not just a tall box: `.dc-shell` is `flex: 1 1 auto` with
 * `overflow: hidden`, so in a plain block it takes only the height of whatever
 * it is currently drawing and clips anything larger — which is what cut the
 * query panel off over the short home screen.
 */
.items-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

/*
 * `all: revert` drops the shell's cell and header buttons back to the browser's
 * own, which is the whole of the styling the original has.
 */
.items-shell :deep(.dc-table__open),
.items-shell :deep(.dc-table__sort) {
  all: revert;
}

/*
 * brickzuke's home screen is a summary and nothing else: a labelled count per
 * type, no preview rows. `previews-per-type="0"` asks for none, which leaves
 * every card saying "Nothing here yet" about rows it was never going to show.
 */
.items-shell :deep(.dc-type__empty) {
  display: none;
}

/*
 * And the shell dims a card that has no rows under it, which is now every card.
 * A count is the whole point of this screen, so none of them is faded.
 */
.items-shell :deep(.dc-type[data-dc-empty='true']) {
  opacity: 1;
}

/*
 * The shell fades the results while a source still has its sink open, and this
 * one keeps it open for the whole scan — it is still counting the matches the
 * pager needs. Nothing is actually inert, so nothing should read as inert:
 * brickzuke counts in the background everywhere else and fades nothing.
 */
.items-shell :deep(.dc-results[data-dc-pending='true']) {
  opacity: 1;
}

/*
 * The caveat is a caveat: present where the count is, and not competing with
 * it. Dimmed rather than coloured, brickzuke's tables having no palette to
 * spend and the shell exposing no token for secondary ink.
 */
.items-shell__partial {
  opacity: 0.7;
  font-size: 0.85em;
  white-space: nowrap;
}

/* A row is not pressable, so it must not offer itself as one. */
.items-shell :deep(.dc-table__row),
.items-shell :deep(.dc-table__row:hover) {
  background: none;
  cursor: default;
}
</style>
