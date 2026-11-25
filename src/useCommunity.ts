import { useEffect, useState } from 'react'
import type { CommunityTitle } from './types'

export function useCommunity(active: boolean, pending: boolean) {
  const [titles, setTitles] = useState<CommunityTitle[]>([])
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    if (!active || !window.kadr) return
    let alive = true, busy = false
    const load = async () => {
      if (busy) return
      busy = true
      try {
        const result = await window.kadr!.communityTop()
        if (alive) setTitles(result)
      } catch {}
      finally { busy = false }
    }
    void load()
    const reconnect = () => { void load() }
    window.addEventListener('online', reconnect)
    const timer = setInterval(reconnect, 120_000)
    return () => { alive = false; clearInterval(timer); window.removeEventListener('online', reconnect) }
  }, [active, pending, refresh])
  return { titles, refresh: () => setRefresh(value => value + 1) }
}
