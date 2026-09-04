import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import TheColorMode from '../TheColorMode.vue'
import { colorMode } from '../../../assets/js/color-mode'

/**
 * The button is the only way into the setting, and the setting is only worth
 * anything if it reaches `<html data-theme>` — that attribute is what the
 * `color-scheme` rules in App.vue match on, so these assert the round trip
 * rather than the ref alone.
 */
describe('TheColorMode', () => {
  beforeEach(() => {
    colorMode.value = 'auto'
  })

  it('cycles auto, light and dark, and wraps', async () => {
    const wrapper = mount(TheColorMode)
    expect(colorMode.value).toBe('auto')

    await wrapper.find('button').trigger('click')
    expect(colorMode.value).toBe('light')

    await wrapper.find('button').trigger('click')
    expect(colorMode.value).toBe('dark')

    await wrapper.find('button').trigger('click')
    expect(colorMode.value).toBe('auto')

    wrapper.unmount()
  })

  it('writes the chosen scheme to <html data-theme>', async () => {
    colorMode.value = 'dark'
    await nextTick()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')

    colorMode.value = 'light'
    await nextTick()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  /*
   * `auto` is a setting, not a colour: it has to survive as itself so the
   * button can show it and the next system change can still be followed. The
   * plain useColorMode ref resolves it away, which is why colorMode reads
   * from `store`.
   */
  it('keeps auto as auto while still resolving it to a concrete scheme', async () => {
    colorMode.value = 'auto'
    await nextTick()
    expect(colorMode.value).toBe('auto')
    expect(document.documentElement.getAttribute('data-theme')).toMatch(/^(light|dark)$/)
  })
})
