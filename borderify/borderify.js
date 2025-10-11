console.log('content script')
document.body.style.border = "5px solid red";
function foo() {
  console.log('Hello from background')
}
foo()
