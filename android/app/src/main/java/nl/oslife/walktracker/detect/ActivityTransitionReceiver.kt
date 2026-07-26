package nl.oslife.walktracker.detect

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionResult
import com.google.android.gms.location.DetectedActivity

/** Delivers WALKING / STILL / IN_VEHICLE enter+exit events from Play Services to [WalkDetector]. */
class ActivityTransitionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_ACTIVITY_TRANSITION) return
        if (!ActivityTransitionResult.hasResult(intent)) return
        val result = ActivityTransitionResult.extractResult(intent) ?: return

        for (event in result.transitionEvents) {
            val entering = event.transitionType == ActivityTransition.ACTIVITY_TRANSITION_ENTER
            when (event.activityType) {
                DetectedActivity.WALKING -> if (entering) WalkDetector.onWalkingStarted(context)
                DetectedActivity.STILL -> if (entering) WalkDetector.onStillStarted(context)
                DetectedActivity.IN_VEHICLE ->
                    if (entering) WalkDetector.onVehicleStarted(context) else WalkDetector.onVehicleEnded(context)
            }
        }
    }

    companion object {
        const val ACTION_ACTIVITY_TRANSITION = "nl.oslife.walktracker.ACTION_ACTIVITY_TRANSITION"
    }
}
