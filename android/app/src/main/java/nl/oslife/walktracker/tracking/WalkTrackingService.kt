package nl.oslife.walktracker.tracking

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.os.Build
import android.os.IBinder
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import nl.oslife.walktracker.Constants
import nl.oslife.walktracker.Prefs
import nl.oslife.walktracker.R
import nl.oslife.walktracker.upload.WalkUploadWorker

/**
 * Foreground service that owns the actual GPS trace for one walk. Only runs
 * while [nl.oslife.walktracker.detect.WalkDetector] has an active walk — the
 * always-on detection (geofence + activity transitions) is handled by Play
 * Services separately and costs far less battery than continuous GPS would.
 *
 * Known v1 limitation (documented in /android/README.md): the point buffer is
 * in-memory only. A foreground location service is very unlikely to be killed
 * by the OS, but if it were, that walk's route would be lost. Acceptable
 * trade-off for a first version; a future version could flush points to a
 * local file periodically.
 */
class WalkTrackingService : Service() {

    private lateinit var fusedClient: FusedLocationProviderClient
    private var locationCallback: LocationCallback? = null
    private val points = mutableListOf<Triple<Double, Double, Long>>() // lat, lon, epochMillis
    private var distanceMeters = 0.0
    private var lastAccepted: Location? = null

    override fun onCreate() {
        super.onCreate()
        fusedClient = LocationServices.getFusedLocationProviderClient(this)
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_FINALIZE) {
            finalizeWalk(intent.getBooleanExtra(EXTRA_DISCARD, false))
            return START_NOT_STICKY
        }
        startTracking()
        return START_STICKY
    }

    private fun startTracking() {
        startForeground(NOTIF_ID, buildNotification("0.0 km · 0 min"))

        if (ActivityCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED
        ) {
            stopSelf()
            return
        }

        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, Constants.LOCATION_UPDATE_INTERVAL_MS).build()
        val callback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                result.lastLocation?.let(::onLocation)
            }
        }
        locationCallback = callback
        try {
            fusedClient.requestLocationUpdates(request, callback, mainLooper)
        } catch (_: SecurityException) {
            stopSelf()
        }
    }

    private fun onLocation(location: Location) {
        if (location.accuracy > Constants.MAX_ACCEPTABLE_ACCURACY_M) return
        lastAccepted?.let { distanceMeters += it.distanceTo(location) }
        lastAccepted = location
        points.add(Triple(location.latitude, location.longitude, System.currentTimeMillis()))
        updateNotification()
    }

    private fun updateNotification() {
        val prefs = Prefs(this)
        val elapsedMin = (System.currentTimeMillis() - prefs.walkStartAt) / 60000
        val km = distanceMeters / 1000.0
        val text = String.format(java.util.Locale.US, "%.1f km · %d min", km, elapsedMin)
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIF_ID, buildNotification(text))
    }

    private fun finalizeWalk(discard: Boolean) {
        locationCallback?.let { fusedClient.removeLocationUpdates(it) }
        locationCallback = null

        val prefs = Prefs(this)
        val startedAt = prefs.walkStartAt
        val endedAt = System.currentTimeMillis()
        val durationMs = endedAt - startedAt

        if (!discard && durationMs >= Constants.MIN_WALK_DURATION_MS && points.size >= 2) {
            WalkUploadWorker.enqueue(
                applicationContext,
                startedAtMs = startedAt,
                endedAtMs = endedAt,
                distanceKm = distanceMeters / 1000.0,
                points = points,
                triggerSource = prefs.triggerSource,
            )
        }

        points.clear()
        distanceMeters = 0.0
        lastAccepted = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        locationCallback?.let { fusedClient.removeLocationUpdates(it) }
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.notif_channel_tracking),
            NotificationManager.IMPORTANCE_LOW,
        )
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun buildNotification(text: String) =
        NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.notif_tracking_title))
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .build()

    companion object {
        const val ACTION_FINALIZE = "nl.oslife.walktracker.ACTION_FINALIZE"
        const val EXTRA_DISCARD = "discard"
        private const val NOTIF_ID = 42
        private const val CHANNEL_ID = "walk_tracking"
    }
}
