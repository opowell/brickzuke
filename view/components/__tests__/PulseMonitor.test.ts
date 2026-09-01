import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PulseMonitor from '../PulseMonitor.vue'

describe('PulseMonitor', () => {
  it('renders without pulse class initially', () => {
    const wrapper = mount(PulseMonitor)
    expect(wrapper.find('.pulse').classes()).not.toContain('pulse-show')
  })

  it('adds pulse-show class when pulse event fires', async () => {
    const wrapper = mount(PulseMonitor, {
      attachTo: document.body 
    })
    document.dispatchEvent(new Event('pulse'))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.pulse').classes()).toContain('pulse-show')
    wrapper.unmount()
  })

  it('removes pulse-show after 200ms', async () => {
    vi.useFakeTimers()
    const wrapper = mount(PulseMonitor, {
      attachTo: document.body 
    })
    document.dispatchEvent(new Event('pulse'))
    await wrapper.vm.$nextTick()
    vi.advanceTimersByTime(201)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.pulse').classes()).not.toContain('pulse-show')
    vi.useRealTimers()
    wrapper.unmount()
  })
})
