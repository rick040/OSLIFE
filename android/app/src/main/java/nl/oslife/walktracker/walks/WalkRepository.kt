package nl.oslife.walktracker.walks

import android.content.Context
import nl.oslife.walktracker.Prefs
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException

/**
 * Reads recent walks back from the same walk-ingest edge function the tracker
 * posts to (it also serves GET, see supabase/functions/walk-ingest) — one
 * function, one URL/secret to configure, for both writing and viewing walks.
 *
 * Blocking network call — always run off the main thread (see WalksListActivity).
 */
object WalkRepository {

    fun fetchRecentWalks(context: Context): List<Walk> {
        val prefs = Prefs(context)
        val url = prefs.serverUrl
        if (url.isBlank()) return emptyList()

        val separator = if (url.contains('?')) '&' else '?'
        val request = Request.Builder()
            .url("$url${separator}limit=30")
            .addHeader("x-webhook-secret", prefs.secret)
            .get()
            .build()

        return try {
            OkHttpClient().newCall(request).execute().use { response ->
                val body = response.body?.string()
                if (!response.isSuccessful || body == null) emptyList() else parseWalks(body)
            }
        } catch (_: IOException) {
            emptyList()
        }
    }

    private fun parseWalks(body: String): List<Walk> {
        val json = JSONObject(body)
        if (!json.optBoolean("ok", false)) return emptyList()
        val array = json.optJSONArray("walks") ?: JSONArray()
        return (0 until array.length()).map { i ->
            val w = array.getJSONObject(i)
            val pointsArray = w.optJSONArray("points") ?: JSONArray()
            val points = (0 until pointsArray.length()).map { j ->
                val p = pointsArray.getJSONObject(j)
                WalkPoint(p.getDouble("lat"), p.getDouble("lon"), p.optString("t").ifEmpty { null })
            }
            Walk(
                id = w.getString("id"),
                startedAt = w.getString("started_at"),
                endedAt = w.getString("ended_at"),
                durationMin = w.optInt("duration_min", 0),
                distanceKm = w.optDouble("distance_km", 0.0),
                points = points,
                triggerSource = w.optString("trigger_source").ifEmpty { null },
            )
        }
    }
}
