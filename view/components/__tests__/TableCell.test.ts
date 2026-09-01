import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TableCell from '../TableCell.vue'

vi.mock('../../../model', async () => {
  const {
    ref 
  } = await import('vue')
  return {
    selectedItemType: ref(null),
    filters: ref([]),
    setCounts: vi.fn(),
  }
})

vi.mock('@/assets/js/make-call', () => ({
  processQueue: vi.fn(),
}))

describe('TableCell', () => {
  const column = {
    id: 'name',
    width: '150px' 
  }

  it('renders text value from item', () => {
    const wrapper = mount(TableCell, {
      props: {
        column,
        item: {
          name: 'Brick 1x2' 
        } 
      },
    })
    expect(wrapper.text()).toContain('Brick 1x2')
  })

  it('renders nothing when item value is falsy', () => {
    const wrapper = mount(TableCell, {
      props: {
        column,
        item: {
          name: '' 
        } 
      },
    })
    expect(wrapper.text()).toBe('')
  })

  it('formats numbers with type=number', () => {
    const wrapper = mount(TableCell, {
      props: {
        column: {
          id: 'count',
          type: 'number',
          width: '100px' 
        },
        item: {
          count: 1500 
        },
      },
    })
    expect(wrapper.text()).toContain('1.5k')
  })

  it('uses itemValue function when provided', () => {
    const wrapper = mount(TableCell, {
      props: {
        column: {
          id: 'name',
          itemValue: (item: any) => `${item.name} (${item.color})`,
          width: '150px',
        },
        item: {
          name: 'Brick',
          color: 'Red' 
        },
      },
    })
    expect(wrapper.text()).toContain('Brick (Red)')
  })

  it('renders a button when clickFn is provided', () => {
    const wrapper = mount(TableCell, {
      props: {
        column: {
          id: 'name',
          clickFn: vi.fn(),
          width: '150px' 
        },
        item: {
          name: 'Click me' 
        },
      },
    })
    expect(wrapper.find('button').exists()).toBe(true)
  })

  it('calls clickFn on button click', async () => {
    const clickFn = vi.fn()
    const wrapper = mount(TableCell, {
      props: {
        column: {
          id: 'name',
          clickFn,
          width: '150px' 
        },
        item: {
          name: 'Click me' 
        },
      },
    })
    await wrapper.find('button').trigger('click')
    expect(clickFn).toHaveBeenCalledWith({
      name: 'Click me' 
    })
  })

  it('applies max-width style when setMaxWidth is true', () => {
    const wrapper = mount(TableCell, {
      props: {
        column: {
          id: 'name',
          width: '200px' 
        },
        item: {
          name: 'Test' 
        },
        setMaxWidth: true 
      },
    })
    expect(wrapper.find('div').attributes('style')).toContain('max-width')
  })
})
