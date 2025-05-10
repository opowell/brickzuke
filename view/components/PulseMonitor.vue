<script setup lang="ts">
import { ref } from 'vue'

const showPulse = ref(false)
document.addEventListener('pulse', async function () {
  showPulse.value = true
  setTimeout(() => {
    showPulse.value = false
  }, 200)
})
</script>

<template>
  <div class="pulse" :class="{ 'pulse-show': showPulse }"></div>
</template>

<style scoped>
.pulse {
  border-radius: 50%;
  width: 1rem;
  height: 1rem;
  color: #888;
  opacity: 0;
  position: absolute;
  bottom: 2rem;
  right: 2rem;
  transition: opacity 0.1s ease-in;
  background-color: #aaa;
  border: 1px solid #333;
}
.pulse-show {
  opacity: 1;
}
</style>
