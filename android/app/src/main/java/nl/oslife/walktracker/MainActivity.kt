package nl.oslife.walktracker

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import nl.oslife.walktracker.databinding.ActivityMainBinding
import nl.oslife.walktracker.detect.DetectionRegistrar
import nl.oslife.walktracker.detect.WalkDetector
import nl.oslife.walktracker.walks.WalksListActivity
import nl.oslife.walktracker.widget.WidgetUpdateWorker

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: Prefs
    private val statusHandler = Handler(Looper.getMainLooper())
    private val statusRunnable = object : Runnable {
        override fun run() {
            renderStatus()
            statusHandler.postDelayed(this, 2000)
        }
    }

    private val requestPermissions =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { _ ->
            renderPermissionStatus()
            // Background location must be requested on its own, after foreground is granted.
            if (hasForegroundLocation() && !hasBackgroundLocation() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                requestBackgroundLocation.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
            } else {
                DetectionRegistrar.registerAll(this)
            }
        }

    private val requestBackgroundLocation =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) {
            renderPermissionStatus()
            DetectionRegistrar.registerAll(this)
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        prefs = Prefs(this)

        binding.serverUrlInput.setText(prefs.serverUrl)
        binding.secretInput.setText(prefs.secret)
        binding.widgetUrlInput.setText(prefs.widgetSummaryUrl)
        binding.widgetSecretInput.setText(prefs.widgetSummarySecret)
        renderHomeStatus()
        renderPermissionStatus()

        binding.saveSettingsButton.setOnClickListener {
            prefs.serverUrl = binding.serverUrlInput.text.toString().trim()
            prefs.secret = binding.secretInput.text.toString().trim()
            Toast.makeText(this, "Opgeslagen", Toast.LENGTH_SHORT).show()
        }

        binding.saveWidgetSettingsButton.setOnClickListener {
            prefs.widgetSummaryUrl = binding.widgetUrlInput.text.toString().trim()
            prefs.widgetSummarySecret = binding.widgetSecretInput.text.toString().trim()
            Toast.makeText(this, "Widget-instellingen opgeslagen", Toast.LENGTH_SHORT).show()
        }

        binding.refreshWidgetButton.setOnClickListener {
            WidgetUpdateWorker.refreshNow(this)
            Toast.makeText(this, "Widget wordt ververst…", Toast.LENGTH_SHORT).show()
        }

        binding.setHomeButton.setOnClickListener { captureHomeLocation() }
        binding.requestPermissionsButton.setOnClickListener { requestAllPermissions() }
        binding.forceEndButton.setOnClickListener {
            WalkDetector.forceEndWalk(this)
            Toast.makeText(this, "Wandeling afgerond", Toast.LENGTH_SHORT).show()
        }
        binding.discardButton.setOnClickListener {
            WalkDetector.discardWalk(this)
            Toast.makeText(this, "Wandeling verwijderd", Toast.LENGTH_SHORT).show()
        }
        binding.viewWalksButton.setOnClickListener {
            startActivity(Intent(this, WalksListActivity::class.java))
        }
    }

    override fun onResume() {
        super.onResume()
        statusHandler.post(statusRunnable)
    }

    override fun onPause() {
        super.onPause()
        statusHandler.removeCallbacks(statusRunnable)
    }

    private fun renderStatus() {
        binding.statusText.text = if (prefs.isWalkActive) {
            val minutes = (System.currentTimeMillis() - prefs.walkStartAt) / 60000
            val paused = if (prefs.pausedSinceAt != 0L) " (gepauzeerd)" else ""
            "Wandeling bezig — ${minutes} min$paused — bron: ${prefs.triggerSource}"
        } else {
            "Idle — wacht op een herkende wandeling"
        }
    }

    private fun renderHomeStatus() {
        binding.homeStatusText.text = if (prefs.hasHome) {
            val lat = String.format(java.util.Locale.US, "%.5f", prefs.homeLat)
            val lon = String.format(java.util.Locale.US, "%.5f", prefs.homeLon)
            "Thuislocatie: $lat, $lon"
        } else {
            "Thuislocatie: nog niet ingesteld"
        }
    }

    private fun renderPermissionStatus() {
        val fine = hasForegroundLocation()
        val background = hasBackgroundLocation()
        val activity = hasActivityRecognition()
        val notif = hasNotifications()
        binding.permissionStatusText.text = buildString {
            append(if (fine) "✓ Locatie  " else "✗ Locatie  ")
            append(if (background) "✓ Achtergrond-locatie  " else "✗ Achtergrond-locatie  ")
            append(if (activity) "✓ Activiteitsherkenning  " else "✗ Activiteitsherkenning  ")
            append(if (notif) "✓ Meldingen" else "✗ Meldingen")
        }
    }

    private fun requestAllPermissions() {
        val permissions = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) permissions += Manifest.permission.ACTIVITY_RECOGNITION
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) permissions += Manifest.permission.POST_NOTIFICATIONS
        requestPermissions.launch(permissions.toTypedArray())
    }

    private fun captureHomeLocation() {
        if (!hasForegroundLocation()) {
            Toast.makeText(this, "Geef eerst locatietoestemming", Toast.LENGTH_SHORT).show()
            return
        }
        val client = LocationServices.getFusedLocationProviderClient(this)
        try {
            client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, CancellationTokenSource().token)
                .addOnSuccessListener { location ->
                    if (location == null) {
                        Toast.makeText(this, "Geen locatie gevonden, probeer opnieuw", Toast.LENGTH_SHORT).show()
                        return@addOnSuccessListener
                    }
                    prefs.homeLat = location.latitude
                    prefs.homeLon = location.longitude
                    renderHomeStatus()
                    DetectionRegistrar.registerHomeGeofence(this)
                    Toast.makeText(this, "Thuislocatie ingesteld", Toast.LENGTH_SHORT).show()
                }
        } catch (_: SecurityException) {
            Toast.makeText(this, "Geef eerst locatietoestemming", Toast.LENGTH_SHORT).show()
        }
    }

    private fun hasForegroundLocation() =
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun hasBackgroundLocation() =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED
        } else true

    private fun hasActivityRecognition() =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED
        } else true

    private fun hasNotifications() =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        } else true
}
