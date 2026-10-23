import { onBeforeUnmount, watch } from 'vue'

// Only the top dialog receives focus. Recompute isolation when nested dialogs
// open/close so a parent cannot leave a teleported child inert.
const dialogs = []
const isolated = new Map()
let externalDialogs = 0
const selector = 'button, [href], input, select, textarea, [tabindex], summary'
const visible = element => !element.disabled && element.tabIndex >= 0
  && !element.closest('[inert]') && element.getClientRects().length > 0
const focusables = dialog => [...dialog.querySelectorAll(selector)].filter(visible)

// Raise the backdrop, not just the panel inside its stacking context. Dialogs
// are teleported to body; their CSS layers historically range from 250–10003.
// Keep application dialogs below the wallet SDK and signature-waiting layer.
function acquireLayer(element) {
  let layer = element
  for (let node = element; node && node !== document.body; node = node.parentElement) {
    if (getComputedStyle(node).position === 'fixed') layer = node
  }
  const value = layer.style.getPropertyValue('z-index')
  const priority = layer.style.getPropertyPriority('z-index')
  const zIndex = Math.max(10010, ...dialogs.map(dialog => dialog.zIndex + 1))
  layer.style.setProperty('z-index', String(zIndex))
  return { zIndex, restoreLayer: () => {
    if (value) layer.style.setProperty('z-index', value, priority)
    else layer.style.removeProperty('z-index')
  } }
}

function restoreBackground() {
  for (const [element, state] of isolated) {
    element.inert = state.inert
    if (state.hidden === null) element.removeAttribute('aria-hidden')
    else element.setAttribute('aria-hidden', state.hidden)
  }
  isolated.clear()
}

function isolateBackground() {
  restoreBackground()
  if (externalDialogs) return
  let branch = dialogs.at(-1)?.element
  while (branch && branch !== document.body) {
    for (const sibling of branch.parentElement?.children || []) {
      if (sibling === branch || ['SCRIPT', 'STYLE', 'LINK'].includes(sibling.tagName)) continue
      isolated.set(sibling, { inert: sibling.inert, hidden: sibling.getAttribute('aria-hidden') })
      sibling.inert = true
      sibling.setAttribute('aria-hidden', 'true')
    }
    branch = branch.parentElement
  }
}

// Wallet SDKs own their own focus management outside our Vue dialog stack.
export function suspendModalAccessibility() {
  externalDialogs++
  restoreBackground()
  let released = false
  return () => {
    if (released) return
    released = true
    externalDialogs = Math.max(0, externalDialogs - 1)
    isolateBackground()
    const top = dialogs.at(-1)?.element
    if (!externalDialogs && top && !top.contains(document.activeElement)) (focusables(top)[0] || top).focus({ preventScroll: true })
  }
}

export function useModalAccessibility(dialogRef, { onClose, initialFocus } = {}) {
  let release = () => {}
  watch(dialogRef, element => {
    release()
    if (!element) return
    const outgoing = dialogs.at(-1)
    const previous = document.activeElement === document.body && outgoing && !outgoing.element.isConnected
      ? outgoing.previous : document.activeElement
    const entry = { element, previous, ...acquireLayer(element) }
    dialogs.push(entry)
    element.setAttribute('tabindex', '-1')
    const focusFirst = () => (initialFocus?.value || focusables(element)[0] || element).focus({ preventScroll: true })
    // Move focus before hiding the old focused element from assistive tech.
    // A nested dialog may have been mounted inside a previously inert branch.
    restoreBackground()
    focusFirst()
    isolateBackground()
    const onKey = event => {
      if (externalDialogs || dialogs.at(-1) !== entry) return
      if (event.key === 'Escape' && onClose) {
        event.preventDefault()
        event.stopImmediatePropagation()
        onClose()
      } else if (event.key === 'Tab') {
        const items = focusables(element)
        const first = items[0] || element
        const last = items.at(-1) || element
        if (!element.contains(document.activeElement) || !items.length
          || (event.shiftKey && document.activeElement === first)
          || (!event.shiftKey && document.activeElement === last)) {
          event.preventDefault()
          ;(event.shiftKey ? last : first).focus()
        }
      }
    }
    const onFocus = event => {
      if (!externalDialogs && dialogs.at(-1) === entry && !element.contains(event.target)) focusFirst()
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('focusin', onFocus)
    release = () => {
      const wasTop = dialogs.at(-1) === entry
      dialogs.splice(dialogs.indexOf(entry), 1)
      entry.restoreLayer()
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('focusin', onFocus)
      isolateBackground()
      if (wasTop && previous?.isConnected && !previous.closest('[inert]')) previous.focus({ preventScroll: true })
      release = () => {}
    }
  }, { flush: 'post', immediate: true })
  onBeforeUnmount(() => release())
}
