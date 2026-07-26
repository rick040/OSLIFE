package nl.oslife.walktracker.detect

import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import nl.oslife.walktracker.widget.DailyGlanceWidgetProvider
import nl.oslife.walktracker.widget.WidgetUpdateWorker

/** Play Services forgets geofence/activity-transition registrations across a reboot — redo them. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            DetectionRegistrar.registerAll(context)
            rescheduleWidgetIfPlaced(context)
        }
    }

    /** WorkManager's own DB survives reboot, so this is normally a no-op (KEEP policy) —
     *  cheap insurance in case a device/OEM battery-optimizer cleared it. */
    private fun rescheduleWidgetIfPlaced(context: Context) {
        val manager = AppWidgetManager.getInstance(context)
        val ids = manager.getAppWidgetIds(ComponentName(context, DailyGlanceWidgetProvider::class.java))
        if (ids.isNotEmpty()) WidgetUpdateWorker.schedulePeriodic(context)
    }
}
