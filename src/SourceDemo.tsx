import { t } from './i18n'
import { Bookmark, Film, Play, Search, Tv } from './icons'
import { Badge } from './kit/controls/Badge'
import { Bar, Window } from './kit/window'
import { Collapse } from './kit/motion/Collapse'
import { Row } from './kit/parts/Row'
import { Stage } from './kit/stage'
import type { Act } from './kit/act'
import './source-demo.css'

// Adapted from Stageshow's dark-hero: a result arrives, then dependent rows
// unfold. This is an explanatory illustration, separate from the live catalog.
type Scene = { found: boolean; ready: boolean }
const initial: Scene = { found: false, ready: false }
async function script(a: Act<Scene>) {
  await a.wait(1200)
  a.mark('movie')
  await a.set({ found: true })
  await a.wait(2200)
  a.mark('players')
  await a.set({ ready: true })
  await a.wait(5000)
}
export function SourceDemo({ theme = 'dark' }: { theme?: 'light' | 'dark' }) {
  return <Stage width={760} height={410} compact={{ below: 600, width: 358, height: 350 }} theme={theme} tokens={{ '--ss-font': "'Geologica Variable', sans-serif" }} fidelity="realistic" initial={initial} poster={{ found: true, ready: true }} play="once" script={script} className="source-demo">
    {(s, _rect, layout) => <Window title={t("От фильма к плееру")} className="sd-window" sidebarWidth={144} sidebar={layout === 'compact' ? undefined : <div className="sd-sidebar"><div><Film size={16} />{t("Каталог")}</div><div><Tv size={16} />{t("Сериалы")}</div><div><Bookmark size={16} />{t("Коллекция")}</div>{[68, 82, 56, 74, 62, 80].map((w, i) => <Bar key={i} w={w} h={6} tone={2} />)}</div>}>
      <div className="sd-body"><div className="sd-search"><Search size={16} /><span>{t("Джентльмены")}</span></div><div className="sd-results"><Collapse open={s.found} reveal="drop"><Row title={t("Джентльмены")} subtitle={layout === 'compact' ? undefined : t("2019 · криминал, комедия")} lead={<Film size={18} />} meta={<Badge tone={s.ready ? 'success' : 'neutral'}><span className="sd-status" data-ready={s.ready}><span>{t("Поиск…")}</span><span>{t("Найдено")}</span></span></Badge>} /></Collapse><Collapse open={s.ready} reveal="drop"><div className="sd-providers"><div className="sd-caption">{t("Доступные плееры")}</div>{(layout === 'compact' ? ['Collaps'] : ['Collaps', 'Turbo']).map((p, i) => <Row key={p} title={p} lead={<Play size={16} />} selected={i === 0} />)}</div></Collapse><div className="sd-rest"><Bar w={168} h={8} tone={2} /><Bar w={128} h={7} tone={1} /><Bar w={186} h={7} tone={1} /><Bar w={148} h={7} tone={1} /><Bar w={172} h={7} tone={1} /><Bar w={136} h={7} tone={1} /><Bar w={164} h={7} tone={1} /></div></div></div>
    </Window>}
  </Stage>
}
