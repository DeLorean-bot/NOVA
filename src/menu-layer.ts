/** Menus overlay the player. They never reserve space or conceal playback. */
export function announceMenu(id: string, menu: HTMLElement) {
  window.dispatchEvent(new CustomEvent('kadr:select-open', { detail: { id, open: true, nativeSafe: true } }))
}
