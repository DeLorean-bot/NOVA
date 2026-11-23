import { useEffect, useRef } from 'react'

const retryDelays = [2_000, 5_000, 15_000, 30_000, 60_000]

export function useConnectionRetry(key: string, failed: boolean, busy: boolean, retry: () => void) {
  const action = useRef(retry)
  action.current = retry
  const attempts = useRef({ key, count: 0 })

  useEffect(() => {
    if (attempts.current.key !== key || (!failed && !busy)) attempts.current = { key, count: 0 }
    if (!failed || busy) return

    let timer: ReturnType<typeof setTimeout>
    const schedule = (delay: number) => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (!navigator.onLine) {
          schedule(15_000)
          return
        }
        attempts.current.count++
        action.current()
      }, delay)
    }
    const reconnect = () => { attempts.current.count = 0; schedule(750) }
    window.addEventListener('online', reconnect)
    schedule(retryDelays[Math.min(attempts.current.count, retryDelays.length - 1)])
    return () => {
      clearTimeout(timer)
      window.removeEventListener('online', reconnect)
    }
  }, [key, failed, busy])
}
