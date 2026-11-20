import { useCallback, useEffect, useRef, useState } from 'react'
import type { Movie, Taste } from './types'

export function useRecommendations(history: Movie[], favorites: Movie[], enabled: boolean, taste: Taste) {
  const [movies,setMovies] = useState<Movie[]>([])
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')
  const [seen,setSeen] = useState<number[]>([])
  const [seed,setSeed] = useState(() => Math.floor(Date.now()/86400000))
  const [exhausted,setExhausted] = useState(false)
  const busy = useRef(false), attempted = useRef<string | null>(null), alive = useRef(true)
  const initialized=useRef(false)
  const profileKey = JSON.stringify([history.filter(m=>(m.watchedSeconds || 0)>=120).map(m=>[m.id,Math.floor(Math.min(m.watchedSeconds||0,7200)/900),Boolean(m.completed)]),favorites.map(m=>m.id),taste.blockedGenres,taste.liked.map(m=>m.id),taste.disliked.map(m=>m.id),taste.hidden.map(m=>m.id)])
  const latestKey = useRef(profileKey); latestKey.current = profileKey
  useEffect(()=>{ alive.current=true; return ()=>{alive.current=false} },[])
  const load = useCallback(async (refresh=false, shown: number[] = []) => {
    if (!window.kadr || busy.current) return
    busy.current=true; attempted.current=latestKey.current; setLoading(true); setError('')
    try {
      const result=await window.kadr.recommendations(refresh)
      if (!alive.current) return
      setMovies(result.movies); setExhausted(!result.hasMore)
      if(!initialized.current){initialized.current=true;setSeen(result.seen||[])}
      if (refresh) { setSeen(previous=>[...new Set([...previous,...shown])].slice(-120)); setSeed(value=>value+1) }
    } catch(e) { if(alive.current) setError((e as Error).message) }
    finally { busy.current=false; if(alive.current) setLoading(false) }
  },[])
  useEffect(()=>{ if(enabled && attempted.current!==profileKey && !loading) { const timer=setTimeout(()=>load(),400); return ()=>clearTimeout(timer) } },[enabled,profileKey,load,loading])
  return { movies,loading,error,seen,seed,exhausted,refresh:load }
}
