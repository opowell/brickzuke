/**
 * The fields an item row carries that a term is put to, as `toRow` in
 * catalogSource writes them.
 *
 * The years are counted off the items, so a term on one of these narrows the
 * count — `type:"S"` is the sets of each year — where a term on any other
 * field is a question about the lots and goes to the join. Both sides read
 * this one list: the pass in the source narrows by it (see `scanYears`) and
 * the join in reach leaves it alone (see `answers` on the years entry of
 * `THROUGH`), so a term is answered exactly once.
 *
 * Not `id`, `record` or `records`: those name an item rather than describe
 * one, and every table reads them as an address — see `itemAddress` in the
 * source and `namedIn` in reach.
 */
export const ITEM_FIELDS: readonly string[] = [
  'name',
  'type',
  'typeId',
  'category',
  'categoryName',
  'image',
  'parts',
  'storeInventory',
  'year',
  'weight',
  'dimensions'
]
