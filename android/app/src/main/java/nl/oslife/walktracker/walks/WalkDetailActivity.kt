package nl.oslife.walktracker.walks

import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import nl.oslife.walktracker.R
import org.osmdroid.config.Configuration
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polyline
import java.io.File
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/**
 * Shows one walk's route on a free OpenStreetMap map (osmdroid — no Google
 * Maps API key, matches the web dashboard's Leaflet/OSM map card) plus its
 * stats. The walk is looked up from [WalkCache] by id — set by whichever
 * screen navigated here (currently only [WalksListActivity]).
 */
class WalkDetailActivity : AppCompatActivity() {

    private lateinit var mapView: MapView

    override fun onCreate(savedInstanceState: Bundle?) {
        // Must run before any MapView is inflated/used.
        Configuration.getInstance().apply {
            userAgentValue = packageName
            osmdroidBasePath = File(cacheDir, "osmdroid")
            osmdroidTileCache = File(osmdroidBasePath, "tiles")
        }
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_walk_detail)

        findViewById<View>(R.id.backButton).setOnClickListener { finish() }
        mapView = findViewById(R.id.mapView)

        val walk = intent.getStringExtra(EXTRA_WALK_ID)?.let(WalkCache::find)
        if (walk == null) {
            finish()
            return
        }

        findViewById<TextView>(R.id.detailStatsText).text =
            String.format(Locale.US, "%.1f km · %d min", walk.distanceKm, walk.durationMin)
        findViewById<TextView>(R.id.detailDateText).text = formatWhen(walk.startedAt)
        findViewById<TextView>(R.id.detailTriggerText).text = triggerLabel(walk.triggerSource)

        drawRoute(walk)
    }

    private fun drawRoute(walk: Walk) {
        mapView.setTileSource(TileSourceFactory.MAPNIK)
        mapView.setMultiTouchControls(true)

        if (walk.points.size < 2) return
        val geoPoints = walk.points.map { GeoPoint(it.lat, it.lon) }

        val polyline = Polyline().apply {
            setPoints(geoPoints)
            outlinePaint.color = Color.parseColor("#FF34D399")
            outlinePaint.strokeWidth = 8f
        }
        mapView.overlays.add(polyline)
        mapView.overlays.add(Marker(mapView).apply {
            position = geoPoints.first()
            setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
            title = "Start"
        })
        mapView.overlays.add(Marker(mapView).apply {
            position = geoPoints.last()
            setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
            title = "Einde"
        })

        // Deferred until the map has a measured size, or the bounding-box zoom is a no-op.
        mapView.post { mapView.zoomToBoundingBox(polyline.bounds, true, 64) }
    }

    override fun onResume() {
        super.onResume()
        mapView.onResume()
    }

    override fun onPause() {
        mapView.onPause()
        super.onPause()
    }

    private fun formatWhen(iso: String): String = try {
        val parseFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }
        val displayFormat = SimpleDateFormat("d MMMM yyyy, HH:mm", Locale("nl", "NL"))
        displayFormat.format(parseFormat.parse(iso)!!)
    } catch (_: Exception) {
        iso
    }

    private fun triggerLabel(source: String?): String = when (source) {
        "home" -> "Gestart vanaf huis"
        "car_forest" -> "Gestart na een autorit"
        "manual" -> "Handmatig afgerond"
        else -> "Bron onbekend"
    }

    companion object {
        const val EXTRA_WALK_ID = "walk_id"
    }
}
