import type { Table } from '@/components/TableComponent.vue'
import { formatInteger } from './utils'

export function getTableLabel(table: Table) {
  if (!table.items) {
    return table.label
  }
  return table.label + ':&nbsp;' + formatInteger(table.items.length)
}
