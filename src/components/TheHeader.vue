<script setup lang="ts">
import TheViews from './header/TheViews.vue'
defineProps<{
  msg: string
}>()
</script>

<template>
  <header>
    <a href="/"><img class="home-icon" src="/favicon-32x32.png" /></a>
    <TheViews />
    HEADER
    <nav>NAV</nav>
  </header>
</template>

<style scoped>
.home-icon {
  cursor: pointer;
}
header {
  display: flex;
  flex-wrap: wrap;
}
</style>
