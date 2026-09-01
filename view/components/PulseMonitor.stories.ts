import type { Meta, StoryObj } from '@storybook/vue3'
import PulseMonitor from './PulseMonitor.vue'

const meta: Meta<typeof PulseMonitor> = {
  title: 'Components/PulseMonitor',
  component: PulseMonitor,
}

export default meta
type Story = StoryObj<typeof PulseMonitor>

export const Default: Story = {}
