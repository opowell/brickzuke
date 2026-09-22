/**
 * The picture a catalogue item is stored with, from what BrickLink hosts.
 *
 * BrickLink keeps several sizes of each: `<type>T` thumbnails (`.t1`, `.t2`),
 * `<type>L` the ~200px one, `<type>N` the normal — 560×380 for a set. The
 * catalogue download names none of them, so this decides which the item
 * carries, and it is the one place that does: a card, a tile and the images
 * view draw whatever is stored, and the images view never draws a picture
 * larger than it is — so a thumbnail here is a wall of thumbnails there.
 *
 * Sets take the normal size; a part stays on the large, its normal size being
 * the same file. Colour-specific pictures — a lot's, a colour's — are built
 * where the colour is known and are not this.
 */
export function itemPicture(itemType: string, number: string): string {
  if (itemType === 'S') {
    return `https://img.bricklink.com/ItemImage/SN/0/${number}.png`
  }
  return `https://img.bricklink.com/ItemImage/${itemType}L/${number}.png`
}

/** The form every set was stored with before v33: its `.t2` thumbnail. */
const SET_THUMBNAIL = /^https:\/\/img\.bricklink\.com\/ItemImage\/ST\/0\/(.+)\.t2\.png$/

/**
 * A stored set's picture brought up to the size it is stored at now, or the
 * address unchanged where it is not the thumbnail — already brought up, or
 * something else entirely.
 */
export function largerSetPicture(image: string | undefined): string | undefined {
  const match = image?.match(SET_THUMBNAIL)
  return match ? itemPicture('S', match[1]) : image
}
