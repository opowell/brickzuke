import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)

// Mounted only once the router has resolved the address bar. Until then
// `currentRoute` is the start location — a bare `/` with no query — and the
// shell mounted against it draws the home screen: every card's preview, the
// counts and the pass over the years behind them, and the two fills, all
// started for a screen nobody asked for, and all in front of the table the
// URL actually names once the route lands a tick later.
void router.isReady().then(() => {
  app.mount('#app')
})
