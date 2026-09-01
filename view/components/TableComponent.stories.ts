import type { Meta, StoryObj } from '@storybook/vue3'
import TableComponent from './TableComponent.vue'

const meta: Meta<typeof TableComponent> = {
  title: 'Components/TableComponent',
  component: TableComponent,
}

export default meta
type Story = StoryObj<typeof TableComponent>

const table = {
  id: 'parts',
  label: 'Parts',
  columns: [
    {
      id: 'name',
      label: 'Name',
      width: '200px' 
    },
    {
      id: 'color',
      label: 'Color',
      width: '100px' 
    },
    {
      id: 'quantity',
      label: 'Qty',
      type: 'number',
      width: '80px' 
    },
  ],
  idField: 'id',
}

const items = [
  {
    id: 1,
    name: 'Brick 1x2',
    color: 'Red',
    quantity: 42 
  },
  {
    id: 2,
    name: 'Plate 2x4',
    color: 'Blue',
    quantity: 15 
  },
  {
    id: 3,
    name: 'Tile 1x1',
    color: 'Yellow',
    quantity: 100 
  },
]

export const Default: Story = {
  args: {
    table,
    items 
  },
}

export const Empty: Story = {
  args: {
    table,
    items: [] 
  },
}

export const Minimal: Story = {
  args: {
    table: {
      ...table,
      hidePriceModifier: true,
      hideSelect: true 
    },
    items,
  },
}
