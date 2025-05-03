export function getTableLabel(table) {
  if (!table.items) {
    return table.label
  }
  return table.label + ': ' + table.items.length
}
