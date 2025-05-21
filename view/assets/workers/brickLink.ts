self.onmessage = (e) => {
  if (e.data === 'start') {
    setInterval(() => {
      self.postMessage('ping')
    }, 10000)
  }
}
