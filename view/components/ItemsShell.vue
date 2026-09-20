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
  PARAM_EXPR,
  ResultsArea,
  createVueRouterAdapter,
  isTypeCardsQuery,
  parseQuery,
  serializeQuery} from 'header-content-layout'
import type { DataSource, EntitySchema, Selection, ShellQuery } from 'header-content-layout'
import 'header-content-layout/style.css'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { refreshCount, refreshCounts } from '../appfr/catalogCounts'
import { startHomeFill, stopHomeFill } from '../appfr/homeFill'
import { catalogSchema } from '../appfr/catalogSchema'
import { catalogSource } from '../appfr/catalogSource'
import { colorItemsNotice } from '../appfr/colorItemsNotice'
import { storeLotsNotice } from '../appfr/storeLotsNotice'
import { openedQuery, shellDefaultsFor } from '../appfr/openingOrder'
import { rememberType } from '../appfr/recentTypes'
import { refreshUserCounts } from '../appfr/userCounts'
import { createRecordFor, deleteRecordsFor, shopPartsOf, userRevision } from '../appfr/userWrites'
import { cartSelection } from '../appfr/cartDraft'
import { activeCart } from '../appfr/settings'
import { openOn } from '../appfr/catalogSchema'
import HomeCards from '../appfr/HomeCards.vue'
import { fillCategoryTypes } from '../appfr/categoryTypesFetch'

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
 * A colour or a seller too long to fetch whole says so under the pager's
 * hover text — `1 / ~12` on the bar, and `first 1,200 of 30,200 lots` beneath
 * the page it names — which is where the number it would otherwise be quietly
 * contradicting is explained. Never both at once: they are two different
 * tables, and the one that is up is the one that speaks.
 */
const pagesNote = computed(() => colorItemsNotice.value || storeLotsNotice.value)

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
      // The one number a table opened straight from the address bar is headed
      // by, where it is one cheap read — the shell states the population over
      // an un-narrowed table, and the home screen's pass has not run.
      void refreshCount(entity)
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

/**
 * The three gestures the shell reports and applies nothing of.
 *
 * It draws the buttons — `+ New…` on the bar over a type that names `create`,
 * the ticks and `Delete` for one that names `delete` — and leaves the doing to
 * the host, the same way it leaves narrowing to one. Only the types somebody
 * writes themselves name either, so nothing else on the wall grows a button.
 *
 * The expression goes in with the create because a detail type makes its record
 * under the one in the URL: a part added to an inventory has to go under the
 * inventory whose parts are on screen. See [userWrites].
 */
function onCreate(entity: EntitySchema) {
  void createRecordFor(entity, String(router.currentRoute.value.query[PARAM_EXPR] ?? ''))
}

function onDelete(selection: Selection) {
  void deleteRecordsFor(selection)
}

/**
 * The source, made anew whenever a table of theirs is written.
 *
 * The shell re-runs its query when the source it is handed changes and not
 * when the schema does — see [userRevision] for why the count a write puts on
 * the bar no longer brings the row with it. So the source is a computed over
 * that revision, and a write hands the shell a new object with the same
 * functions on it: the same rows read again, which is what a table with a
 * record just made, unmade or typed into needs. Every other reader gets the
 * one `catalogSource`; the copy is a shell-facing wrapper and holds nothing.
 */
const liveSource = computed<DataSource>(() => {
  void userRevision.value
  return {
    ...catalogSource
  }
})

/**
 * The set whose parts are on screen, if one is — which is the whole condition
 * for offering to buy them.
 *
 * `record:` is what addresses a set's inventory, so its presence under the
 * `inventory` type is the same thing as saying somebody is looking at what a
 * set is made of.
 */
const openSet = computed(() => {
  if (router.currentRoute.value.query[PARAM_ENTITY] !== 'inventory') {
    return ''
  }
  const expr = String(router.currentRoute.value.query[PARAM_EXPR] ?? '')
  // Not `-record:`, which is a set the parts are *not* from.
  return /(?:^|\s)record:"?([A-Za-z0-9-]+)"?/.exec(expr)?.[1] ?? ''
})

/** Whether the list is being made, so the press cannot be made twice. */
const shopping = ref(false)

/**
 * "Shop parts" on a set BrickLink lists.
 *
 * A list of everything in it, and then the plan — one press for what would
 * otherwise be making a list and copying a few hundred parts onto it by hand.
 * It sits on the bar rather than in a column because it is about the whole set
 * and not about any row: the shell's `#actions` slot is where a host puts what
 * belongs to the screen, which is where the two fetch caveats already are.
 *
 * Nothing happens for a set whose inventory has not been fetched — there are no
 * parts stored to copy, and a list with nothing on it would read as a set with
 * nothing in it. See [shopListFromRecord].
 */
async function shopOpenSet() {
  if (!openSet.value || shopping.value) {
    return
  }
  shopping.value = true
  try {
    const listId = await shopPartsOf(openSet.value)
    if (listId) {
      openOn('shopPlan', 'shoplist', String(listId))
    }
  } finally {
    shopping.value = false
  }
}

/**
 * Ticks on the lots table, while there is a cart to put them in.
 *
 * The shell offers ticks on a type that names an operation on a selection,
 * and `selectable` where the host's bulk action is its own — which this is:
 * the buttons over the Cart column act on the ticked lots where any are
 * ticked. See [cartDraft], which holds the selection for the header to read.
 * Offered only on that table and only with a cart active, since a tick with
 * nothing to do to what it ticks is a control that leads nowhere.
 */
const cartTicks = computed(() => urlEntity.value === 'inventories' && activeCart.value !== '')

/* The populations the four standing user types are headed by, which are also
   what tells the shell to look again after one is written — see [userCounts]. */
onMounted(() => {
  void refreshUserCounts()
})

// See [categoryTypesFetch]: a category otherwise sits with a name and an item
// count forever, and never a `type` a `type:` term can find it by.
onMounted(() => {
  void fillCategoryTypes()
})

/*
 * `mono-size` paints every role in ink, the ok and danger colours among them.
 * Those two are given back a hue, for the mark a row wears where the query
 * names it — a green `+` on a record narrowed to, a red `−` on one left out —
 * which is nothing without the colour; the same tokens the shell's coloured
 * themes use, following `color-scheme` the way the rest of the page does.
 */
const plainTokens = {
  '--dc-accent': 'currentColor',
  '--dc-ok': 'light-dark(oklch(0.48 0.13 150), oklch(0.74 0.13 150))',
  '--dc-danger': 'light-dark(oklch(0.5 0.18 25), oklch(0.68 0.17 25))',
}
</script>

<template>
  <!-- The shell fills the box it is given, so give it a height. -->
  <div class="items-shell">
    <!--
      `rowPress="open"`: appfr 0.21.0 made a row press narrow the whole result
      set to that record, which put two controls over one row — its own press,
      and the ones its cells already made. brickzuke turns that off everywhere,
      the row going back to being nothing but the cells laid out along it: a
      cell that leads somewhere says so itself, a button among plain text, and
      nothing else in the row answers the pointer.

      The one record-scoped narrow a row press used to make that no cell
      already covered — a bare press on a country, say — moved onto the cell
      that names the record: see `narrowingTo` and `countryColumns`. No
      `@activate`, `rowPress="open"` reporting one only where nothing else
      offers a way in, and there being nowhere left brickzuke needs to route it.
    -->
    <DataShell
      :schema="catalogSchema"
      :source="liveSource"
      :route="route"
      theme="mono-size"
      :tokens="plainTokens"
      :defaults="shellDefaults"
      :pages-note="pagesNote"
      :selectable="cartTicks"
      row-press="open"
      v-model:selected="cartSelection"
      @query-change="onQueryChange"
      @create="onCreate"
      @delete="onDelete"
    >
      <template #actions>
        <!--
          Buying what is in the set on screen. Beside the caveats rather than
          among the rows, being about the whole table and not about any line of
          it.
        -->
        <button
          v-if="openSet"
          class="items-shell__shop"
          type="button"
          :disabled="shopping"
          title="Make a shopping list of every part in this set, and price it across the sellers brickzuke holds lots for"
          @click="shopOpenSet"
        >
          {{ shopping ? 'Listing…' : 'Shop parts' }}
        </button>
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
.items-shell :deep(button) {
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
 *
 * The two marks beside a row's name are not buttons of this kind: the `→`
 * says with its colour which way the press would go — green to narrow to the
 * record, red with ⌘ held to leave it out — and the `+` or `−` fades to say
 * the press lifts it. A face and a reverted ink would say neither. `:where`
 * so the exemption weighs nothing, and the tie with the active rule below is
 * kept as it stands.
 */
.items-shell :deep(button:hover:not(:disabled):where(:not(.dc-scope, .dc-standing))) {
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
 * The pickers on the bar are buttons of the shell's own with a list behind
 * them, so the rule above reaches them like everything else — and takes the
 * room the shell had left at their right edge for the chevron that says a
 * list is there. Given back here: a button has no arrow of the system's to
 * take that job over, as the `<select>` these replaced had.
 */
.items-shell :deep(.dc-pick__button) {
  padding-right: 20px;
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
 * It takes the same button the rest of the shell takes — the rule above hands
 * every button here the browser's own — so nothing is stated for it but the
 * room it needs not to run into the pager beside it.
 */
.items-shell__shop {
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
 * No row is pressable now — `row-press="open"` on the shell above says so —
 * so none may offer itself as one: the shell gives every row the hand and the
 * hover regardless, not knowing brickzuke has turned the press itself off.
 *
 * The cells that lead somewhere keep both, being buttons of their own rather
 * than this rule's `.dc-table__row`.
 */
.items-shell :deep(.dc-table__row),
.items-shell :deep(.dc-table__row:hover) {
  background: none;
  cursor: default;
}
</style>
