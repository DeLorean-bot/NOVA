function releaseTransition(item, available, now) {
  const newlyAvailable = available && item.available !== true;
  return { ...item, available, checkedAt: now, error: '', ...(newlyAvailable ? { availableAt: now, unread: true, noticeDismissed: false } : {}) };
}
function dismissReleaseNotices(items, ids) {
  if (!Array.isArray(ids) || ids.length > 50 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error('Invalid notification IDs');
  const selected = new Set(ids);
  return items.map(item => selected.has(item.id) ? { ...item, unread: false, noticeDismissed: true } : item);
}
module.exports = { releaseTransition, dismissReleaseNotices };
