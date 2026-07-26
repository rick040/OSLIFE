package nl.oslife.walktracker.detect

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import nl.oslife.walktracker.Constants
import nl.oslife.walktracker.Prefs
import nl.oslife.walktracker.tracking.WalkTrackingService

/**
 * The state machine that decides "is this actually a dog walk" from the raw
 * WALKING / STILL / IN_VEHICLE / home-geofence signals. Rules (from how the
 * real walks actually happen):
 *
 *   1. A walk shorter than [Constants.MIN_WALK_DURATION_MS] is discarded —
 *      that's wandering around the house, not a walk.
 *   2. A WALKING → STILL → WALKING sequence (dog sniffing, playing, a chat)
 *      is the SAME walk, as long as the STILL spell doesn't outlast
 *      [Constants.PAUSE_TIMEOUT_MS] — past that we assume the walk is over.
 *   3. Most walks start and end at home: WALKING seen shortly after exiting
 *      the home geofence starts a walk; entering the home geofence while a
 *      walk is active ends it.
 *   4. Forest walks: no home-exit immediately before, but a car ride (an
 *      IN_VEHICLE spell) ended shortly before WALKING started — that also
 *      counts, tagged `car_forest`. Getting back in the car ends the walk.
 *
 * If neither trigger (3) nor (4) applies, WALKING is ignored entirely — this
 * is the main defence against misfires (errands on foot, walking the aisles
 * of a shop, etc. never start a tracked "walk").
 *
 * Called from the two BroadcastReceivers (real events) and from
 * PauseCheckWorker (the delayed "is the pause over the timeout yet" check).
 * All state lives in Prefs — every entry point here runs in a short-lived
 * receiver/worker process, nothing is kept in memory between calls.
 */
object WalkDetector {

    fun onWalkingStarted(context: Context) {
        val prefs = Prefs(context)
        val now = System.currentTimeMillis()

        if (prefs.isWalkActive) {
            if (prefs.pausedSinceAt != 0L) {
                prefs.pausedSinceAt = 0L
                PauseCheckWorker.cancel(context)
            }
            return
        }

        val source = when {
            prefs.lastHomeExitAt != 0L && now - prefs.lastHomeExitAt in 0..Constants.HOME_EXIT_TRIGGER_WINDOW_MS -> "home"
            prefs.lastVehicleEndAt != 0L && now - prefs.lastVehicleEndAt in 0..Constants.CAR_WALK_TRIGGER_WINDOW_MS -> "car_forest"
            else -> null
        } ?: return // neither trigger applies — not a tracked walk, ignore

        prefs.isWalkActive = true
        prefs.walkStartAt = now
        prefs.triggerSource = source
        prefs.pausedSinceAt = 0L
        ContextCompat.startForegroundService(context, Intent(context, WalkTrackingService::class.java))
    }

    fun onStillStarted(context: Context) {
        val prefs = Prefs(context)
        if (!prefs.isWalkActive) return
        prefs.pausedSinceAt = System.currentTimeMillis()
        PauseCheckWorker.schedule(context)
    }

    /** Invoked by PauseCheckWorker once the pause timeout has actually elapsed. */
    fun checkPauseTimeout(context: Context) {
        val prefs = Prefs(context)
        if (!prefs.isWalkActive || prefs.pausedSinceAt == 0L) return
        if (System.currentTimeMillis() - prefs.pausedSinceAt >= Constants.PAUSE_TIMEOUT_MS) {
            finalizeWalk(context)
        }
    }

    fun onVehicleStarted(context: Context) {
        if (Prefs(context).isWalkActive) finalizeWalk(context)
    }

    fun onVehicleEnded(context: Context) {
        Prefs(context).lastVehicleEndAt = System.currentTimeMillis()
    }

    fun onHomeExit(context: Context) {
        Prefs(context).lastHomeExitAt = System.currentTimeMillis()
    }

    fun onHomeEnter(context: Context) {
        if (Prefs(context).isWalkActive) finalizeWalk(context)
    }

    /** Manual override from MainActivity: end and log the current walk right now. */
    fun forceEndWalk(context: Context) {
        if (Prefs(context).isWalkActive) finalizeWalk(context)
    }

    /** Manual override from MainActivity: the detector got it wrong — throw the current walk away. */
    fun discardWalk(context: Context) {
        if (!Prefs(context).isWalkActive) return
        finalizeWalk(context, discard = true)
    }

    private fun finalizeWalk(context: Context, discard: Boolean = false) {
        val prefs = Prefs(context)
        val intent = Intent(context, WalkTrackingService::class.java).apply {
            action = WalkTrackingService.ACTION_FINALIZE
            putExtra(WalkTrackingService.EXTRA_DISCARD, discard)
        }
        ContextCompat.startForegroundService(context, intent)
        PauseCheckWorker.cancel(context)
        prefs.isWalkActive = false
        prefs.pausedSinceAt = 0L
    }
}
