import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeConfig } from 'vite'
import type { StorybookConfig } from '@storybook/vue3-vite'

const sbDir = dirname(fileURLToPath(import.meta.url))

function mockPath(file: string) {
  return resolve(sbDir, 'mocks', file)
}

const config: StorybookConfig = {
  stories: ['../view/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: ['@storybook/addon-essentials'],
  framework: {
    name: '@storybook/vue3-vite',
    options: {},
  },
  async viteFinal(config) {
    return mergeConfig(config, {
      plugins: [
        {
          name: 'storybook-mocks',
          enforce: 'pre',
          resolveId(id: string) {
            if (id === '@/assets/js/make-call') return mockPath('make-call.ts')
          },
        },
      ],
    })
  },
}

export default config
