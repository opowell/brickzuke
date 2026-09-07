import type { TableRow } from './table'

export interface TableComponent {
  addRow: (item: TableRow, index: number) => void;
}
