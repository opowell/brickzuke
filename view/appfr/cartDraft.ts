/**
 * What the buttons over the Cart column propose, before it is written.
 *
 * The box on a lot writes as soon as it is changed — one lot, one figure, no
 * reason to wait. The buttons over the column are about the whole table, and
 * "every lot this seller has, at the most they have of it" is a thing worth
 * looking at before it is a thing the cart holds. So Max and 0 fill a draft:
 * a proposed quantity per lot, shown in the boxes in place of what is stored,
 * and written only when Apply is pressed. Reset drops it, and the boxes read
 * what the cart holds again.
 *
 * Which lots: the ticked ones where any are ticked, and otherwise every lot
 * the query matches — every page of them, not the one on screen, because a
 * seller's inventory is thirty pages and "all of it" means all of it. The
 * ticks are the shell's, offered on this table while a cart is active — see
 * [ItemsShell] — and held here so the header can read them.
 *
 * The draft holds the lot's row as well as the figure, because a line is
 * written from what the lot says of itself — see [cartLotOf] — and by the
 * time Apply is pressed the row may be off screen.
 */
import { computed, ref } from 'vue'
import type { ShellRow } from 'header-content-layout'
import { parseQuery } from 'header-content-layout'
import { catalogSchema } from './catalogSchema'
import { matchingRows } from './catalogSource'
import { shellDefaultsFor } from './openingOrder'

/** One proposed figure: the lot's row, and how many of it. */
export interface DraftEntry {
  fields: Record<string, unknown>
  quantity: number
}

/** The proposals, by lot. */
export const cartDraft = ref<Map<string, DraftEntry>>(new Map())

/** The ticked lots, as the shell reports them — ids, across every page. */
export const cartSelection = ref<string[]>([])

/** How many lots the draft proposes for, for the button that writes it. */
export const draftCount = computed(() => cartDraft.value.size)

/** The draft's figure for one lot, or nothing where it proposes none. */
export function draftQuantityOf(lotId: unknown): number | undefined {
  return cartDraft.value.get(String(lotId ?? ''))?.quantity
}

/** One lot's proposal, gone — the box was typed into, so the type is the word. */
export function dropDraft(lotId: unknown): void {
  if (cartDraft.value.delete(String(lotId ?? ''))) {
    cartDraft.value = new Map(cartDraft.value)
  }
}

export function resetDraft(): void {
  cartDraft.value = new Map()
}

/** What the seller has of a lot — the most a box will take. */
export function availableOf(fields: Record<string, unknown>): number {
  const held = Number(fields.quantity)
  return Number.isFinite(held) && held > 0 ? held : 0
}

/**
 * The lots the buttons act on: the ticked ones, or all of them.
 *
 * Read off the query in the address bar, which is the one the table is
 * showing, through the same parse the shell makes of it — so the rows here
 * are the rows on screen, page after page.
 */
export async function targetLots(): Promise<ShellRow[]> {
  const schema = catalogSchema.value
  const query = parseQuery(window.location.search, schema, shellDefaultsFor('inventories'))
  const entity = schema.entities.find((one) => one.key === 'inventories') ?? null
  const rows = await matchingRows({
    query: {
      ...query,
      entity: 'inventories'
    },
    schema,
    entity,
    limit: Number.POSITIVE_INFINITY,
    offset: 0
  })
  const ticked = new Set(cartSelection.value)
  return ticked.size ? rows.filter((row) => ticked.has(row.id)) : rows
}

function proposedEntry(row: ShellRow, mode: 'max' | 'none'): DraftEntry {
  return { fields: row.fields, quantity: mode === 'max' ? availableOf(row.fields) : 0 }
}

/**
 * Max, or 0: every target lot proposed at what the seller has, or at none.
 *
 * Over whatever the draft already proposes, so a Max after a 0 is a Max — the
 * later press is the one that stands, per lot, as it would be in the boxes.
 */
export async function proposeAll(mode: 'max' | 'none'): Promise<void> {
  const next = new Map(cartDraft.value)
  for (const row of await targetLots()) {
    next.set(row.id, proposedEntry(row, mode))
  }
  cartDraft.value = next
}

/** The row-level Max or 0, over the header's: one lot proposed, not every lot. */
export function proposeOne(row: ShellRow, mode: 'max' | 'none'): void {
  const next = new Map(cartDraft.value)
  next.set(row.id, proposedEntry(row, mode))
  cartDraft.value = next
}
