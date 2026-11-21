import { t } from './i18n'
import type { SearchPhase } from './types'

const labels: Record<SearchPhase, string> = {
  catalog: 'Ищем в каталоге…',
  description: 'Ищем по описанию…',
  reviews: 'Ищем в рецензиях…',
  matching: 'Сверяем результаты с каталогом…',
}

export function SearchProgress({ phase }: { phase: SearchPhase }) {
  return <div className="search-progress" role="status" data-phase={phase}>
    <span className="search-progress-label">{t(labels[phase])}</span>
  </div>
}
