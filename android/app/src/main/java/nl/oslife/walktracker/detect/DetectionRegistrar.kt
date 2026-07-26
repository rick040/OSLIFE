package nl.oslife.walktracker.detect

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionRequest
import com.google.android.gms.location.DetectedActivity
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices
import nl.oslife.walktracker.Constants
import nl.oslife.walktracker.Prefs

/**
 * Registers the two always-on, event-driven signals the detector runs on:
 * activity transitions (WALKING / STILL / IN_VEHICLE) and the single "home"
 * geofence. Both are handled by Play Services at the OS level (not our own
 * polling loop), so this is cheap on battery — see /android/README.md.
 *
 * Called after permissions are granted (MainActivity) and again after every
 * reboot (BootReceiver), since Play Services forgets registrations on reboot.
 */
object DetectionRegistrar {

    fun registerAll(context: Context) {
        registerActivityTransitions(context)
        registerHomeGeofence(context)
    }

    private fun hasPermission(context: Context, permission: String): Boolean =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    private fun activityRecognitionPermission(): String =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) android.Manifest.permission.ACTIVITY_RECOGNITION
        else "com.google.android.gms.permission.ACTIVITY_RECOGNITION"

    private fun activityTransitionPendingIntent(context: Context): PendingIntent {
        val intent = Intent(context, ActivityTransitionReceiver::class.java).apply {
            action = ActivityTransitionReceiver.ACTION_ACTIVITY_TRANSITION
        }
        return PendingIntent.getBroadcast(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
        )
    }

    private fun geofencePendingIntent(context: Context): PendingIntent {
        val intent = Intent(context, HomeGeofenceReceiver::class.java).apply {
            action = HomeGeofenceReceiver.ACTION_GEOFENCE_TRANSITION
        }
        return PendingIntent.getBroadcast(
            context, 1, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
        )
    }

    private fun registerActivityTransitions(context: Context) {
        if (!hasPermission(context, activityRecognitionPermission())) return

        val transitions = listOf(
            DetectedActivity.WALKING,
            DetectedActivity.STILL,
            DetectedActivity.IN_VEHICLE,
        ).flatMap { activity ->
            listOf(
                ActivityTransition.Builder()
                    .setActivityType(activity)
                    .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_ENTER)
                    .build(),
                ActivityTransition.Builder()
                    .setActivityType(activity)
                    .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_EXIT)
                    .build(),
            )
        }
        val request = ActivityTransitionRequest(transitions)
        val pendingIntent = activityTransitionPendingIntent(context)
        try {
            ActivityRecognition.getClient(context)
                .requestActivityTransitionUpdates(request, pendingIntent)
        } catch (_: SecurityException) {
            // Permission revoked between the check above and this call — nothing more we can do.
        }
    }

    /** Re-registers the home geofence; no-op until the user has set a home location. */
    fun registerHomeGeofence(context: Context) {
        val prefs = Prefs(context)
        if (!prefs.hasHome) return
        if (!hasPermission(context, android.Manifest.permission.ACCESS_FINE_LOCATION)) return

        val geofence = Geofence.Builder()
            .setRequestId(Constants.HOME_GEOFENCE_REQUEST_ID)
            .setCircularRegion(prefs.homeLat, prefs.homeLon, Constants.HOME_GEOFENCE_RADIUS_M)
            .setExpirationDuration(Geofence.NEVER_EXPIRE)
            .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER or Geofence.GEOFENCE_TRANSITION_EXIT)
            .build()
        val request = GeofencingRequest.Builder()
            .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
            .addGeofence(geofence)
            .build()
        val pendingIntent = geofencePendingIntent(context)
        try {
            LocationServices.getGeofencingClient(context)
                .addGeofences(request, pendingIntent)
        } catch (_: SecurityException) {
            // Permission revoked between the check above and this call.
        }
    }
}
