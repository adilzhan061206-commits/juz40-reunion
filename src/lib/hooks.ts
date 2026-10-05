import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { errorText } from './api'

export interface AsyncState<T> {
  data: T | undefined
  error: string | null
  loading: boolean
  reload: () => Promise<void>
  setData: (value: T) => void
}

/** Load data for a component; re-runs when ``deps`` change. Stale responses are ignored. */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const counter = useRef(0)
  const loaderRef = useRef(loader)
  useLayoutEffect(() => {
    loaderRef.current = loader
  })

  const reload = useCallback(async () => {
    const id = ++counter.current
    setLoading(true)
    try {
      const value = await loaderRef.current()
      if (id === counter.current) {
        setData(value)
        setError(null)
      }
    } catch (e) {
      if (id === counter.current) setError(errorText(e))
    } finally {
      if (id === counter.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Fetching on mount/dependency change is the point of this hook; state updates happen as the request settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, error, loading, reload, setData }
}

export function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

export function useInterval(callback: () => void, ms: number | null) {
  const ref = useRef(callback)
  useLayoutEffect(() => {
    ref.current = callback
  })
  useEffect(() => {
    if (ms === null) return
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') ref.current()
    }, ms)
    return () => clearInterval(id)
  }, [ms])
}

export function useLocalStorage<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })
  const set = useCallback(
    (next: T) => {
      setValue(next)
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        /* storage unavailable */
      }
    },
    [key],
  )
  return [value, set]
}
