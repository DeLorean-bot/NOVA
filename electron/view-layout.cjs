/** Normal video geometry below the permanent top navigation. */
function normalViewBounds(rect) {
  if (!rect || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(rect[key]) && rect[key] >= 0 && rect[key] < 20000)) return null;
  // Reject stale fullscreen-origin measurements, but allow the full-width content area
  // below the header. The view's final size is still clamped to the window in layout().
  if (rect.x < 12 || rect.y < 90 || rect.width < 1 || rect.height < 1) return null;
  return Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, Math.round(rect[key])]));
}
function shouldShowEmbeddedView(viewId, activeId, concealed) {
  return Boolean(activeId && viewId === activeId && !concealed);
}
module.exports = { normalViewBounds, shouldShowEmbeddedView };
