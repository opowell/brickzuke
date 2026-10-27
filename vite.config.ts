import { fileURLToPath, URL } from 'node:url'

import { defineConfig, searchForWorkspaceRoot } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueDevTools()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./view', import.meta.url)),
      '~': fileURLToPath(new URL('./view', import.meta.url)),
    },
    // header-content-layout is linked from ../appfr, which has a Vue of its
    // own installed for its tests. One Vue on the page, or the shell's
    // provide/inject and reactivity are a different Vue's.
    dedupe: ['vue', 'vue-router'],
  },
  server: {
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd()), '../appfr'],
    },
  },
})
