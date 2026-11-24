const {createNativeMenus}=require('./native-menu.cjs');
const { createAppearanceStore } = require('./appearance.cjs');
const { readProfile, patchProfile } = require('./profile.cjs');
const { normalViewBounds, shouldShowEmbeddedView, isPlayerDoubleClick } = require('./view-layout.cjs');
const { app, BrowserWindow, WebContentsView, ipcMain, session, shell, Menu, webFrameMain, globalShortcut, Notification, screen, nativeImage, nativeTheme, net, protocol } = require('electron');
const englishMessages = require('./locales/en.json');
const { resolveLanguage } = require('./language.cjs');
const { checkForUpdate } = require('./releases-update.cjs');
const { createAppUpdates } = require('./app-updates.cjs');
const { createCommunity, discoverCommunity } = require('./community.cjs');
const path = require('node:path');
const { existsSync } = require('node:fs');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { SOURCE, API, webUrl, contentInfo, movieId, normalizeMovie, parseBlacklist, normalizePlayers, contentWarnings } = require('./core.cjs');
const adblock = require('./adblock.cjs');
const { metadataEndpoint, metadataPage, catalogParams, filterCatalogPage, externalTitle } = require('./library-source.cjs');
const { plotWords, findPlotMovies } = require('./plot-search.cjs');
const { chromiumFetch } = require('./network.cjs');
const { videoFacts, playedDelta, watchProgress } = require('./playback.cjs');
const { createPauseScene, pausedFrame } = require('./pause-scene.cjs');
const { createSceneCast, loadScenePortrait, personKey } = require('./scene-cast.cjs');
const { castQuery, castCredits } = require('./cast-credits.cjs');
const { createUpcoming } = require('./upcoming.cjs');
const { releaseTransition, dismissReleaseNotices } = require('./releases.cjs');
const { createRatings } = require('./ratings.cjs');
const { bindPlayerFullscreenKey } = require('./player-fullscreen-key.cjs');
const { createRecommendationSource } = require('./recommendation-source.cjs');
const { cleanTaste, rateMovie, GENRES } = require('./taste.cjs');
const {trailerDestination}=require('./trailers.cjs');
const {createPosterStatus}=require('./posters.cjs');
protocol.registerSchemesAsPrivileged([{ scheme: 'nova-cast-model', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
const sceneCast = createSceneCast(chromiumFetch);
const scenePortraits = new Map();
const ratingsFor = createRatings(async url => {
  const response = await chromiumFetch(url, { signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json, text/html' } });
  if (!response.ok) throw new Error('Рейтинги временно недоступны');
  return response.text();
});

const testProfile = process.argv.find(a => a.startsWith('--test-profile='));
// The public name changed. Keep the existing profile and Chromium sessions in place.
app.setPath('userData', testProfile
  ? path.resolve(testProfile.slice('--test-profile='.length))
  : path.join(app.getPath('appData'), 'Кадр'));
const localPage = path.join(__dirname, '..', 'dist', 'index.html');
const iconFile = (name = '') => path.join(__dirname, '..', 'build', `icon${name}.png`);
function windowIcon() {
  if (process.platform !== 'win32' || nativeTheme.shouldUseHighContrastColors) return iconFile();
  return iconFile(nativeTheme.shouldUseDarkColorsForSystemIntegratedUI ? '-dark' : '-light');
}
let nativeMenus, pauseScene, pauseProbeTimer, pauseRevision = 0;
let win, dataFile, appearanceStore, writeQueue = Promise.resolve(), blacklist, blacklistTime = 0;
let state = { profile: readProfile(null, nativeImage.createFromDataURL), favorites: [], history: [], releases: [], sites: [], scores: {}, theme: 'light', motion: true, glassBackground: true, taste: cleanTaste({}, cleanMovie), sidebarCollapsed: false };
let language = 'ru';
let languageMode = 'system';
let languageWrite = Promise.resolve();
let appUpdates, updateTimer, desktopUpdateNotice, community, communityTimer, communityDiscovery;
let playerSessionReady;
const uiText = (message, ...values) => {
  const template = language === 'en' && Object.hasOwn(englishMessages, message) ? englishMessages[message] : message;
  return template.replace(/\{(\d+)\}/g, (match, index) => Number(index) < values.length ? String(values[Number(index)]) : match);
};
let playbackTimer, releasesTimer, pollingPlayback = false, checkingReleases = false, lastProgressSave = 0;
const playerCache = new Map();
const tabs = new Map(), knownMovies = new Map(), catalogCache = new Map();
let active = null, concealed = false, nextTab = 1, concealRevision = 0;
let previewRevision = 0;
let metadataBase = '', metadataAt = 0;
const searchCache = new Map(), metadataPending = new Map();
let endpointPending, blacklistPending;
const recommendationCandidates = createRecommendationSource({ catalog, browse: sourceBrowse, profile: () => state, blocked: restrictions });
let fullscreenExit = null, fullscreenRestore = null, fullscreenWanted = false;

async function sourceSearch(query, page = 1) {
  if (typeof query !== 'string' || (!/^[1-9]\d{0,11}$/.test(query.trim()) && query.trim().length < 2) || query.length > 250 || !Number.isInteger(page) || page < 1 || page > 1000) throw new Error('Введите название, ID или ссылку на фильм');
  const text = query.trim();
  const info = contentInfo(text);
  const id = info?.id || (/^[1-9]\d{0,11}$/.test(text) ? movieId(text) : null);
  if (/^https?:\/\//i.test(text) && !info) return { movies: [], nextPage: null };
  return metadataRequest(id ? { kp: String(id) } : { name: text, list: '1', page: String(page) }, page);
}

async function externalTitleSearch({ imdb, tmdb, type }) {
  const result = await metadataRequest(imdb ? { imdb } : { tmdb }, 1);
  return { nextPage: null, movies: result.movies.filter(movie =>
    (imdb ? movie.imdbId === imdb : movie.tmdbId === tmdb) && (!type || movie.type === type)) };
}

const titleKey = value => (value || '').toLowerCase().replaceAll('ё', 'е').replace(/[^\p{L}\p{N}]/gu, '');

async function matchPlotTitle({ id, imdb, tmdb, type, title, year }) {
  if (id) {
    const movie = knownMovies.get(id) || (await sourceSearch(String(id)).catch(() => null))?.movies.find(movie => movie.id === id);
    if (movie) return movie;
  }
  for (const external of [imdb && { imdb }, tmdb && { tmdb, type }].filter(Boolean)) {
    const [movie] = (await externalTitleSearch(external).catch(() => ({ movies: [] }))).movies;
    if (movie) return movie;
  }
  if (!title || !year) return undefined;
  const { movies } = await sourceSearch(title.slice(0, 250));
  return movies.find(movie => movie.year === year && (!type || movie.type === type) &&
    [movie.title, movie.original].some(name => titleKey(name) === titleKey(title)));
}

async function searchCatalog(query, page = 1, requestId) {
  if (typeof query !== 'string' || query.length > 500) throw new Error('Введите название, ID или ссылку на фильм');
  const text = query.trim();
  const external = externalTitle(text);
  if (external) return externalTitleSearch(external);
  const words = plotWords(text);
  if (page !== 1 || words.length < 2 || /^https?:\/\//i.test(text)) return sourceSearch(text, page);
  const titleResult = text.length <= 250 ? await sourceSearch(text).catch(error => ({ error })) : { movies: [], nextPage: null };
  const exactTitle = titleResult.movies?.some(movie => [movie.title, movie.original].some(title => titleKey(title) === titleKey(text)));
  const description = (text.match(/\p{L}+/gu)?.length ?? 0) >= 5;
  if (exactTitle || (titleResult.movies?.length && !description && words.length < 4)) return titleResult;
  const movies = await findPlotMovies(text, async url => {
    const response = await chromiumFetch(url, {
      headers: { 'User-Agent': 'NOVA (https://github.com/DeLorean-bot/NOVA)', Accept: 'application/json' },
      signal: AbortSignal.timeout(6500),
    });
    if (!response.ok) throw new Error('Поиск по сюжету временно недоступен.');
    const body = await response.json();
    if (body.error) throw new Error('Поиск по сюжету временно недоступен.');
    return body;
  }, matchPlotTitle, phase => {
    if (Number.isSafeInteger(requestId) && win && !win.isDestroyed()) {
      win.webContents.send('kadr:search-phase', requestId, phase);
    }
  }).catch(error => {
    if (titleResult.movies?.length) return [];
    throw titleResult.error || error;
  });
  if (!movies.length && titleResult.error) throw titleResult.error;
  const titles = titleResult.movies ?? [];
  return {
    movies: [...new Map((description ? [...movies, ...titles] : [...titles, ...movies]).map(movie => [movie.id, movie])).values()],
    nextPage: titleResult.nextPage ?? null,
  };
}

async function sourceBrowse(type, page = 1, options) {
  const params = catalogParams(type, page, options);
  const result = await metadataRequest(params, page);
  return filterCatalogPage(result, type, options);
}

async function metadataRequest(params, page) {
  const key = new URLSearchParams(params).toString().toLocaleLowerCase('ru');
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.result;
  const pending = metadataPending.get(key);
  if (pending) return pending;
  const request = fetchMetadata(params, page, key);
  metadataPending.set(key, request);
  try { return await request; }
  finally { metadataPending.delete(key); }
}

async function fetchMetadata(params, page, key) {
  if (!metadataBase || Date.now() - metadataAt > 60 * 60 * 1000) {
    endpointPending ??= fetchText(SOURCE + '/titlename.js').then(script => {
      metadataBase = metadataEndpoint(script);
      metadataAt = Date.now();
    }).finally(() => { endpointPending = undefined; });
    await endpointPending;
  }
  const url = new URL(metadataBase);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  let body;
  try { body = JSON.parse(await fetchText(url.href)); }
  catch { throw new Error('Каталог недоступен. Проверьте подключение и повторите.'); }
  const result = metadataPage(body, page);
  for (const movie of result.movies) {
    const previous = knownMovies.get(movie.id);
    knownMovies.set(movie.id, { ...previous, ...movie, cover: previous?.cover || '', poster: movie.poster || previous?.poster || '',
      age: movie.age || previous?.age || '', contentWarnings: movie.contentWarnings?.length ? movie.contentWarnings : previous?.contentWarnings || [],
      premiereDate: movie.premiereDate || previous?.premiereDate });
  }
  searchCache.set(key, { at: Date.now(), result });
  if (searchCache.size > 100) searchCache.delete(searchCache.keys().next().value);
  return result;
}
let viewRect = { x: 16, y: 212, width: 1408, height: 712 };

function cleanMovie(m) {
  let trailer = '';
  try { if (m?.trailer) trailer = webUrl(m.trailer); } catch {}
  return {
    id: movieId(m?.id), type: m.type === 'series' ? 'series' : 'film',
    title: String(m.title || `Фильм ${m.id}`).slice(0, 250), original: String(m.original || '').slice(0, 250),
    year: Number(m.year) || null, rating: Number(m.rating) || null,
    poster: m.poster ? webUrl(m.poster) : '', cover: m.cover ? webUrl(m.cover) : '',
    age: String(m.age || '').replace(/\D/g, ''),
    contentWarnings: contentWarnings(m.contentWarnings), trailer,
    genres: (Array.isArray(m.genres) ? m.genres : []).map(g => String(g).slice(0, 80)).slice(0, 5),
    description: String(m.description || '').slice(0, 4000),
    seasons: Number.isInteger(m.seasons) && m.seasons > 0 && m.seasons < 10000 ? m.seasons : undefined,
    premiereDate: /^\d{4}-\d{2}-\d{2}$/.test(m.premiereDate||'') ? m.premiereDate : undefined,
    imdbId: /^tt\d{7,10}$/.test(m.imdbId||'')?m.imdbId:'', imdbRating: Number(m.imdbRating)>0&&Number(m.imdbRating)<=10?Number(m.imdbRating):null,
    directors:String(m.directors||'').slice(0,600),actors:String(m.actors||'').slice(0,800),country:String(m.country||'').slice(0,250),runtime:Number(m.runtime)>0&&Number(m.runtime)<2000?Number(m.runtime):null,
  };
}

function save() {
  const payload = JSON.stringify(state, null, 2);
  writeQueue = writeQueue.catch(() => {}).then(async () => {
    await fs.writeFile(dataFile + '.tmp', payload, 'utf8');
    await fs.rename(dataFile + '.tmp', dataFile);
  });
  return writeQueue;
}

function tabState(t) {
  const wc = t.view.webContents;
  return {
    id: t.id, title: t.title, url: wc.getURL() || t.url, loading: wc.isLoading(),
    canBack: wc.navigationHistory.canGoBack(), canForward: wc.navigationHistory.canGoForward(),
    error: t.error || '', detected: contentInfo(wc.getURL()), kind: t.kind,
    adblock: { enabled: true, blocked: t.blocked },
    movie: t.movie || null,
    playback: t.playback || null,
    providers: (t.providers || []).map(p => ({ name: p.name, translations: p.translations.map(x => ({ name: x.name, quality: x.quality })) })),
    provider: t.provider || 0, translation: t.translation ?? -1,
  };
}

function snapshot() {
  return { ...state, community: community?.state, tabs: [...tabs.values()].filter(tab => !tab.preview).map(tabState), active, source: SOURCE, immersive: immersive(), fullscreen: Boolean(win && !win.isDestroyed() && win.isFullScreen()) };
}
function emit() { if (win && !win.isDestroyed()) win.webContents.send('kadr:state', snapshot()); }

function connectCommunity() {
  if (community.state.configured) {
    clearInterval(communityTimer);
    void community.flush();
  } else if (!testProfile && !communityDiscovery && net.isOnline()) {
    communityDiscovery = discoverCommunity(chromiumFetch).then(origin => community.configure(origin)).catch(() => {})
      .finally(() => { communityDiscovery = null; if (community.state.configured) clearInterval(communityTimer); });
  }
}
function immersive() {
  const tab = tabs.get(active);
  return Boolean(win && !win.isDestroyed() && win.isFullScreen() && tab && (tab.kind === 'player' || tab.htmlFullscreen));
}
// Chromium can consume the physical Escape key before before-input-event in
// an embedded fullscreen frame. Own this key only while our window is focused
// and fullscreen; release it immediately on blur or fullscreen exit.
function syncEscapeShortcut() {
  const enabled = win && !win.isDestroyed() && win.isFullScreen() && win.isFocused();
  for (const key of ['Escape', 'F11']) {
    if (!enabled || (key === 'Escape' && concealed)) globalShortcut.unregister(key);
    else if (!globalShortcut.isRegistered(key)) globalShortcut.register(key, () => {
      if (win && !win.isDestroyed() && win.isFocused()) { if(nativeMenus?.isOpen())nativeMenus.close(null,true);else exitFullscreen(); }
    });
  }
}
function enterFullscreen() {
  if (!win || win.isDestroyed() || fullscreenExit) return;
  if (!fullscreenWanted) fullscreenRestore = { maximized: win.isMaximized(), bounds: win.getNormalBounds() };
  fullscreenWanted = true;
  const tab = tabs.get(active);
  if (tab && !tab.view.webContents.isDestroyed()) tab.view.webContents.setBackgroundThrottling(false);
  win.setFullScreen(true); syncEscapeShortcut(); layout(); emit();
}
function leaveHtmlFullscreen(wc) {
  if (!wc || wc.isDestroyed() || wc.isCrashed()) return Promise.resolve();
  try {
    // Exit the ancestor document once. Its fullscreen element is the iframe;
    // the DOM API also unwinds its descendants. Concurrent exits in every
    // frame race Chromium's native-window restoration on maximized windows.
    return Promise.race([
      wc.mainFrame.executeJavaScript('(async () => { if (document.fullscreenElement) await document.exitFullscreen(); })()').catch(() => {}),
      new Promise(resolve => { const timer = setTimeout(resolve, 1000); timer.unref(); }),
    ]);
  } catch { return Promise.resolve(); }
}
function exitFullscreen() {
  if (fullscreenExit) return fullscreenExit;
  fullscreenWanted = false;
  const tab = tabs.get(active);
  if (tab) tab.htmlFullscreen = false;
  const wc = tab?.view.webContents;
  const previous = fullscreenRestore;
  fullscreenRestore = null;
  fullscreenExit = leaveHtmlFullscreen(wc).then(() => {
    if (!win || win.isDestroyed()) return;
    win.setFullScreen(false);
    if (previous?.maximized && !win.isMaximized()) win.maximize();
    else if (previous && !previous.maximized && !win.isMaximized()) win.setBounds(previous.bounds);
    // Restore the saved normal player rectangle before relying on a renderer
    // ResizeObserver. Otherwise the native video can cover the entire shell.
    layout(); emit(); syncEscapeShortcut();
  }).finally(() => { fullscreenExit = null; });
  return fullscreenExit;
}
function toggleFullscreen() {
  if (fullscreenExit) return;
  if (win.isFullScreen() || fullscreenWanted || tabs.get(active)?.htmlFullscreen) exitFullscreen();
  else enterFullscreen();
}

async function fetchText(url) {
  let response;
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await chromiumFetch(url, { signal: AbortSignal.timeout(25000), headers: { Accept: 'application/json, text/plain, */*', Referer: SOURCE + '/' } });
      if (![429, 503].includes(response.status) || attempt === 2) break;
      await response.body?.cancel();
      await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
  catch { throw new Error('Не удалось связаться с источником. Проверьте подключение и повторите.'); }
  if (!response.ok) throw new Error(`Источник ответил ${response.status}. Попробуйте позже.`);
  let text;
  try { text = await response.text(); }
  catch { throw new Error('Соединение с источником прервалось. Повторите запрос.'); }
  if (text.length > 4_000_000) throw new Error('Слишком большой ответ источника');
  return text;
}

async function playersFor(id, fresh = false) {
  const cached = playerCache.get(id);
  if (!fresh && cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.providers;
  const body = JSON.parse(await fetchText(`${API}/api/players?kinopoisk=${movieId(id)}`));
  if (!Array.isArray(body.data)) throw new Error('Не удалось проверить доступные плееры.');
  const providers = normalizePlayers(body.data);
  playerCache.set(id, { providers, at: Date.now() });
  return providers;
}

function pauseSceneContext() {
  const tab = tabs.get(active);
  if (concealed || tab?.kind !== 'player') return null;
  if (!tab.pausedFrame) {
    if (tab.warningUntil > Date.now()) return { id: tab.id, view: tab.view, model: {
      variant: 'warning', language, theme: state.theme, motion: state.motion, age: tab.movie.age, warnings: tab.movie.contentWarnings,
      label: uiText('Возрастное ограничение'),
    } };
    return null;
  }
  const frame = tab.pausedFrame;
  const actors = (tab.sceneScan?.actors ?? frame.actors).map(actor => ({ name: actor.name, detail: actor.role, image: actor.image }));
  return { id: tab.id, view: tab.view, model: {
    language, theme: state.theme, motion: state.motion, time: Math.floor(frame.time), actors,
    tracks: frame.tracks.map(track => ({ name: track.title, detail: track.artist, image: track.image })),
    labels: {
      pause: uiText('На паузе'), actors: uiText('Актёры в кадре'),
      music: uiText('Музыка в сцене'), noActors: uiText(tab.sceneScan?.pending ? 'Определяем актёров в кадре…' : 'Нет данных об актёрах в этой сцене'),
      noMusic: uiText('Трек для этой сцены не указан'),
    },
  } };
}

function scenePortrait(url) {
  if (scenePortraits.has(url)) return scenePortraits.get(url);
  const result = loadScenePortrait(chromiumFetch, nativeImage, url).then(image => {
    if (!image && scenePortraits.get(url) === result) scenePortraits.delete(url);
    return image;
  });
  if (scenePortraits.size >= 48) scenePortraits.delete(scenePortraits.keys().next().value);
  scenePortraits.set(url, result);
  return result;
}

async function identifyPausedActors(tab, frame, request) {
  const view = tab.view;
  const current = () => active === tab.id && tab.view === view && tab.sceneScan === request && !concealed;
  try {
    let movie = { ...tab.movie, ...knownMovies.get(tab.movie.id) };
    if (!movie.original || !movie.year) {
      const details = await sourceSearch(String(movie.id)).catch(() => null);
      if (details?.movies[0]) movie = { ...movie, ...details.movies[0] };
    }
    if (!current()) return;
    const cast = await sceneCast(movie);
    if (!current()) return;
    if (frame.actors.length) {
      request.actors = frame.actors.map(actor => {
        const key = personKey(actor.name);
        const matches = cast.filter(person => [person.name, person.localized].some(name => personKey(name) === key));
        const credit = matches.length === 1 ? matches[0] : null;
        return { ...actor, role: actor.role || credit?.role, image: actor.image || credit?.photos[0] };
      });
      return;
    }
    const candidates = cast.filter(actor => actor.photos.length).slice(0, 12);
    const references = (await Promise.all(candidates.map(async (actor, index) => {
      const photos = await Promise.all(actor.photos.map(async id => ({ id, index, source: await scenePortrait(id) })));
      return photos.filter(item => item.source);
    }))).flat();
    if (!references.length || !current()) return;
    const indices = await pauseScene.recognize(view, frame.time, references, current);
    if (current()) request.actors = indices.flatMap(index => {
      const person = candidates[index];
      if (!person) return [];
      return [{ name: language === 'ru' && person.localized ? person.localized : person.name,
        role: person.role, image: references.find(item => item.index === index)?.source }];
    });
  } catch {} finally {
    request.pending = false;
    if (current()) pauseScene?.sync();
  }
}

function showPausedFrame(tab, facts) {
  tab.pausedFrame = pausedFrame(facts);
  if (tab.pausedFrame && tab.warningUntil > Date.now()) {
    tab.warningUntil = 0;
    clearTimeout(tab.warningTimer);
  }
  if (!tab.warningStarted && facts?.played && !facts.paused && facts.width && facts.ready >= 2 &&
      (tab.movie.age || tab.movie.contentWarnings.length)) {
    tab.warningStarted = Date.now();
    tab.warningUntil = tab.warningStarted + 5500;
    tab.warningTimer = setTimeout(() => pauseScene?.sync(), 5500);
    tab.warningTimer.unref();
  }
  const frame = tab.pausedFrame;
  if (!frame) {
    tab.sceneScan = undefined;
    pauseScene?.sync();
    return;
  }
  const key = JSON.stringify([frame.time, facts.frames, frame.actors]);
  if (tab.sceneScan?.key !== key) {
    tab.sceneScan = { key, pending: !frame.actors.length || frame.actors.some(actor => !actor.image || !actor.role) };
    if (tab.sceneScan.pending) {
      void identifyPausedActors(tab, frame, tab.sceneScan);
    }
  }
  pauseScene?.sync();
  if (!pauseProbeTimer && !concealed) schedulePauseProbe(tab, 650);
}

function schedulePauseProbe(tab, delay = 90) {
  if (tab?.kind !== 'player' || tab.id !== active || concealed) return;
  const revision = ++pauseRevision;
  clearTimeout(pauseProbeTimer);
  const view = tab.view;
  pauseProbeTimer = setTimeout(async () => {
    const facts = await videoFacts(view.webContents).catch(() => null);
    if (revision !== pauseRevision) return;
    pauseProbeTimer = undefined;
    if (active === tab.id && tab.view === view) showPausedFrame(tab, facts);
  }, delay);
  pauseProbeTimer.unref();
}

function clearPausedFrame(tab) {
  if (tab) { tab.pausedFrame = null; tab.sceneScan = undefined; }
  if (tab && tab.id !== active) return;
  pauseRevision++;
  clearTimeout(pauseProbeTimer);
  pauseProbeTimer = undefined;
  pauseScene?.sync();
}

async function pollPlayback() {
  if (pollingPlayback) return;
  const tab = tabs.get(active);
  if (!tab || tab.kind !== 'player' || tab.view.webContents.isDestroyed()) return;
  pollingPlayback = true;
  try {
    const now = Date.now(), previous = tab.playback, revision = pauseRevision;
    const view = tab.view;
    const facts = await videoFacts(view.webContents);
    if (tabs.get(tab.id) !== tab || tab.view !== view || active !== tab.id) return;
    if (revision === pauseRevision && !pauseProbeTimer && !concealed) showPausedFrame(tab, facts);
    const elapsed = Math.min(10, (now - (tab.probedAt || now)) / 1000);
    const delta = playedDelta(previous, facts, elapsed);
    tab.probedAt = now; tab.playback = facts;
    const item = state.history.find(m => m.id === tab.movie?.id);
    if (delta > 0 && tab.movie) {
      if (item) Object.assign(item, watchProgress(item, previous, facts, elapsed, now));
      if (item && now - lastProgressSave > 15000) { lastProgressSave = now; await save(); emit(); }
    }
    const finished = item && facts?.ended && !tab.finishOffered && (item.type === 'film'
      ? item.completed : facts.scene.finalEpisode && (item.watchedSeconds || 0) >= 120);
    if (finished && active === tab.id) {
      tab.finishOffered = true;
      item.completed = true;
      if (win && !win.isDestroyed()) win.webContents.send('kadr:watch-finished', item);
      await save(); emit();
    }
  } catch {} finally { pollingPlayback = false; }
}

async function checkReleases(force = false) {
  if (checkingReleases) return;
  checkingReleases = true;
  try {
    for (const item of [...state.releases]) {
      if (!force && item.checkedAt && Date.now() - Date.parse(item.checkedAt) < 30 * 60 * 1000) continue;
      try {
        const available = (await playersFor(item.id, true)).length > 0;
        const index = state.releases.findIndex(m => m.id === item.id);
        if (index < 0) continue;
        const updated = releaseTransition(state.releases[index], available, new Date().toISOString());
        state.releases[index] = updated;
        if (!testProfile && available && item.available !== true && Notification.isSupported()) {
          const notification = new Notification({ title: uiText('Можно смотреть в NOVA'), body: item.title, icon: iconFile() });
          notification.on('click', () => { if (win && !win.isDestroyed()) { win.show(); win.focus(); win.webContents.send('kadr:show-releases'); } });
          notification.show();
        }
      } catch { const current = state.releases.find(m => m.id === item.id); if (current) current.error = 'Проверка не удалась. Повторим позже.'; }
      await save(); emit();
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
  } finally { checkingReleases = false; }
}

async function restrictions() {
  if (blacklist && Date.now() - blacklistTime < 60 * 60 * 1000) return blacklist;
  blacklistPending ??= refreshRestrictions().finally(() => { blacklistPending = undefined; });
  return blacklistPending;
}

async function refreshRestrictions() {
  try {
    blacklist = parseBlacklist(await fetchText(SOURCE + '/blacklist.js'));
    blacklistTime = Date.now();
    await fs.writeFile(path.join(app.getPath('userData'), 'restrictions.json'), JSON.stringify({ at: blacklistTime, ids: [...blacklist] })).catch(() => {});
  } catch (error) {
    if (!blacklist || Date.now() - blacklistTime > 24 * 60 * 60 * 1000) throw new Error('Не удалось проверить доступность каталога у источника. Проверьте интернет.');
  }
  return blacklist;
}

async function catalog(type, page) {
  if (!['films', 'series'].includes(type) || !Number.isInteger(page) || page < 1 || page > 34) throw new Error('Некорректная страница каталога');
  const key = `${type}-${page}`;
  const cached = catalogCache.get(key);
  if (cached && Date.now() - cached.at < 15 * 60 * 1000) return cached.result;
  const blocked = await restrictions();
  const body = JSON.parse(await fetchText(`${API}/api/popular?type=${type}&page=${page}`));
  if (!Array.isArray(body.data?.items)) throw new Error('Источник вернул неизвестный формат каталога');
  const movies = body.data.items.filter(item => !blocked.has(Number(item.id))).flatMap(item => {
    try { const movie = normalizeMovie(item); knownMovies.set(movie.id, movie); return [movie]; } catch { return []; }
  });
  const result = { movies, total: Number(body.data.total) || 0, hasMore: page < 34 && body.data.items.length > 0 && page * 30 < (Number(body.data.total) || 1000) };
  catalogCache.set(key, { at: Date.now(), result });
  return result;
}

function layout() {
  if (!win || win.isDestroyed()) return;
  const { width, height } = win.getContentBounds();
  const fullscreen = immersive();
  for (const tab of tabs.values()) {
    const view = tab.view;
    const visible = tab.preview
      ? Boolean(concealed && tab.previewOwner === active && tab.previewRect?.width && tab.previewRect?.height)
      : shouldShowEmbeddedView(tab.id, active, concealed);
    if (visible) {
      const radius = tab.preview ? 14 : fullscreen ? 0 : 16;
      if (tab.radiusView !== view || tab.radius !== radius) {
        view.setBorderRadius(radius);
        tab.radiusView = view;
        tab.radius = radius;
      }
      const rect = tab.preview ? tab.previewRect : viewRect;
      const next = fullscreen && !tab.preview ? { x: 0, y: 0, width, height } : {
        x: Math.min(rect.x, width), y: Math.min(rect.y, height),
        width: Math.max(1, Math.min(rect.width, width - rect.x)),
        height: Math.max(1, Math.min(rect.height, height - rect.y)),
      };
      const before = view.getBounds();
      if (next.x !== before.x || next.y !== before.y || next.width !== before.width || next.height !== before.height) view.setBounds(next);
    }
    if (view.getVisible() !== visible) view.setVisible(visible);
  }
  pauseScene?.sync();
}

function activate(id) {
  if (immersive() && tabs.get(id)?.kind !== 'player') exitFullscreen();
  if (active !== id) closeTrailerPreview();
  clearPausedFrame(tabs.get(active));
  active = id; layout(); emit();
  schedulePauseProbe(tabs.get(id));
}

function providerHost(provider) {
  return ['alloha', 'turbo', 'veoveo'].includes(provider?.name.toLowerCase()) ? `${SOURCE}/` : '';
}

function remoteTab({ title, url, kind = 'site', movie = null, providers = [], embedTrailer = true, previewRect }) {
  const id = `tab-${nextTab++}`;
  const hostUrl = kind === 'trailer' && embedTrailer ? `${SOURCE}/` : kind === 'player' ? providerHost(providers[0]) : '';
  const t = { id, title, url, hostUrl, targetUrl: url, kind, movie, providers, provider: 0, translation: -1, error: '', blocked: 0, recoveryAttempts: 0 };
  if (previewRect) { t.preview = true; t.previewOwner = active; t.previewRect = previewRect; }
  tabs.set(id, t);
  attachRemoteView(t);
  if (t.preview) layout(); else activate(id);
  loadRemote(t);
  return id;
}

function loadRemote(t) {
  const wc = t.view.webContents;
  if (t.hostUrl && wc.getURL() === t.hostUrl && !wc.isLoadingMainFrame()) {
    mountHostedEmbed(t, wc);
    return;
  }
  wc.loadURL(t.hostUrl || t.targetUrl, t.hostUrl ? undefined : t.kind === 'player' ? { httpReferrer: SOURCE + '/' } : undefined).catch(() => {});
}

function mountHostedEmbed(tab, wc) {
  // The source homepage supplies the iframe origin when individual movie routes
  // are unavailable. Providers such as Alloha require that browser context.
  wc.executeJavaScript(`(() => {
    if (location.href !== ${JSON.stringify(tab.hostUrl)}) return;
    const url = ${JSON.stringify(tab.targetUrl)};
    const existing = document.getElementById('kadr-player-frame');
    if (existing) { if (existing.src !== url) existing.src = url; return; }
    const frame = document.createElement('iframe'); frame.id = 'kadr-player-frame';
    frame.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture'; frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin'; frame.src = url;
    const style = document.createElement('style'); style.textContent = 'html,body{margin:0!important;padding:0!important;overflow:hidden!important;background:#000!important;width:100%!important;height:100%!important}#kadr-player-frame{position:fixed!important;inset:0!important;width:100%!important;height:100%!important;border:0!important;z-index:2147483647!important;display:block!important}';
    document.head.appendChild(style); document.body.replaceChildren(frame);
  })()`).catch(() => {});
}

function rebuildRemote(t) {
  clearTimeout(t.recoveryTimer);
  if (tabs.get(t.id) !== t || !win || win.isDestroyed()) return;
  clearPausedFrame(t);
  const old = t.view;
  t.recovering = false; t.error = ''; t.playback = null; t.probedAt = 0;
  // Detach listeners before closing: a late event from the old renderer must
  // never change the replacement tab or spend another recovery attempt.
  old.webContents.removeAllListeners();
  win.contentView.removeChildView(old);
  if (!old.webContents.isDestroyed()) old.webContents.close();
  attachRemoteView(t); layout(); emit(); loadRemote(t);
}

let diagnosticQueue = Promise.resolve();
function recordRendererExit(t, details) {
  const entry = { at: new Date().toISOString(), version: app.getVersion(), tab: t.id,
    movieId: t.movie?.id, provider: t.providers[t.provider]?.name,
    reason: details.reason, exitCode: details.exitCode, attempt: t.recoveryAttempts,
    playback: t.playback || null };
  diagnosticQueue = diagnosticQueue.catch(() => {}).then(async () => {
    const file = path.join(app.getPath('userData'), 'renderer-exits.jsonl');
    const previous = await fs.readFile(file, 'utf8').catch(() => '');
    await fs.writeFile(file, [...previous.trim().split('\n').filter(Boolean).slice(-99), JSON.stringify(entry)].join('\n') + '\n');
  }).catch(() => {});
}

function attachRemoteView(t) {
  const { id, kind } = t;
  const view = new WebContentsView({ webPreferences: {
    preload: path.join(__dirname, 'player-preload.cjs'),
    partition: 'persist:kadr-sites', sandbox: true, contextIsolation: true,
    nodeIntegration: false, webSecurity: true, allowRunningInsecureContent: false,
    disableHtmlFullscreenWindowResize: true,
    autoplayPolicy: 'document-user-activation-required',
  } });
  view.setBackgroundColor('#0b0b0d');
  t.view = view;
  win.contentView.addChildView(view);
  const wc = view.webContents;
  if (kind === 'player') wc.setZoomMode('disabled');
  wc.on('before-mouse-event', (event, input) => {
    if (input.type === 'mouseDown') nativeMenus?.close(null, false);
    if (kind !== 'player' || active !== id || concealed || !['mouseDown', 'mouseUp'].includes(input.type) ||
        !isPlayerDoubleClick(input, view.getBounds())) return;
    event.preventDefault();
    if (input.type === 'mouseDown') toggleFullscreen();
  });
  // Keep the renderer's UA and the network UA identical and ASCII-only.
  // Embedded CDN requests failed with the original app UA and succeeded
  // with a browser-compatible UA in the playback integration check.
  wc.setUserAgent(session.fromPartition('persist:kadr-sites').getUserAgent());
  const notify = () => { if (tabs.has(id)) emit(); };
  wc.on('did-start-loading', () => { t.error = ''; notify(); });
  wc.on('did-stop-loading', notify);
  wc.on('did-navigate', notify);
  wc.on('did-navigate-in-page', notify);
  wc.on('dom-ready', () => {
    if (t.hostUrl && wc.getURL() === t.hostUrl) mountHostedEmbed(t, wc);
  });
  wc.on('enter-html-full-screen', () => { t.htmlFullscreen = true; if (active === id) enterFullscreen(); });
  wc.on('leave-html-full-screen', () => { t.htmlFullscreen = false; if (active === id && !fullscreenExit) exitFullscreen(); });
  wc.on('did-start-navigation', (_event, _url, inPlace, isMainFrame) => {
    if (isMainFrame) {
      t.blocked = 0;
      if (!inPlace) clearPausedFrame(t);
    }
  });
  if (kind === 'player') {
    wc.on('media-paused', () => schedulePauseProbe(t));
    wc.on('media-started-playing', () => { clearPausedFrame(t); schedulePauseProbe(t); });
  }
  wc.on('did-frame-finish-load', (_event, _main, processId, routingId) => {
    try {
      const frame = webFrameMain.fromId(processId, routingId);
      if (!frame) return;
      const css = adblock.stylesheet(frame.url);
      if (css) frame.executeJavaScript(`(() => { let s = document.getElementById('kadr-adblock-style'); if (!s) { s = document.createElement('style'); s.id = 'kadr-adblock-style'; document.documentElement.appendChild(s); } s.textContent = ${JSON.stringify(css)}; })()`).catch(() => {});
    } catch {}
  });
  wc.on('page-title-updated', (_, value) => { if (kind !== 'player') t.title = value.slice(0, 100); notify(); });
  wc.on('did-fail-load', (_, code, description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) { t.error = `Страница не загрузилась (${description}). Попробуйте другой плеер или обновите страницу.`; notify(); }
  });
  wc.on('render-process-gone', (_event, details) => {
    if (tabs.get(id) !== t || t.view !== view) return;
    clearPausedFrame(t);
    recordRendererExit(t, details);
    if (active === id && immersive()) exitFullscreen();
    t.playback = null;
    const reason = details.reason === 'oom' ? 'Плееру не хватило памяти.' : 'Процесс плеера завершился.';
    if (kind === 'player' && t.recoveryAttempts < 1) {
      t.recoveryAttempts++; t.recovering = true;
      t.error = `${reason} Восстанавливаем вкладку…`;
      // Reloading synchronously inside render-process-gone can crash Electron.
      t.recoveryTimer = setTimeout(() => rebuildRemote(t), 750);
    } else t.error = `${reason} Нажмите «Повторить» или выберите другой плеер.`;
    notify();
  });
  wc.on('will-navigate', (event, target) => { try { webUrl(target); } catch { event.preventDefault(); } });
  wc.on('will-redirect', (event, target) => { try { webUrl(target); } catch { event.preventDefault(); } });
  wc.setWindowOpenHandler(({ url: target }) => {
    // A link from a site remains an isolated site tab; player popups are not opened.
    if (adblock.shouldBlock(target, 'subFrame', wc.getURL())) { t.blocked++; return { action: 'deny' }; }
    if (kind !== 'player' && tabs.size < 10) {
      try { const valid = webUrl(target); setImmediate(() => remoteTab({ title: new URL(valid).hostname, url: valid })); } catch {}
    }
    return { action: 'deny' };
  });
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { event.preventDefault(); if(!input.isAutoRepeat)toggleFullscreen(); }
    if ((input.key === 'Escape' || input.code === 'Escape') && (win.isFullScreen() || t.htmlFullscreen)) { event.preventDefault(); exitFullscreen(); }
    if (kind === 'trailer' && (input.code === 'KeyF' || input.key.toLowerCase() === 'f') && !input.control && !input.alt && !input.meta && (win.isFullScreen() || t.htmlFullscreen)) { event.preventDefault(); exitFullscreen(); }
    if (input.control && input.key.toLowerCase() === 'l') { event.preventDefault(); win.webContents.focus(); win.webContents.send('kadr:focus-search'); }
  });
  if(kind==='player')bindPlayerFullscreenKey(wc,{toggle:toggleFullscreen,isCurrent:()=>active===id&&tabs.get(id)===t&&t.view===view});
}

function closeTab(id) {
  const t = tabs.get(id);
  if (!t) return;
  clearPausedFrame(t);
  clearTimeout(t.warningTimer);
  if (active === id) closeTrailerPreview();
  clearTimeout(t.recoveryTimer);
  if (active === id && immersive()) exitFullscreen();
  tabs.delete(id);
  if (active === id) active = null;
  win.contentView.removeChildView(t.view);
  if (!t.view.webContents.isDestroyed()) t.view.webContents.close();
  layout(); emit();
}

function closeTrailerPreview() {
  previewRevision++;
  for (const tab of tabs.values()) if (tab.preview) closeTab(tab.id);
}

function previewBounds(rect) {
  if (!rect || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(rect[key]) && rect[key] >= 0 && rect[key] < 20000)) return null;
  return Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, Math.round(rect[key])]));
}

function trustedSender(event) {
  return win && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame && event.senderFrame.url.split('?')[0] === pathToFileURL(localPage).href;
}
function handle(name, fn) {
  ipcMain.handle(`kadr:${name}`, async (event, ...args) => {
    if (!trustedSender(event)) throw new Error('Недоступно для сайтов');
    try { return { ok: true, data: await fn(...args) }; }
    catch (e) { return { ok: false, error: uiText(e.message || 'Не удалось выполнить действие') }; }
  });
}

function registerHandlers() {
  handle('menu-open', model => nativeMenus.open(model));
  handle('menu-update', model => nativeMenus.update(model));
  handle('menu-close', id => {if(typeof id==='string')nativeMenus.close(id,false)});
  handle('menu-focus', (id,edge) => {if(typeof id==='string'&&['first','last'].includes(edge))nativeMenus.focus(id,edge)});
  const posterStatus=createPosterStatus(async url=>{const response=await chromiumFetch(url,{signal:AbortSignal.timeout(6000)});return response.ok?Buffer.from(await response.arrayBuffer()):null});
  handle('poster-status',posterStatus);
  const upcoming = createUpcoming(async url => {
    const response = await chromiumFetch(url, { signal: AbortSignal.timeout(25000), headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'KadrDesktop/0.6.0 (film release calendar)' } });
    if (!response.ok) throw new Error(`Календарь премьер временно недоступен (${response.status})`);
    return response.text();
  }, {
    preferRest: true,
    read: async () => { try { return JSON.parse(await fs.readFile(path.join(app.getPath('userData'),'premieres.json'),'utf8')); } catch { try { return JSON.parse(await fs.readFile(path.join(__dirname,'premieres-seed.json'),'utf8')); } catch { return null; } } },
    write: value => fs.writeFile(path.join(app.getPath('userData'),'premieres.json'),JSON.stringify(value)).catch(()=>{})
  });
  handle('upcoming', upcoming);
  handle('state', () => snapshot());
  handle('update-status', () => appUpdates?.state ?? { phase: 'idle' });
  handle('check-update', () => { void appUpdates?.check(); });
  handle('apply-update', async () => {
    await Promise.all([writeQueue, languageWrite, appearanceStore?.flush()]);
    await appUpdates?.apply();
  });
  handle('language', async value => {
    if (!['system', 'ru', 'en'].includes(value)) throw new Error('Неизвестный язык');
    const write = languageWrite.then(async () => {
      if (value !== languageMode) {
        const file = path.join(app.getPath('userData'), 'language.json');
        await fs.writeFile(file + '.tmp', JSON.stringify(value), 'utf8');
        await fs.rename(file + '.tmp', file);
        languageMode = value;
      }
      language = resolveLanguage(languageMode, app.getPreferredSystemLanguages());
      return language;
    });
    languageWrite = write.catch(() => {});
    return write;
  });
  handle('catalog', catalog);
  handle('search', searchCatalog);
  handle('scene', async () => {
    const tab = tabs.get(active);
    if (tab?.kind !== 'player') return null;
    const facts = await videoFacts(tab.view.webContents).catch(() => null);
    if (!facts || tab.id !== active || facts.duration <= 600) return null;
    return { time: facts.time, actors: facts.scene.actors, music: facts.scene.music };
  });
  handle('finish-series', async input => {
    const item = state.history.find(movie => movie.id === movieId(input) && movie.type === 'series');
    if (!item) return;
    item.completed = true;
    await save(); emit();
  });
  const creditCache = new Map();
  handle('cast-credits', async input => {
    const id = movieId(input);
    if (creditCache.has(id)) return creditCache.get(id);
    const response = await chromiumFetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(castQuery(id))}`, {
      headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'NOVA (https://github.com/DeLorean-bot/NOVA)' },
      signal: AbortSignal.timeout(6500),
    });
    if (!response.ok) return [];
    const result = castCredits(await response.json());
    if (creditCache.size >= 32) creditCache.delete(creditCache.keys().next().value);
    creditCache.set(id, result);
    return result;
  });
  handle('browse', sourceBrowse);
  handle('recommendations', async refresh => ({ ...await recommendationCandidates(refresh), seen: state.taste.seen }));
  const feedbackUndo=new Map();let feedbackSequence=0;
  const opinion=id=>state.taste.liked.some(m=>m.id===id)?'like':state.taste.disliked.some(m=>m.id===id)?'dislike':state.taste.hidden.some(m=>m.id===id)?'hide':'reset';
  const feedback=(movie,message,undoToken)=>{if(win&&!win.isDestroyed())win.webContents.send('kadr:feedback',{id:String(++feedbackSequence),movie,message,undoToken})};
  const rate = async (input, action) => {
    const movie = cleanMovie(input),previous=opinion(movie.id);rateMovie(state.taste,movie,action);const next=opinion(movie.id);
    await save();emit();
    const token=`${Date.now()}-${feedbackSequence+1}`;feedbackUndo.set(token,{movie,previous,next});while(feedbackUndo.size>20)feedbackUndo.delete(feedbackUndo.keys().next().value);
    feedback(movie,next==='like'?'Будем рекомендовать больше похожего':next==='dislike'?'Будем рекомендовать меньше похожего':next==='hide'?'Больше не появится в рекомендациях':'Оценка отменена',token);
  };
  handle('rate-movie', rate);
  handle('undo-feedback',async token=>{
    const entry=feedbackUndo.get(token);if(!entry)return;feedbackUndo.delete(token);if(opinion(entry.movie.id)!==entry.next)return;
    rateMovie(state.taste,entry.movie,'reset');if(entry.previous!=='reset')rateMovie(state.taste,entry.movie,entry.previous);await save();emit();feedback(entry.movie,'Оценка отменена');
  });
  handle('taste-genres', async (genres, blockedGenres) => {
    if (![genres,blockedGenres].every(a=>Array.isArray(a)&&a.length<=GENRES.length&&a.every(g=>GENRES.includes(g)))) throw new Error('Некорректный выбор жанров');
    state.taste = cleanTaste({...state.taste,genres,blockedGenres},cleanMovie); await save(); emit();
  });
  handle('recommendations-seen', async ids => {
    if(!Array.isArray(ids)||ids.length>25||!ids.every(id=>Number.isSafeInteger(id)&&id>0))return;
    const next=[...new Set([...state.taste.seen.filter(id=>!ids.includes(id)),...ids])].slice(-150);
    if(JSON.stringify(next)===JSON.stringify(state.taste.seen))return;
    state.taste.seen=next;await save();emit();
  });
  handle('film-menu', input => {
    const movie=cleanMovie(input),taste=state.taste;
    const menu=Menu.buildFromTemplate([
      {label:uiText('Нравится'),type:'checkbox',checked:taste.liked.some(m=>m.id===movie.id),click:()=>rate(movie,'like').catch(()=>{})},
      {label:uiText('Не нравится'),type:'checkbox',checked:taste.disliked.some(m=>m.id===movie.id),click:()=>rate(movie,'dislike').catch(()=>{})},
      {label:uiText('Больше не предлагать'),type:'checkbox',checked:taste.hidden.some(m=>m.id===movie.id),click:()=>rate(movie,'hide').catch(()=>{})},
      {type:'separator'},
      {label:uiText('Сбросить оценку'),enabled:[...taste.liked,...taste.disliked,...taste.hidden].some(m=>m.id===movie.id),click:()=>rate(movie,'reset').catch(()=>{})}
    ]);menu.popup({window:win});
  });
  handle('details', async input => {
    const movie = cleanMovie(input);
    let result;try { result = (await sourceSearch(String(movie.id))).movies[0]; } catch(error) { if(movie.description)return movie;throw error; }
    if (!result) return movie;
    return { ...movie, ...result, cover: movie.cover || knownMovies.get(movie.id)?.cover || '' };
  });
  handle('ratings', (imdbId, type) => ratingsFor(String(imdbId), type));
  handle('community-top', async () => {
    const ratings = await community.top();
    if (!ratings.length) return [];
    const blocked = await restrictions();
    const entries = await Promise.all(ratings.filter(({ id }) => !blocked.has(id)).map(async rating => {
      const movie = knownMovies.get(rating.id) || state.scores[rating.id]?.movie ||
        (await sourceSearch(String(rating.id)).catch(() => null))?.movies.find(movie => movie.id === rating.id);
      return movie ? { movie, rating } : null;
    }));
    return entries.filter(Boolean);
  });
  handle('community-rating', id => community.rating(movieId(id)));
  handle('community-consent', consent => community.setConsent(consent));
  handle('community-dismiss-invitation', () => community.dismissInvitation());
  handle('community-reconnect', connectCommunity);
  handle('score-title', async (value, score) => {
    const id = movieId(value);
    if (score === null) delete state.scores[id];
    else {
      if (!Number.isInteger(score) || score < 1 || score > 10) throw new Error('Оценка должна быть от 1 до 10');
      const movie = state.scores[id]?.movie || knownMovies.get(id) || state.history.find(movie => movie.id === id) ||
        state.favorites.find(movie => movie.id === id) || state.releases.find(movie => movie.id === id);
      if (!movie) throw new Error('Фильм не найден');
      state.scores[id] = { movie: cleanMovie(movie), value: score };
    }
    await save(); emit();
    void community.changed().catch(() => {});
  });
  handle('trailer-preview', async (input, rect) => {
    const owner = tabs.get(active);
    closeTrailerPreview();
    if (!input) return null;
    const bounds = previewBounds(rect);
    if (!bounds || owner?.kind !== 'player') return null;
    const revision = previewRevision;
    let movie = cleanMovie(input);
    const known = knownMovies.get(movie.id);
    if (known) movie = { ...movie, ...known };
    if (!movie.trailer) {
      const result = await sourceSearch(String(movie.id));
      movie = { ...movie, ...result.movies[0] };
    }
    if (revision !== previewRevision || owner.id !== active) return null;
    const destination = trailerDestination(movie);
    if (!destination.direct) throw new Error('У этого фильма нет встроенного трейлера.');
    await preparePlayerSession();
    if (revision !== previewRevision || owner.id !== active) return null;
    return remoteTab({ title: movie.title, url: destination.url, kind: 'trailer', movie, previewRect: bounds });
  });
  handle('trailer-preview-bounds', (id, rect) => {
    const tab = tabs.get(id);
    const bounds = previewBounds(rect);
    if (!tab?.preview || !bounds) return;
    tab.previewRect = bounds; layout();
  });
  handle('trailer', async input => {
    const id = movieId(typeof input==='object'?input?.id:input);
    let movie={...(typeof input==='object'?cleanMovie(input):knownMovies.get(id)||{id,title:`Фильм ${id}`,type:'film'})};
    // Metadata may already be available, so opening a trailer need not wait for another search.
    const known=knownMovies.get(id);if(known)movie={...movie,...known};
    const destination=trailerDestination(movie);
    await preparePlayerSession();
    const existing = [...tabs.values()].find(t => t.kind === 'trailer');
    if (existing) closeTab(existing.id);
    if (tabs.size >= 10) throw new Error('Закройте одну из вкладок');
    return remoteTab({ title: `${destination.direct?'Трейлер':'Трейлеры'} · ${movie.title}`, url: destination.url, kind: 'trailer', movie, embedTrailer:destination.direct });
  });
  handle('open', async value => {
    const url = webUrl(value);
    await preparePlayerSession();
    const existing = [...tabs.values()].find(t => t.url === url);
    if (existing) { activate(existing.id); return existing.id; }
    if (tabs.size >= 10) throw new Error('Открыто 10 вкладок. Закройте одну из них.');
    return remoteTab({ title: new URL(url).hostname, url });
  });
  handle('home', () => { activate(null); });
  handle('tab', id => { if (!tabs.has(id)) throw new Error('Вкладка закрыта'); activate(id); });
  handle('close-tab', closeTab);
  handle('bounds', rect => {
    if (!rect || !['x', 'y', 'width', 'height'].every(k => Number.isFinite(rect[k]) && rect[k] >= 0 && rect[k] < 20000)) return;
    if (immersive()) { layout(); return; }
    // A late fullscreen ResizeObserver result must not replace the normal
    // rectangle after native fullscreen has already ended.
    // Full-width workspace starts below the permanent header.
    const next = normalViewBounds(rect);
    if (!next) return;
    viewRect = next; layout();
  });
  handle('conceal', async value => {
    if(value)nativeMenus?.close(null,false);
    const revision = ++concealRevision;
    let poster = null;
    const current = tabs.get(active);
    if (value && current && !concealed) { try { poster = (await current.view.webContents.capturePage()).toDataURL(); } catch {} }
    if (revision !== concealRevision) return null;
    concealed = Boolean(value);
    if (concealed) clearPausedFrame(tabs.get(active));
    else schedulePauseProbe(tabs.get(active));
    layout(); syncEscapeShortcut();
    if (concealed && win && !win.isDestroyed()) win.webContents.focus();
    return poster;
  });
  handle('navigate', (action, address) => {
    if (action === 'external-url') return shell.openExternal(webUrl(address));
    const t = tabs.get(active); if (!t) return;
    const wc = t.view.webContents;
    if (action === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    if (action === 'forward' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
    if (action === 'reload') {
      t.recoveryAttempts = 0;
      if (t.recovering || wc.isCrashed()) rebuildRemote(t);
      else { t.error = ''; wc.reload(); }
    }
    if (action === 'address') { t.error = ''; return wc.loadURL(webUrl(address)).catch(() => {}); }
    if (action === 'external') {
      const destination = t.kind === 'player' && t.hostUrl && t.movie
        ? `${SOURCE}/${t.movie.type}/${t.movie.id}/`
        : wc.getURL() || t.url;
      return shell.openExternal(webUrl(destination));
    }
  });
  handle('watch', async input => {
    let movie = cleanMovie(input);
    const known = knownMovies.get(movie.id);
    if (known) movie = { ...movie, ...known, age: known.age || movie.age,
      contentWarnings: known.contentWarnings?.length ? known.contentWarnings : movie.contentWarnings };
    if (!movie.poster || /^Кинопоиск · |^Фильм \d+$/.test(movie.title)) {
      try { movie = (await sourceSearch(String(movie.id))).movies[0] || movie; } catch {}
    }
    const providers = [...await playersFor(movie.id)];
    if (!providers.length) throw new Error('Источник пока не нашёл плеер. Добавьте фильм в «Ожидаю», чтобы узнать о появлении.');
    await preparePlayerSession();
    const preferred = providers.findIndex(p => p.name.toLowerCase() === state.preferredProvider?.toLowerCase());
    const initial = preferred >= 0 ? preferred : providers.findIndex(p => p.name.toLowerCase() === 'collaps');
    if (initial > 0) providers.unshift(providers.splice(initial, 1)[0]);
    const previous = [...tabs.values()].find(t => t.kind === 'player');
    if (previous) closeTab(previous.id);
    if (tabs.size >= 10) throw new Error('Открыто 10 вкладок. Закройте одну из них.');
    const id = remoteTab({ title: movie.title, url: providers[0].url, kind: 'player', movie, providers });
    const old = state.history.find(m => m.id === movie.id);
    state.history = [{ ...old, ...movie, watchedSeconds: old?.watchedSeconds || 0, openedAt: new Date().toISOString() }, ...state.history.filter(m => m.id !== movie.id)].slice(0, 80);
    emit();
    void save().catch(error => console.error('Could not save viewing history:', error.message));
    return id;
  });
  handle('provider', (provider, translation) => {
    const t = tabs.get(active);
    if (!t || t.kind !== 'player' || !Number.isInteger(provider) || !t.providers[provider]) throw new Error('Плеер не найден');
    const p = t.providers[provider];
    if (!Number.isInteger(translation) || translation < -1 || translation >= p.translations.length) throw new Error('Озвучка не найдена');
    clearPausedFrame(t);
    clearTimeout(t.recoveryTimer); t.recoveryAttempts = 0;
    t.provider = provider; t.translation = translation; t.error = ''; t.playback = null; t.probedAt = 0;
    const url = translation === -1 ? p.url : p.translations[translation].url;
    t.targetUrl = url;
    t.hostUrl = providerHost(p);
    state.preferredProvider = p.name;
    save().catch(() => {});
    const wc = t.view.webContents;
    if (t.recovering || wc.isCrashed()) { rebuildRemote(t); return; }
    loadRemote(t);
    emit();
  });
  handle('favorite', async input => {
    const movie = cleanMovie(input);
    if (state.favorites.some(m => m.id === movie.id)) state.favorites = state.favorites.filter(m => m.id !== movie.id);
    else { if (state.favorites.length >= 500) throw new Error('В коллекции уже 500 фильмов'); state.favorites.unshift(movie); }
    await save(); emit();feedback(movie,state.favorites.some(m=>m.id===movie.id)?'Добавлено в коллекцию':'Убрано из коллекции');
  });
  handle('add-site', async (name, value) => {
    const url = webUrl(value);
    if (state.sites.length >= 20) throw new Error('Можно сохранить до 20 сайтов');
    if (state.sites.some(s => s.url === url)) throw new Error('Этот сайт уже добавлен');
    state.sites.push({ id: `site-${Date.now()}`, name: String(name || '').trim().slice(0, 50) || new URL(url).hostname, url });
    await save(); emit();
  });
  handle('remove-site', async id => { state.sites = state.sites.filter(s => s.id !== id); await save(); emit(); });
  handle('clear-history', async () => { state.history = []; await save(); emit(); });
  handle('follow-release', async input => {
    let movie = cleanMovie(input);
    if (state.releases.some(m => m.id === movie.id)) return;
    if (state.releases.length >= 50) throw new Error('В ожидании уже 50 названий');
    try { movie = { ...movie, ...(await sourceSearch(String(movie.id))).movies[0] }; } catch {}
    state.releases.unshift({ ...movie, addedAt: new Date().toISOString(), available: null, unread: false });
    await save(); emit(); feedback(movie,'Сообщим, когда появится плеер');checkReleases().catch(() => {});
  });
  handle('unfollow-release', async id => { const key=movieId(id),movie=state.releases.find(m=>m.id===key);state.releases = state.releases.filter(m => m.id !== key); await save(); emit();if(movie)feedback(movie,'Больше не отслеживаем'); });
  handle('check-releases', async () => { await checkReleases(true); return snapshot(); });
  handle('dismiss-release-notices', async ids => { state.releases = dismissReleaseNotices(state.releases, ids); await save(); emit(); });
  handle('read-releases', async id => {
    const key = id === undefined ? undefined : movieId(id);
    let changed = false;
    for (const item of state.releases) {
      if (item.unread && (key === undefined || key === item.id)) {
        item.unread = false;
        changed = true;
      }
    }
    if (changed) { await save(); emit(); }
  });
  handle('profile', async patch => {
    const previous = state.profile;
    state.profile = patchProfile(previous, patch, nativeImage.createFromDataURL);
    try { await save(); } catch (error) { state.profile = previous; throw error; }
    emit();
  });
  handle('theme', async theme => {
    if (!['light', 'dark'].includes(theme)) throw new Error('Неизвестная тема');
    await appearanceStore.set('theme', theme);
  });
  handle('motion', async enabled => {
    if (typeof enabled !== 'boolean') throw new Error('Некорректное состояние анимаций');
    await appearanceStore.set('motion', enabled);
  });
  handle('glass-background', async enabled => {
    if (typeof enabled !== 'boolean') throw new Error('Некорректная настройка фона');
    await appearanceStore.set('glassBackground', enabled);
  });
  handle('sidebar', async collapsed => {
    if (typeof collapsed !== 'boolean') throw new Error('Некорректный режим панели');
    state.sidebarCollapsed = collapsed; await save(); emit();
  });
  handle('window', action => {
    if (action === 'minimize') win.minimize();
    if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
    if (action === 'close') win.close();
    if (action === 'fullscreen') toggleFullscreen();
  });
}

function preparePlayerSession() {
  if (playerSessionReady) return playerSessionReady;
  const filtersDir = path.join(app.getPath('userData'), 'filters');
  playerSessionReady = adblock.initialize(filtersDir).then(() => {
    const playerSession = session.fromPartition('persist:kadr-sites');
    playerSession.setUserAgent(app.userAgentFallback);
    playerSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
      const tab = [...tabs.values()].find(t => t.view.webContents.id === details.webContentsId);
      if (!tab) { callback({ cancel: false }); return; }
      const documentUrl = details.frame?.url || details.referrer || tab.view.webContents.getURL() || tab.url;
      const blocked = adblock.shouldBlock(details.url, details.resourceType, documentUrl);
      callback({ cancel: blocked });
      if (blocked) tab.blocked++;
    });
    playerSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'fullscreen'));
    playerSession.setPermissionCheckHandler((_wc, permission) => permission === 'fullscreen');
    playerSession.on('will-download', event => event.preventDefault());
    adblock.update(filtersDir).catch(() => {});
  }).catch(error => {
    playerSessionReady = undefined;
    throw error;
  });
  return playerSessionReady;
}

async function createWindow() {
  if (process.platform === 'win32') app.setAppUserModelId('local.kadr.desktop');
  dataFile = path.join(app.getPath('userData'), 'library.json');
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  try {
    const saved = JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'language.json'), 'utf8'));
    if (saved === 'ru' || saved === 'en') languageMode = saved;
  } catch {}
  const communityFile = path.join(app.getPath('userData'), 'community.json');
  community = createCommunity({ origin: process.env.NOVA_COMMUNITY_URL || require('../package.json').novaCommunityUrl,
    scores: () => state.scores, fetch: chromiumFetch, publish: emit, storage: {
      read: async () => { try { return JSON.parse(await fs.readFile(communityFile, 'utf8')); } catch { return null; } },
      write: async value => {
        await fs.writeFile(communityFile + '.tmp', JSON.stringify(value), 'utf8');
        await fs.rename(communityFile + '.tmp', communityFile);
      },
    },
  });
  language = resolveLanguage(languageMode, app.getPreferredSystemLanguages());
  try {
    const saved = JSON.parse(await fs.readFile(dataFile, 'utf8'));
    state.profile = readProfile(saved.profile, nativeImage.createFromDataURL);
    state.theme = saved.theme === 'dark' ? 'dark' : 'light';
    state.motion = saved.motion !== false;
    state.glassBackground = saved.glassBackground !== false;
    state.taste = cleanTaste(saved.taste,cleanMovie);
    state.scores = Object.fromEntries(Object.values(saved.scores || {}).flatMap(score => {
      if (!Number.isInteger(score?.value) || score.value < 1 || score.value > 10) return [];
      try { const movie = cleanMovie(score.movie); return [[movie.id, { movie, value: score.value }]]; } catch { return []; }
    }));
    state.sidebarCollapsed = saved.sidebarCollapsed === true;
    state.preferredProvider = typeof saved.preferredProvider === 'string' ? saved.preferredProvider.slice(0, 100) : '';
    state.favorites = (saved.favorites || []).flatMap(m => { try { return [cleanMovie(m)]; } catch { return []; } });
    state.history = (saved.history || []).flatMap(m => { try { return [{ ...cleanMovie(m), openedAt: String(m.openedAt || ''), watchedSeconds: Math.max(0, Math.min(1e8, Number(m.watchedSeconds) || 0)), lastWatchedAt: String(m.lastWatchedAt || ''), watchedDuration: Number(m.watchedDuration) > 600 && Number(m.watchedDuration) < 200000 ? Number(m.watchedDuration) : undefined, watchedRanges: (Array.isArray(m.watchedRanges) ? m.watchedRanges : []).filter(r => Array.isArray(r) && r.length === 2 && r.every(Number.isFinite) && r[0] >= 0 && r[1] > r[0] && r[1] < 200000).slice(-300), completed: m.completed === true }]; } catch { return []; } }).slice(0, 80);
    state.releases = (saved.releases || []).flatMap(m => { try { return [{ ...cleanMovie(m), addedAt: String(m.addedAt || ''), available: typeof m.available === 'boolean' ? m.available : null, checkedAt: String(m.checkedAt || ''), availableAt: String(m.availableAt || ''), unread: m.unread === true, noticeDismissed: m.noticeDismissed === true }]; } catch { return []; } }).slice(0, 50);
    state.sites = (saved.sites || []).flatMap(s => { try { return [{ id: String(s.id), name: String(s.name).slice(0, 50), url: webUrl(s.url) }]; } catch { return []; } }).slice(0, 20);
  } catch {}
  await community.load().catch(() => {});
  try {
    const cache = JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'restrictions.json'), 'utf8'));
    if (Array.isArray(cache.ids) && Number.isFinite(cache.at)) { blacklist = new Set(cache.ids); blacklistTime = cache.at; }
  } catch {}
  const browserUserAgent = app.userAgentFallback.replace(/\s(?:Electron|Кадр|Kadr|kadr-desktop|NOVA)\/[^\s]+/gi, '');
  // Cross-origin iframe JS uses app.userAgentFallback even when the parent
  // webContents and HTTP session override their UA. Alloha signs its movie
  // request using navigator.userAgent, so these must match in every frame.
  app.userAgentFallback = browserUserAgent;
  session.defaultSession.setUserAgent(browserUserAgent);
  // The user currently wants isolated tests on the primary monitor. Set the
  // position before showing the first frame; never move their running app.
  appearanceStore = createAppearanceStore(app.getPath('userData'), (appearance, key) => {
    Object.assign(state, appearance);
    if (key !== 'theme' || !win || win.isDestroyed()) return;
    const light = appearance.theme === 'light';
    const color = light ? '#ffffff' : '#0b0b0d';
    win.setBackgroundColor(color);
    win.setTitleBarOverlay({ color, symbolColor: light ? '#252623' : '#f3f1ed', height: 32 });
  });
  Object.assign(state, await appearanceStore.load(state));
  const testDisplay=testProfile&&screen.getPrimaryDisplay();
  const testPosition=testDisplay?{x:testDisplay.workArea.x+Math.max(0,Math.floor((testDisplay.workArea.width-1440)/2)),y:testDisplay.workArea.y+Math.max(0,Math.floor((testDisplay.workArea.height-940)/2))}:{};
  win = new BrowserWindow({
    icon: windowIcon(),
    title: 'NOVA', width: 1440, height: 940, minWidth: 980, minHeight: 680,...testPosition,
    backgroundColor: state.theme === 'light' ? '#ffffff' : '#0b0b0d', roundedCorners: true, show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: state.theme === 'light' ? '#ffffff' : '#0b0b0d', symbolColor: state.theme === 'light' ? '#252623' : '#f3f1ed', height: 32 },
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false, disableHtmlFullscreenWindowResize: true, additionalArguments: [`--kadr-language=${language}`, `--kadr-language-mode=${languageMode}`, `--kadr-theme=${state.theme}`, `--kadr-motion=${state.motion ? 'on' : 'off'}`, `--kadr-glass-background=${state.glassBackground ? 'on' : 'off'}`, `--kadr-sidebar=${state.sidebarCollapsed ? 'compact' : 'full'}`] },
  });
  if (process.platform === 'win32') {
    const window = win;
    let currentIcon = windowIcon();
    const syncIcon = () => {
      const nextIcon = windowIcon();
      if (window.isDestroyed() || nextIcon === currentIcon) return;
      window.setIcon(nextIcon);
      currentIcon = nextIcon;
    };
    nativeTheme.on('updated', syncIcon);
    window.once('closed', () => nativeTheme.removeListener('updated', syncIcon));
  }
  nativeMenus=createNativeMenus({BrowserWindow,ipcMain,parent:win,getState:()=>state,getView:()=>concealed?null:tabs.get(active)?.view,onCommand:command=>{if(command==='fullscreen')toggleFullscreen();else win.webContents.send('kadr:focus-search')}});
  pauseScene = createPauseScene({ BrowserWindow, parent: win, context: pauseSceneContext });
  Menu.setApplicationMenu(null);
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { event.preventDefault(); if(!input.isAutoRepeat)toggleFullscreen(); }
    if(input.type==='keyDown'&&input.key==='Escape'&&nativeMenus?.isOpen()){event.preventDefault();nativeMenus.close(null,true);return}
    if (input.type === 'keyDown' && (input.key === 'Escape' || input.code === 'Escape') && win.isFullScreen() && !concealed) { event.preventDefault(); exitFullscreen(); }
  });
  win.on('resize', layout);
  win.on('focus', syncEscapeShortcut);
  win.on('blur', syncEscapeShortcut);
  win.on('enter-full-screen', () => { syncEscapeShortcut(); layout(); emit(); });
  win.on('leave-full-screen', () => { syncEscapeShortcut(); if (!fullscreenExit && (fullscreenWanted || tabs.get(active)?.htmlFullscreen)) exitFullscreen(); else { layout(); emit(); } });
  win.on('closed', () => { nativeMenus?.dispose(); pauseScene?.dispose(); clearPausedFrame(); globalShortcut.unregister('Escape'); globalShortcut.unregister('F11'); for (const t of tabs.values()) if (!t.view.webContents.isDestroyed()) t.view.webContents.close(); tabs.clear(); win = null; });
  if (testProfile) win.showInactive();
  else win.show();
  if (!testProfile) {
    const installed = process.platform === 'win32' && app.isPackaged &&
      existsSync(path.join(path.dirname(process.execPath), 'Uninstall NOVA.exe'));
    appUpdates = createAppUpdates({
      updater: installed ? require('electron-updater').autoUpdater : null,
      lookup: () => checkForUpdate(chromiumFetch, app.getVersion()),
      isOnline: () => net.isOnline(),
      openExternal: url => shell.openExternal(url),
      publish: status => { if (win && !win.isDestroyed()) win.webContents.send('kadr:update-status', status); },
      announce: announceUpdate,
    });
    void appUpdates.check();
    updateTimer = setInterval(() => { void appUpdates.check(); }, 6 * 60 * 60 * 1000);
    updateTimer.unref();
  }
  await win.loadFile(localPage);
  if (!testProfile && !community.state.configured) {
    communityTimer = setInterval(connectCommunity, 10 * 60 * 1000);
    communityTimer.unref();
    connectCommunity();
  }
  playbackTimer = setInterval(pollPlayback, 4000); playbackTimer.unref();
  releasesTimer = setInterval(() => checkReleases().catch(() => {}), 30 * 60 * 1000); releasesTimer.unref();
  checkReleases().catch(() => {});
}

function announceUpdate(status) {
  desktopUpdateNotice?.close();
  desktopUpdateNotice = undefined;
  if (!win || win.isDestroyed() || (win.isFocused() && !immersive()) || !Notification.isSupported()) return;
  const ready = status.phase === 'ready';
  desktopUpdateNotice = new Notification({
    title: uiText(ready ? 'NOVA {0} готова к установке' : 'Доступна версия {0}', status.version),
    body: uiText(ready ? 'Откройте NOVA, чтобы обновиться и перезапустить приложение.'
      : status.phase === 'downloading' ? 'Скачиваем обновление в фоне.' : 'Откройте NOVA, чтобы перейти к релизу.'),
    icon: iconFile(),
    silent: true,
  });
  desktopUpdateNotice.on('click', () => {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.webContents.send('kadr:show-updates');
  });
  desktopUpdateNotice.show();
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
  });
  app.whenReady().then(async () => { registerHandlers(); await createWindow(); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', event => { clearInterval(playbackTimer); clearInterval(releasesTimer); clearInterval(updateTimer); clearInterval(communityTimer); appUpdates?.dispose(); community?.close(); if (writeQueue) { event.preventDefault(); const pending = save(); writeQueue = null; Promise.allSettled([pending, languageWrite, appearanceStore?.flush()]).then(() => app.quit()); } });
}
