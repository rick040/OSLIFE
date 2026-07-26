package nl.oslife.walktracker.detect

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Play Services forgets geofence/activity-transition registrations across a reboot — redo them. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            DetectionRegistrar.registerAll(context)
        }
    }
}
