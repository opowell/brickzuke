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
 * nothing. `theme="mono-size"` is the shell at its plainest: it takes the
 * page's background, ink and colour scheme, and it gives up the type scale as
 * well, so a heading, a chip, a cell and a caveat are all set at the one size
 * brickzuke sets on everything else.
 *
 * One token on top of it. Having no palette of its own, that theme borrows the
 * operating system's accent for whatever is pressable, which here is most of
 * the table — every cell that leads somewhere is a button, and they would all
 * have come out blue. The minimal palette spends no hue at all and this is the
 * closest brickzuke can stand to it: pressable cells stay the colour of the
 * text around them, and say what they lead to in words instead.
 *
 * What that replaced was `all: revert` on the two cell buttons, meant to drop
 * them back to the browser's own. It did: a bare `<button>` is 13.3px Arial,
 * so every pressable cell came out smaller than the plain text beside it,
 * which is the difference that was showing in the table. The shell already
 * gives its buttons `font: inherit`; it only needed a theme that was not
 * setting a size of its own on top.
 */
import {DataShell,
  PARAM_ENTITY,
  ResultsArea,
  createVueRouterAdapter,
  isTypeCardsQuery,
  parseQuery,
  serializeQuery} from 'header-content-layout'
import type { ShellQuery } from 'header-content-layout'
import 'header-content-layout/style.css'
import { computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { refreshCounts } from '../appfr/catalogCounts'
import { startHomeFill, stopHomeFill } from '../appfr/homeFill'
import { catalogSchema } from '../appfr/catalogSchema'
import { catalogSource } from '../appfr/catalogSource'
import { colorItemsNotice } from '../appfr/colorItemsNotice'
import { storeLotsNotice } from '../appfr/storeLotsNotice'
import { openedQuery, shellDefaultsFor } from '../appfr/openingOrder'
import { rememberType } from '../appfr/recentTypes'
import HomeCards from '../appfr/HomeCards.vue'

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
 * Whether a press on a row means anything on the table that is up.
 *
 * appfr 0.21.0 made a row press narrow the whole result set to that record,
 * which is the move the `→` beside the name used to make on its own — the
 * smaller of the two controls doing the more useful thing. brickzuke takes the
 * default: the gesture is one it already shipped, and it now has the row to hit
 * rather than an arrow.
 *
 * But only a type declaring a `scope` carries a field the other records name it
 * by, and a press on one that does not is reported and dropped, brickzuke
 * handling no `activate`. So the shell's own hover and hand are let through for
 * the types that can be narrowed to, and held back for the rest: a row that
 * does nothing must not offer itself as a row that does.
 */
const narrowsRows = computed(() => {
  const key = urlEntity.value
  return Boolean(key && catalogSchema.value.entities.find((entity) => entity.key === key)?.scope)
})

/**
 * The home screen's counts, taken every time it is reached — and, on the way
 * out, which type was opened.
 *
 * The counts are here rather than in the schema because the numbers are read
 * asynchronously and the schema is a plain computed. The home screen is the URL
 * naming no type, and it is the only screen that draws these — a table states
 * its own total in the header — so nothing is counted while someone is inside
 * one. Coming back out is what picks up whatever that visit fetched.
 *
 * The other branch is the same event read the other way: the URL naming a type
 * is that type being looked at, and this is the only place brickzuke learns it.
 * The home screen leads with what comes back from here — see [recentTypes].
 */
watch(
  urlEntity,
  (entity) => {
    if (entity) {
      rememberType(entity)
      // Nothing is fetched on brickzuke's behalf while somebody is inside a
      // table: the table is fetching for itself, and the store directory has
      // waited this long.
      stopHomeFill()
    } else {
      // Before the counts, so the pass over the years is started by the fill
      // and reports its progress to it — both ask for the same held pass, and
      // it is the first of them that gets to listen to it.
      startHomeFill()
      void refreshCounts()
    }
  },
  {
    immediate: true
  }
)

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

/*
 * The same rule over the URL someone arrives on, the shell reporting a query
 * change only once one is made. A pasted or stale address can say things no
 * press here can leave standing — a view with no type under it above all,
 * which is the shell's Everything and a table brickzuke has no rows for — and
 * without this it stood until the next press. Read against the type the URL
 * itself names, so a sort in the address is honoured rather than replaced by
 * the one that type opens in.
 */
onMounted(() => {
  onQueryChange(parseQuery(window.location.search, catalogSchema.value, shellDefaults.value))
})

const plainTokens = {
  '--dc-accent': 'currentColor' 
}
</script>

<template>
  <!-- The shell fills the box it is given, so give it a height. -->
  <div
    class="items-shell"
    :data-narrows-rows="String(narrowsRows)"
  >
    <!--
      No `@activate`: under `rowPress: 'narrow'` — the default since appfr
      0.21.0 — the shell applies the press itself wherever it can, and reports
      one only for the types it cannot narrow to. Those are brickzuke's leaves,
      and there is nothing to route to: every cell that leads somewhere says so
      itself.

      What the press lands on is the home screen under that record's term, the
      shell writing the cards view along with the expression (0.22.0) and
      `openedQuery` agreeing with it — which is the screen brickzuke already
      draws for a narrowed query.
    -->
    <DataShell
      :schema="catalogSchema"
      :source="catalogSource"
      :route="route"
      theme="mono-size"
      :tokens="plainTokens"
      :defaults="shellDefaults"
      @query-change="onQueryChange"
    >
      <!--
        A colour or a seller too long to fetch whole says so beside the count,
        which is the number it would otherwise be quietly contradicting. Never
        both at once: they are two different tables.
      -->
      <template #actions>
        <span
          v-if="colorItemsNotice"
          class="items-shell__partial"
          title="This colour runs to more pages than brickzuke fetches at once, so the list below is not all of it."
        >{{ colorItemsNotice }}</span
        >
        <span
          v-if="storeLotsNotice"
          class="items-shell__partial"
          title="This seller has more lots than brickzuke fetches at once, so the list below is not all of them."
        >{{ storeLotsNotice }}</span
        >
      </template>

      <!--
        The home screen is brickzuke's own — a card per type with a look at
        what is inside it, which the shell's text-only preview rows cannot
        show. Every other view is the shell's, rendered here because taking
        this slot means taking the whole results area with it.
      -->
      <template #results="{ query }">
        <HomeCards v-if="isTypeCardsQuery(query)" :expr="query.expr" />
        <ResultsArea v-else />
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
 * The browser's own button, everywhere the shell draws one: a cell that leads
 * somewhere, a heading that sorts, the pager, the controls along the bar, the
 * cards on the home screen. One press looks like every other press, which is
 * the whole of the styling the original table had and the only rule brickzuke
 * wants over the shell's own.
 *
 * What is reverted is only what the browser paints — the face, the edge, the
 * space inside it, the ink — and not how the button is laid out or what it is
 * set in. `all: revert` was the first try and takes too much with it: the
 * font, which is a bare `<button>`'s 13.3px Arial and the whole of what made
 * the pressable cells smaller than the text beside them; and `display`, which
 * on a card's header is the flex row holding its name apart from its count,
 * so the two ran together. These six properties are the styling that went
 * missing and nothing else.
 *
 * `border-radius` is in the list because a border is a shape as much as a
 * line: the shell squares its header buttons off — `--dc-radius-sm` is `0`
 * under this theme — while a cell button, which the shell gives no radius at
 * all, kept the browser's own rounded one. Two shapes is two button styles,
 * however alike the rest of them is, and the whole point here is that a press
 * looks the same wherever it is.
 */
.items-shell :deep(button),
.items-shell :deep(select) {
  appearance: revert;
  background: revert;
  border: revert;
  border-radius: revert;
  /* A shade more room inside than the browser allows, which it measures for a
     word on its own and not for a name running to three lines in a table. */
  padding: 3px 8px;
  color: revert;
  font: inherit;
  /* A button centres its label, which never showed while the box hugged one
     line of it. Wrapping makes the box the width of the column, so it shows:
     the value would sit centred under a heading ranged left. It follows the
     column's own alignment instead, which is what the shell gives it. */
  text-align: inherit;
  /* The browser gives a button the arrow, and the rows around this one are
     not pressable at all — so the hand is the only thing saying that this
     particular cell leads somewhere. */
  cursor: pointer;
}

/*
 * Except a button that is nothing but a picture, which takes no padding at
 * all.
 *
 * The room above is measured for a word — a name in a cell, a count on a bar —
 * and a picture is not one: it has its own edges and needs no room made around
 * them. Three pixels one way and eight the other put a frame around every
 * thumbnail in the app, and on the home screen's walls of them the frames were
 * more of the screen than the pictures were.
 *
 * `:only-child` is what says "on its own": a card whose press holds a picture
 * *and* a name still wants the room, the name being the part that needs it.
 */
.items-shell :deep(button:has(> img:only-child)) {
  padding: 0;
}

/*
 * And no underline on the way past. That is a link's manner, and these are
 * buttons — they have edges to say what they are, which a link has not.
 */
/*
 * One hover to go with the one look. The shell has a manner of its own for the
 * way past — a chip lifts its border and its ink, a cell underlines itself
 * like a link — and against a button the browser paints, those read as two
 * more button styles.
 *
 * Stated here rather than reverted to the browser's, because the browser's is
 * not one hover either: a cell button is `display: -webkit-box` so that it can
 * be cut off at three lines, and a form control whose display has been changed
 * stops being painted as a widget — face and all, hover included. Measured, it
 * was the difference between a chip lifting from 96 to 112 and a cell not
 * lifting at all.
 *
 * `ButtonFace` mixed with a little `ButtonText` is that lift said in a way
 * that holds in both schemes: towards white over a dark page, towards black
 * over a pale one, because both are the system's own and turn over together.
 *
 * `:not(:disabled)` is here to be heavy rather than to be exact — it is what
 * the shell's own primary-button hover weighs, and without it that rule wins
 * and paints the face with `--dc-accent`, which brickzuke has set to
 * `currentColor`. The face became the ink and Run query went blank on the way
 * past. It earns its place twice over: a button that cannot be pressed should
 * not answer the pointer either.
 *
 * `filter` for the same reason, the shell brightening that one button by 8%
 * on top of the colour — a lift on a lift, and only there.
 */
.items-shell :deep(button:hover:not(:disabled)),
.items-shell :deep(select:hover:not(:disabled)) {
  background: color-mix(in oklab, ButtonFace 88%, ButtonText);
  border: revert;
  border-radius: revert;
  color: revert;
  filter: none;
  text-decoration: none;
}

/*
 * The one thing a button here still says for itself: which of a set is in
 * force — the view being drawn, the column being sorted by, the type being
 * listed. A flat line around it, not the raised edge the others wear, so that
 * it reads as a state of this button rather than as another kind of button.
 *
 * After the hover rule and not before, and carrying the same `:not(:disabled)`
 * to weigh the same: on a tie the later rule wins, which is how an active
 * button keeps its line while the pointer is over it.
 */
.items-shell :deep(button[data-dc-active='true']:not(:disabled)) {
  border: 1px solid currentColor;
}

/*
 * The two pickers on the bar are `<select>`s that the shell paints as its own
 * control — `appearance: none` and a border of its own — so they were the one
 * thing on the bar the rule above could not reach by asking for a button. They
 * are pressed like everything else here and now look it, which leaves the
 * chevron the shell drew for them doing a job the system's own arrow has
 * taken back.
 */
.items-shell :deep(.dc-header__pick-mark) {
  display: none;
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
 * it. Dimmed rather than coloured or shrunk, brickzuke's tables having no
 * palette to spend, one size throughout, and the shell exposing no token for
 * secondary ink.
 */
.items-shell__partial {
  opacity: 0.7;
  white-space: nowrap;
}

/*
 * The table states a width per column, and the shell then stretches it over
 * whatever the window is: `width: 100%` with `table-layout: fixed` shares the
 * slack out among the columns, which is what put a hand's breadth of nothing
 * between a country's name and its store count.
 *
 * `min-content` is the sum of those stated widths — under a fixed layout that
 * is the whole of what the table asks for — so every column stays exactly as
 * wide as the schema says and the table ends where its last one does. `auto`
 * would not do: a fixed layout needs a definite width, so the browser falls
 * back to sizing each column to the widest cell in it, which drops the
 * truncation and moves the columns about as the pages turn.
 */
.items-shell :deep(.dc-table) {
  width: min-content;
}

/*
 * A row of a type that cannot be narrowed to is not pressable, so it must not
 * offer itself as one — the shell gives every row the hand and the hover, not
 * knowing which of them its host has somewhere to send.
 *
 * The other tables keep both, and they are the whole of what says a row can be
 * pressed at all: the arrow that used to say it is gone with the job it was for.
 */
.items-shell[data-narrows-rows='false'] :deep(.dc-table__row),
.items-shell[data-narrows-rows='false'] :deep(.dc-table__row:hover) {
  background: none;
  cursor: default;
}
</style>
