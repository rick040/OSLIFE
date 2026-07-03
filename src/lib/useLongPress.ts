import { useRef, useCallback } from 'react'
import type { TouchEvent } from 'react'

export function useLongPress(onShort: () => void, onLong: () => void, delay = 500) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fired = useRef(false)

  const start = useCallback(() => {
    fired.current = false
    timer.current = setTimeout(() => {
      fired.current = true
      onLong()
    }, delay)
  }, [onLong, delay])

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const end = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    if (!fired.current) onShort()
  }, [onShort])

  return {
    onMouseDown: start,
    onMouseUp: end,
    onMouseLeave: cancel,
    onTouchStart: (e: TouchEvent) => { e.preventDefault(); start() },
    onTouchEnd: (e: TouchEvent) => { e.preventDefault(); end() },
  }
}
