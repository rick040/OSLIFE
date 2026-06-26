import { useRef } from 'react'

/**
 * HEYRA orb. Tap → open HEYRA. Long-press (~450ms) → open the app-grid.
 * Lightweight animated gradient sphere in the RICK-OS palette.
 */
export default function Orb({
  size = 40,
  onTap,
  onLongPress,
}: {
  size?: number
  onTap: () => void
  onLongPress: () => void
}) {
  const timer = useRef<number | null>(null)
  const fired = useRef(false)

  const start = () => {
    fired.current = false
    timer.current = window.setTimeout(() => {
      fired.current = true
      // haptic on supporting devices
      navigator.vibrate?.(12)
      onLongPress()
    }, 450)
  }
  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }
  const end = () => {
    clear()
    if (!fired.current) onTap()
  }

  return (
    <button
      aria-label="HEYRA · tik om te openen, houd vast voor alle apps"
      onPointerDown={start}
      onPointerUp={end}
      onPointerLeave={clear}
      onContextMenu={(e) => e.preventDefault()}
      className="relative shrink-0 rounded-full select-none touch-none active:scale-95 transition-transform"
      style={{ width: size, height: size }}
    >
      <span className="absolute inset-0 rounded-full animate-pulse-ring" />
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background:
            'radial-gradient(circle at 32% 28%, #D2E86A 0%, #C7E04F 26%, #455A29 64%, #34431F 100%)',
          boxShadow: 'inset 0 -3px 8px rgba(20,22,15,0.45), 0 4px 14px -4px rgba(52,67,31,0.6)',
        }}
      />
      <span
        className="absolute rounded-full bg-white/60 blur-[1px]"
        style={{ width: size * 0.22, height: size * 0.22, left: size * 0.26, top: size * 0.2 }}
      />
    </button>
  )
}
