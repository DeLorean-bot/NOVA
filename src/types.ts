import type { Language, LanguageMode } from './i18n'

export type UpdateStatus =
  | { phase: 'idle' | 'checking' | 'current' | 'error' }
  | { phase: 'external' | 'ready' | 'installing'; version: string }
  | { phase: 'downloading'; version: string; progress: number | null }

export type Movie = {
  id: number; type: 'film' | 'series'; title: string; original: string; year: number | null;
  poster: string; cover: string; rating: number | null; age: string; genres: string[]; description: string;
  openedAt?: string;
  premiereDate?: string; premiereSource?: string;
  available?: boolean | null;
  seasons?: number;
  watchedSeconds?: number; lastWatchedAt?: string;
  watchedRanges?: [number, number][]; watchedDuration?: number; completed?: boolean;
  imdbId?: string; imdbRating?: number | null; directors?: string; actors?: string;
  country?: string; runtime?: number | null; trailer?: string;
  contentWarnings?: string[];
}
export type TomatoRating = { url: string; rating: null | { score: number; sentiment: string; source: string; checkedAt: string } }
export type Release = Movie & { addedAt: string; available: boolean | null; checkedAt?: string; availableAt?: string; unread: boolean; noticeDismissed?: boolean; error?: string }
export type Playback = { width: number; height: number; time: number; duration: number | null; paused: boolean; ready: number; error: number | null; frames: number; dropped: number }
export type Provider = { name: string; translations: { name: string; quality: string }[] }
export type RemoteTab = {
  id: string; title: string; url: string; loading: boolean; canBack: boolean; canForward: boolean;
  error: string; detected: { type: 'film' | 'series'; id: number } | null; kind: 'site' | 'player' | 'trailer';
  movie: Movie | null; providers: Provider[]; provider: number; translation: number;
  adblock: { enabled: boolean; blocked: number };
  playback: Playback | null;
}
export type LocalProfile = { name: string; avatar: string }
export type MenuIconName = 'Play'|'Volume2'|'User'|'Palette'|'Settings'|'Info'|'RotateCw'|'ShieldCheck'|'Bell'|'Film'|'Tv'|'Clock3'|'X'
export type NativeMenuItem = { value:string;label:string;icon?:MenuIconName;checked?:boolean;disabled?:boolean;secondary?:string;time?:string;unread?:boolean;auxiliary?:{value:string;label:string} }
export type NativeMenuModel = { id:string;label:string;role:'menu'|'listbox';rect:{x:number;y:number;width:number;height:number};items:NativeMenuItem[];focus:'first'|'last'|null;title?:string;empty?:string;variant?:'notices';headerAction?:{value:string;label:string;disabled?:boolean} }
export type AppState = {
  profile: LocalProfile;
  favorites: Movie[]; history: Movie[]; releases: Release[]; sites: { id: string; name: string; url: string }[];
  tabs: RemoteTab[]; active: string | null; source: string;
  theme: 'light' | 'dark'; motion: boolean; glassBackground: boolean; sidebarCollapsed: boolean; immersive: boolean; fullscreen: boolean;
  taste: Taste;
  scores: Record<number, TitleScore>;
  community?: CommunityPreferences;
}
export type CommunityPreferences = {
  configured: boolean; consent: boolean | null; invited: boolean; pending: boolean;
  github?: { signedIn: boolean; login: { waiting?: boolean; code?: string; failed?: boolean } | null };
}
export type CommunityRating = { id: number; average: number; count: number }
export type CommunityTitle = { movie: Movie; rating: CommunityRating }
export type PlayerBounds = { x: number; y: number; width: number; height: number }
export type TitleScore = { movie: Movie; value: number }
export type Taste = { liked: Movie[]; disliked: Movie[]; hidden: Movie[]; genres: string[]; blockedGenres: string[]; seen: number[] }
export type FilmOpinion = 'like' | 'dislike' | 'hide' | 'reset'
export type FeedbackNotice = { id:string;movie:Movie;message:string;undoToken?:string }
export type Catalog = { movies: Movie[]; total: number; hasMore: boolean }
export type SearchPhase = 'catalog' | 'description' | 'reviews' | 'matching'
export type CastCredit = { name: string; titles: { id: number; title: string }[] }
export type API = {
  onMenuAction?(listener:(id:string,value:string)=>void):()=>void;
  openMenu?(model:NativeMenuModel):Promise<{value?:string;keyboard:boolean}>;updateMenu?(model:NativeMenuModel):Promise<void>;closeMenu?(id:string):Promise<void>;focusMenu?(id:string,edge:'first'|'last'):Promise<void>;
  initialTheme: 'light' | 'dark';
  initialLanguage?: Language;
  initialLanguageMode?: LanguageMode;
  initialMotion: boolean;
  initialGlassBackground: boolean;
  initialSidebarCollapsed: boolean;
  state(): Promise<AppState>; catalog(type: 'films' | 'series', page: number): Promise<Catalog>;
  updateStatus(): Promise<UpdateStatus>;
  checkUpdate(background?: boolean): Promise<void>;
  applyUpdate(): Promise<void>;
  onUpdateStatus(listener: (status: UpdateStatus) => void): () => void;
  onShowUpdates(listener: () => void): () => void;
  search(query: string, page?: number, requestId?: number): Promise<{ movies: Movie[]; nextPage: number | null }>;
  onSearchPhase(listener: (requestId: number, phase: SearchPhase) => void): () => void;
  episodeEnded(): Promise<boolean>;
  castCredits(id: number): Promise<CastCredit[]>;
  finishSeries(id: number): Promise<void>;
  onWatchFinished(listener: (movie: Movie) => void): () => void;
  browse(type: 'films' | 'series', page?: number, options?: { year?: number; minYear?: number; order?: 'date' | 'year' }): Promise<{ movies: Movie[]; nextPage: number | null }>;
  recommendations(refresh?: boolean): Promise<{ movies: Movie[]; added: number; hasMore: boolean; seen: number[] }>;
  rateMovie(movie: Movie, action: FilmOpinion): Promise<void>;
  undoFeedback(token:string): Promise<void>;
  posterStatus(id:number,size:'small'|'large'):Promise<{missing:boolean}>;
  onFeedback(listener:(notice:FeedbackNotice)=>void):()=>void;
  filmMenu(movie: Movie): Promise<void>;
  tasteGenres(genres: string[], blocked: string[]): Promise<void>;
  recommendationsSeen(ids: number[]): Promise<void>;
  upcoming(): Promise<Movie[]>;
  details(movie: Movie): Promise<Movie>; ratings(imdbId: string, type: 'film' | 'series'): Promise<TomatoRating>; trailer(movie: Movie | number): Promise<string>;
  trailerPreview(movie: Movie | null, rect?: PlayerBounds): Promise<string | null>;
  trailerPreviewBounds(id: string, rect: PlayerBounds): Promise<void>;
  scoreTitle(id: number, score: number | null): Promise<void>;
  communityTop(): Promise<CommunityTitle[]>;
  communityRating(id: number): Promise<CommunityRating | null>;
  setCommunityConsent(value: boolean): Promise<boolean>;
  copyCommunityGithubCode(): Promise<boolean>;
  openCommunityGithub(): Promise<void>;
  cancelCommunityGithub(): Promise<void>;
  reconnectCommunityGithub(): Promise<void>;
  onCommunitySharingEnabled(listener: () => void): () => void;
  dismissCommunityInvitation(): Promise<void>;
  reconnectCommunity(): Promise<void>;
  open(url: string): Promise<string>; home(): Promise<void>; tab(id: string): Promise<void>; closeTab(id: string): Promise<void>;
  bounds(rect: { x: number; y: number; width: number; height: number }): Promise<void>;
  conceal(value: boolean): Promise<string | null>; navigate(action: string, address?: string): Promise<void>; watch(movie: Movie): Promise<string>;
  provider(index: number, translation: number): Promise<void>; favorite(movie: Movie): Promise<void>;
  addSite(name: string, url: string): Promise<void>; removeSite(id: string): Promise<void>; clearHistory(): Promise<void>;
  followRelease(movie: Movie): Promise<void>; unfollowRelease(id: number): Promise<void>;
  checkReleases(): Promise<AppState>; readReleases(id?: number): Promise<void>; dismissReleaseNotices(ids: number[]): Promise<void>;
  updateProfile(patch: Partial<LocalProfile>): Promise<void>;
  theme(mode: 'light' | 'dark'): Promise<void>;
  language(value: LanguageMode): Promise<Language>;
  motion(enabled: boolean): Promise<void>;
  glassBackground(enabled: boolean): Promise<void>;
  sidebar(collapsed: boolean): Promise<void>;
  window(action: string): Promise<void>; onState(listener: (state: AppState) => void): () => void;
  onFocusSearch(listener: () => void): () => void;
  onShowReleases(listener: () => void): () => void;
}
declare global { interface Window { kadr?: API } }
