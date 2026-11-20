const { contextBridge, ipcRenderer } = require('electron');
const invoke = async (channel, ...args) => {
  const result = await ipcRenderer.invoke(`kadr:${channel}`, ...args);
  if (!result.ok) throw new Error(result.error);
  return result.data;
};
contextBridge.exposeInMainWorld('kadr', {
  onMenuAction: listener => {
    const action = (_, id, value) => listener(id, value);
    ipcRenderer.on('kadr:menu-action', action);
    return () => ipcRenderer.removeListener('kadr:menu-action', action);
  },
  openMenu: model => invoke('menu-open', model),
  updateMenu: model => invoke('menu-update', model),
  closeMenu: id => invoke('menu-close', id),
  focusMenu: (id, edge) => invoke('menu-focus', id, edge),
  initialTheme: process.argv.includes('--kadr-theme=dark') ? 'dark' : 'light',
  initialLanguage: process.argv.includes('--kadr-language=en') ? 'en' : 'ru',
  initialLanguageMode: process.argv.includes('--kadr-language-mode=system') ? 'system' : process.argv.includes('--kadr-language=en') ? 'en' : 'ru',
  initialMotion: !process.argv.includes('--kadr-motion=off'),
  initialGlassBackground: !process.argv.includes('--kadr-glass-background=off'),
  initialSidebarCollapsed: process.argv.includes('--kadr-sidebar=compact'),
  state: () => invoke('state'),
  updateStatus: () => invoke('update-status'),
  checkUpdate: () => invoke('check-update'),
  applyUpdate: () => invoke('apply-update'),
  onUpdateStatus: listener => {
    const status = (_, value) => listener(value);
    ipcRenderer.on('kadr:update-status', status);
    return () => ipcRenderer.removeListener('kadr:update-status', status);
  },
  catalog: (type, page) => invoke('catalog', type, page),
  search: (query, page = 1) => invoke('search', query, page),
  browse: (type, page = 1, options) => invoke('browse', type, page, options),
  recommendations: (refresh = false) => invoke('recommendations', refresh),
  rateMovie: (movie, action) => invoke('rate-movie', movie, action),
  undoFeedback: token => invoke('undo-feedback', token),
  posterStatus: (id,size) => invoke('poster-status',id,size),
  onFeedback: listener => {const fn=(_,notice)=>listener(notice);ipcRenderer.on('kadr:feedback',fn);return()=>ipcRenderer.removeListener('kadr:feedback',fn)},
  tasteGenres: (genres, blocked) => invoke('taste-genres', genres, blocked),
  filmMenu: movie => invoke('film-menu', movie),
  recommendationsSeen: ids => invoke('recommendations-seen', ids),
  upcoming: () => invoke('upcoming'),
  details: movie => invoke('details', movie),
  ratings: (imdbId, type) => invoke('ratings', imdbId, type),
  trailer: id => invoke('trailer', id),
  open: url => invoke('open', url),
  home: () => invoke('home'),
  tab: id => invoke('tab', id),
  closeTab: id => invoke('close-tab', id),
  bounds: rect => invoke('bounds', rect),
  conceal: value => invoke('conceal', value),
  navigate: (action, address) => invoke('navigate', action, address),
  watch: movie => invoke('watch', movie),
  provider: (index, translation) => invoke('provider', index, translation),
  favorite: movie => invoke('favorite', movie),
  addSite: (name, url) => invoke('add-site', name, url),
  removeSite: id => invoke('remove-site', id),
  clearHistory: () => invoke('clear-history'),
  followRelease: movie => invoke('follow-release', movie),
  unfollowRelease: id => invoke('unfollow-release', id),
  checkReleases: () => invoke('check-releases'),
  readReleases: id => invoke('read-releases', id),
  dismissReleaseNotices: ids => invoke('dismiss-release-notices', ids),
  adblock: () => invoke('adblock'),
  updateProfile: patch => invoke('profile', patch),
  theme: mode => invoke('theme', mode),
  language: value => invoke('language', value),
  motion: enabled => invoke('motion', enabled),
  glassBackground: enabled => invoke('glass-background', enabled),
  sidebar: collapsed => invoke('sidebar', collapsed),
  window: action => invoke('window', action),
  onState: listener => { const fn = (_, state) => listener(state); ipcRenderer.on('kadr:state', fn); return () => ipcRenderer.removeListener('kadr:state', fn); },
  onFocusSearch: listener => { const fn = () => listener(); ipcRenderer.on('kadr:focus-search', fn); return () => ipcRenderer.removeListener('kadr:focus-search', fn); },
  onShowReleases: listener => { const fn = () => listener(); ipcRenderer.on('kadr:show-releases', fn); return () => ipcRenderer.removeListener('kadr:show-releases', fn); },
});
