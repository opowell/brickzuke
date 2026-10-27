/**
 * What each type is, in a sentence — drawn under its name on the home screen
 * (appfr 0.56.0's `EntitySchema.description`).
 *
 * For the reader meeting the wall for the first time: a label is a noun, and
 * half of brickzuke's are BrickLink's — an item, an inventory, a variant —
 * which read as ordinary English and mean something narrower. "Store
 * inventories" and "Inventory" above all, which are two different tables.
 *
 * Kept here together rather than on each type, so the sentences read as one
 * set and can be compared with one another; [described] puts them on.
 */
import type { EntitySchema } from 'header-content-layout'

export const TYPE_DESCRIPTIONS: Record<string, string> = {
  categories: 'The groups BrickLink files its catalogue under, and your own',
  colors: 'Every colour BrickLink lists, with how many parts come in it',
  itemTypes: 'BrickLink’s kinds of thing: sets, parts, minifigures, gear and the rest',
  items: 'Everything in the catalogue, one line per item, and the items you made',
  itemRecords: 'The BrickLink records of one item, one line each',
  itemInventories: 'Every part of every set opened so far, with the set it is in',
  inventory: 'The parts one set is made of, in their colours, and how many of each',
  itemVariants: 'A part in one colour, and how many of the sets read so far it is in',
  colorItems: 'The items that come in one colour',
  inventories: 'The lots sellers have for sale, from the stores brickzuke has looked at',
  conditions: 'New and Used, the two conditions a lot is sold in',
  years: 'The years items came out in, newest first',
  regions: 'The parts of the world sellers are grouped into',
  countries: 'The countries sellers are in, with how many in each',
  provinces: 'The states and provinces sellers are in, within their countries',
  stores: 'The sellers on BrickLink, where they are and how much they hold',
  shippingMethods: 'How each seller ships, and where to',
  shippingCosts: 'What each seller charges to ship, by weight and destination',
  images: 'The pictures of the items the query matches',
  settings: 'Where you ship to, how prices are shown and compared, and how far fetching goes',
  shopLists: 'Lists of parts you want to buy, each priced across sellers',
  shopListItems: 'The parts on one shopping list, and how many of each',
  shopPlan: 'The cheapest seller for each part on a list, taken on its own',
  shopStores: 'What the whole list would cost from each seller',
  carts: 'Lots you are putting together to order from a seller',
  cartLines: 'The lots in one cart, and how many of each',
  priceModifierProfiles: 'Sets of factors that raise or lower what a lot is worth to you'
}

/** The types with their sentence on — and a type with none as it was. */
export function described(entities: EntitySchema[]): EntitySchema[] {
  return entities.map((entity) =>
    TYPE_DESCRIPTIONS[entity.key] ? {
      ...entity,
      description: TYPE_DESCRIPTIONS[entity.key]
    } : entity
  )
}
