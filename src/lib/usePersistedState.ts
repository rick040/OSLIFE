import { useState, useEffect } from 'react'

/**
 * useState backed by localStorage, so a UI choice (e.g. an inbox filter)
 * survives reloads and revisits. Falls back to `initial` when there's no
 * stored value or storage is unavailable (private mode, SSR).
 */
export function usePersistedState<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw !== null ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* storage unavailable — ignore */
    }
  }, [key, value])

  return [value, setValue]
}
