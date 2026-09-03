/**
 * Reading a `catalogList.asp` page.
 *
 * The extraction here was lifted out of the pinia store so appfr could ask for
 * a colour's items with the same code that asks for a category's. These pin
 * the lift: the rows it finds, and the page count that decides how many more
 * requests a list is worth.
 *
 * The markup is a reduction of that page rather than a capture of one — the
 * structure the extractors key on, with the surrounding chrome dropped.
 */
import { describe, it, expect } from 'vitest'
import { pageCount, parseRows } from '../catalog-list'

function row(itemId: string, colorId: string, number: string, name: string) {
  return (
    `<TR>` +
    `<TD><A href="/v2/catalog/catalogitem.page?P=${number}" data-itemid='${itemId}' ` +
    `data-itemcolorid='${colorId}'>` +
    `<IMG SRC='https://img.example/${number}.png' BORDER=0></A></TD>` +
    `<TD><A HREF="/v2/catalog/catalogitem.page?P=${number}">${number}</A> ` +
    `<strong>${name}</strong></TD>` +
    `</TR>`
  )
}

const page =
  `<HTML><BODY>` +
  `<FONT>82 Items Found.  Page <B>1</B> of <B>3</B> (Showing 1 - 50)</FONT>` +
  `<TABLE>` +
  `<TR class="catalog-list__body-header"><TD>Image</TD><TD>Item</TD></TR>` +
  row('12345', '2', '3001', 'Brick 2 x 4') +
  row('67890', '2', '3020', 'Plate 2 x 4') +
  `</TABLE></BODY></HTML>`

describe('catalogList rows', () => {
  it('reads an item per row', () => {
    const rows = parseRows(page)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      itemId: '12345',
      colorId: '2',
      image: 'https://img.example/3001.png',
      itemNumber: '3001',
      itemName: 'Brick 2 x 4'
    })
  })

  it('keeps the catalogue number apart from BrickLink\'s own id', () => {
    // `itemNumber` is what an item record is keyed by — `P-3001` — and
    // `itemId` is the number the list page's markup is keyed by. Storing the
    // wrong one is a row that leads nowhere.
    const rows = parseRows(page)
    expect(rows.map((r) => r.itemNumber)).toEqual(['3001', '3020'])
    expect(rows.map((r) => r.itemId)).toEqual(['12345', '67890'])
  })

  it('finds nothing in a page with no list on it', () => {
    expect(parseRows('<HTML><BODY>No Items Found.</BODY></HTML>')).toEqual([])
  })
})

describe('how far a list runs', () => {
  it('reads the page count off the header', () => {
    expect(pageCount(page)).toBe(3)
  })

  // The alternative is queueing NaN more requests, which is why this is not
  // allowed to be undefined.
  it('calls a page it cannot read one page', () => {
    expect(pageCount('<HTML><BODY>1 Item Found.</BODY></HTML>')).toBe(1)
    expect(pageCount('')).toBe(1)
  })
})
