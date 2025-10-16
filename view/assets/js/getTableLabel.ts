import type { Table } from '@/components/TableComponent.vue'
import { formatInteger } from './utils'

export function getTableLabel(table: Table) {
  if (!table.count) {
    return table.label
  }
  return table.label + ':&nbsp;' + formatInteger(table.count)
}
