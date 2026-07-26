package nl.oslife.walktracker.detect

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent

/** Delivers home-geofence enter/exit transitions from Play Services to [WalkDetector]. */
class HomeGeofenceReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_GEOFENCE_TRANSITION) return
        val event = GeofencingEvent.fromIntent(intent) ?: return
        if (event.hasError()) return

        when (event.geofenceTransition) {
            Geofence.GEOFENCE_TRANSITION_EXIT -> WalkDetector.onHomeExit(context)
            Geofence.GEOFENCE_TRANSITION_ENTER -> WalkDetector.onHomeEnter(context)
        }
    }

    companion object {
        const val ACTION_GEOFENCE_TRANSITION = "nl.oslife.walktracker.ACTION_GEOFENCE_TRANSITION"
    }
}
