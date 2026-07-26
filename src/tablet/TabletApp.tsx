import { useState } from 'react'
import { useLiveSession } from '../lib/useLiveSession'
import { supabase } from '../lib/supabase'
import LoginScreen from '../components/LoginScreen'
import { ConfirmDialog } from '../components/ui'
import { TABLET_SCREENS } from './screens'
import TabletScreenPicker from './TabletScreenPicker'
import { LogOut } from 'lucide-react'

/**
 * Entry point for wall-mounted kiosk views (docs: a tablet per room, each
 * showing one decluttered, read-mostly screen — no sidebar, no other app
 * views, nothing to edit). Routed by pathname (/tablet/<key>) rather than the
 * main AppShell's view switcher, since these devices should never see the
 * rest of OSLIFE. Session handling is the same as the main app (see
 * src/lib/useLiveSession.ts) so a tablet just needs to log in once.
 */
export default function TabletApp() {
  const { session, authChecked } = useLiveSession()
  const [confirmSignOut, setConfirmSignOut] = useState(false)

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="h-8 w-8 rounded-full border-2 border-forest border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!session) return <LoginScreen />

  const key = window.location.pathname.replace(/^\/tablet\/?/, '')
  const screen = TABLET_SCREENS.find((s) => s.key === key)
  const Screen = screen?.component ?? TabletScreenPicker

  return (
    <div className="min-h-screen bg-canvas relative overflow-hidden">
      <Screen />
      <button
        onClick={() => setConfirmSignOut(true)}
        className="absolute top-3 right-3 text-faint/40 hover:text-faint p-2"
        aria-label="Uitloggen op dit apparaat"
      >
        <LogOut className="h-4 w-4" />
      </button>
      {confirmSignOut && (
        <ConfirmDialog
          title="Uitloggen op dit apparaat?"
          message="Handig als dit tablet van account moet wisselen. Log opnieuw in om verder te gaan."
          confirmLabel="Uitloggen"
          onCancel={() => setConfirmSignOut(false)}
          onConfirm={() => {
            setConfirmSignOut(false)
            void supabase.auth.signOut()
          }}
        />
      )}
    </div>
  )
}
