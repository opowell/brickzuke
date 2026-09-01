import type { Meta, StoryObj } from '@storybook/vue3'
import TableCell from './TableCell.vue'

const meta: Meta<typeof TableCell> = {
  title: 'Components/TableCell',
  component: TableCell,
}

export default meta
type Story = StoryObj<typeof TableCell>

export const Text: Story = {
  args: {
    column: {
      id: 'name',
      width: '150px' 
    },
    item: {
      name: 'Brick 1x2' 
    },
  },
}

export const Number: Story = {
  args: {
    column: {
      id: 'count',
      type: 'number',
      width: '100px' 
    },
    item: {
      count: 1500 
    },
  },
}

export const WithClickButton: Story = {
  args: {
    column: {
      id: 'name',
      label: 'Name',
      clickFn: () => {},
      width: '150px' 
    },
    item: {
      name: 'Click me' 
    },
  },
}

export const Image: Story = {
  args: {
    column: {
      id: 'imageUrl',
      type: 'image',
      width: '100px' 
    },
    item: {
      imageUrl: 'https://img.bricklink.com/P/11/4.jpg' 
    },
  },
}

export const Empty: Story = {
  args: {
    column: {
      id: 'name',
      width: '150px' 
    },
    item: {
      name: '' 
    },
  },
}
