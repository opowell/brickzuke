<script setup lang="ts">
/**
 * The home screen: a card per type, headed by its count and showing what is
 * inside it — the records as pictures where they have them, and the head of
 * the type's own table where they do not.
 *
 * It replaces the shell's own `TypeCardsView` through the `results` slot, and
 * for one reason: that view draws a preview row as three pieces of text, and
 * what is worth seeing about a colour or a category is a picture. Everything
 * else about it is kept — the heading is the press that filters to the type,
 * a record inside leads where that record's own row leads, and the count is
 * the schema's population until a query narrows it, which is the shell's own
 * rule for the number on a card.
 *
 * The cards are drawn in the shell's own tokens, so a screen brickzuke now
 * owns still looks like the one it replaced.
 */
import { computed, ref, watch } from 'vue'
import { formatCount } from 'header-content-layout'
import { catalogSchema, openType } from './catalogSchema'
import { previewFor } from './catalogPreviews'
import type { Preview, PreviewTile } from './catalogPreviews'
import { byRecency } from './recentTypes'

const props = defineProps<{
  /**
   * The query the home screen is under, which every card is read through — the
   * shell's own, so it is the one the header is showing.
   *
   * The home screen keeps an expression: a term written here, or the one a
   * table was narrowed by when someone came back out of it. Left standing, it
   * had every card answering a question nobody had asked — a wall of countries
   * with Canada on it under `region:"Europe"`, and a seller count for the whole
   * world beside it.
   */
  expr?: string
}>()

const expr = computed(() => props.expr ?? '')

const previews = ref<Record<string, Preview>>({})

/**
 * Every card: the type the schema declares, and whatever has been read of it,
 * as the one of the two shapes it turned out to be. Split here rather than in
 * the template so each half is a list the template can simply draw.
 *
 * Led by the types most recently opened — see [recentTypes]. Every card the
 * schema declares is still here and none has changed; what has changed is
 * which of them is nearest the top.
 */
const cards = computed(() =>
  byRecency(catalogSchema.value.entities).map((entity) => {
    const preview = previews.value[entity.key]
    const tiles = preview?.tiles.length ? preview.tiles : undefined
    return {
      entity,
      count: countOf(entity.count, preview),
      pictures: preview?.kind === 'pictures' ? tiles : undefined,
      pills: preview?.kind === 'pills' ? tiles : undefined
    }
  })
)

/**
 * The number a card is headed with: how many of the type the query matched,
 * where the read could say, and the population the schema publishes where it
 * could not.
 *
 * Grouped the way `population` groups a population, these two numbers standing
 * in the same place on the same wall — see the note there on why the count a
 * card carries is not abbreviated.
 *
 * A type the schema states no population for keeps its silence. A card reading
 * `0` for a country list nobody has fetched says brickzuke looked and found
 * none, which is a different claim from not having looked — and under a query
 * it is the wrong one for exactly the types that have nothing stored yet.
 */
function countOf(population: string, preview: Preview | undefined): string {
  if (preview?.count === undefined || !population) {
    return population
  }
  return formatCount(preview.count)
}

/**
 * The pictures that did not load, by the card and record they are on.
 *
 * BrickLink has no 2 x 2 brick in every colour it lists, and no picture at all
 * for some parts. An `<img>` that 404s draws a broken-image icon, and a card
 * of pictures is pictures and nothing else, so a tile that loses its picture
 * is not drawn at all: a gap in a wall says less wrongly than a broken one.
 */
const missing = ref<Record<string, boolean>>({})

function pictureKey(entity: string, tile: PreviewTile): string {
  return entity + '/' + tile.key
}

/** Whether the tile still has a picture to draw — one that has not 404ed. */
function hasPicture(entity: string, tile: PreviewTile): boolean {
  return Boolean(tile.image) && !missing.value[pictureKey(entity, tile)]
}

function hover(tile: PreviewTile): string {
  return tile.detail ? tile.label + ' — ' + tile.detail : tile.label
}


/**
 * Which read the cards on screen belong to.
 *
 * A query change starts a new one, and the old one's reads are still in
 * flight: they land in whatever order the catalogue answers them, so without
 * this the wall could finish showing the answer to the query before last. A
 * preview that comes back under a stale token is dropped.
 */
let reading = 0

/**
 * Every card's preview at once, each landing on its own.
 *
 * A card that comes back with nothing in it — a type nothing has been stored
 * for yet, or the codes, which nothing reads without a query — simply keeps
 * its count, and one that fails to read keeps it too: a home screen is a
 * summary, and it is still a true one without the pictures.
 *
 * Re-read whenever the query changes, because that is what a card says: the
 * head of this type as its own table would open under this query.
 */
watch(
  expr,
  (asked) => {
    const token = ++reading
    // Cleared rather than left standing: the tiles on screen are the answer to
    // the query before this one, and a card holding them while the new answer
    // is read is a card stating something false. The count under each falls
    // back to the population meanwhile, which is true of every query.
    previews.value = {}
    // In the order the cards are drawn in, so the ones nearest the top are the
    // ones read first: IndexedDB answers these one at a time whatever order
    // they are asked in, and the card someone is looking at should not be last.
    for (const entity of byRecency(catalogSchema.value.entities)) {
      void previewFor(entity.key, asked).then((preview) => {
        if (token !== reading) {
          return
        }
        previews.value = {
          ...previews.value,
          [entity.key]: preview
        }
      })
    }
  },
  {
    immediate: true
  }
)
</script>

<template>
  <!--
    The scroller and the wall are two elements, and have to be: a grid that is
    itself the scrolling box has a height of its own, and auto rows then share
    that height out between them rather than growing to what is in them — five
    rows of a fourteen-card home screen, each a fifth of the screen, with every
    card standing out of the row it is in and over the cards below. The wall
    inside has no height but its content's, so its rows are its cards.
  -->
  <div class="home">
    <div class="home__wall">
      <section v-for="card in cards" :key="card.entity.key" class="home__card">
        <button type="button" class="home__head" @click="openType(card.entity.key)">
          <span class="home__name">{{ card.entity.label }}</span>
          <span class="home__count">{{ card.count }}</span>
          <span class="home__go" aria-hidden="true">→</span>
          <span class="home__sr">Show only {{ card.entity.label.toLowerCase() }}</span>
        </button>

        <div v-if="card.pictures" class="home__pictures">
          <button
            v-for="tile in card.pictures"
            v-show="hasPicture(card.entity.key, tile)"
            :key="tile.key"
            type="button"
            class="home__tile"
            :title="hover(tile)"
            @click="tile.press?.()"
          >
            <img
              v-if="hasPicture(card.entity.key, tile)"
              class="home__picture"
              :src="tile.image"
              alt=""
              loading="lazy"
              @error="missing[pictureKey(card.entity.key, tile)] = true"
            />
          </button>
        </div>

        <div v-else-if="card.pills" class="home__pills">
          <button
            v-for="tile in card.pills"
            :key="tile.key"
            type="button"
            class="home__pill"
            :title="hover(tile)"
            @click="tile.press?.()"
          >
            <span class="home__label">{{ tile.label }}</span>
            <span v-if="tile.detail" class="home__detail">{{ tile.detail }}</span>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/*
 * What `.dc-types` and `.dc-type` are: the shell fills the space below its
 * header, so the screen that replaces its own has to scroll in the same place.
 */
.home {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.home__wall {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  align-items: start;
  gap: 12px;
  padding: 16px;
}

.home__card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--dc-bg-1);
  border: 1px solid var(--dc-line);
  border-radius: var(--dc-radius);
  overflow: hidden;
}

.home__card > * + * {
  border-top: 1px solid var(--dc-line);
}

.home__head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 14px 16px;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.home__head:hover {
  background: var(--dc-bg-2);
}

.home__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home__count {
  color: var(--dc-fg-3);
}

/* The arrow is the shell's: present on the card, plain until it is reached. */
.home__go {
  opacity: 0;
  transition: opacity 0.12s ease-out;
}

.home__head:hover .home__go,
.home__head:focus-visible .home__go {
  opacity: 1;
}

.home__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/*
 * A stated number of columns rather than as many as fit, so that the number of
 * records a card shows can be a whole number of rows of them — a card that
 * ends on a part-row is a card with a hole in the corner of it. What the
 * previews show is counted from this: see PICTURES_SHOWN.
 */
.home__pictures {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  place-items: center;
  gap: 4px;
  padding: 12px 16px;
}

.home__tile {
  display: block;
  min-width: 0;
  border: none;
  border-radius: var(--dc-radius-sm);
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.home__tile:hover {
  background: var(--dc-bg-2);
}

.home__picture {
  display: block;
  max-width: 100%;
  height: 30px;
  object-fit: contain;
}

/*
 * The records of a type that has no pictures of them, as their names.
 *
 * A dozen names and their numbers, wrapped: the same look inside a card as the
 * pictures are, for the types where what there is to see is what a record is
 * called and how much of it there is.
 */
.home__pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 12px 16px;
}

.home__pill {
  display: flex;
  align-items: baseline;
  gap: 6px;
  max-width: 100%;
  padding: 3px 10px;
  border: 1px solid var(--dc-line);
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.home__pill:hover {
  background: var(--dc-bg-2);
}

.home__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home__detail {
  color: var(--dc-fg-3);
}

</style>
