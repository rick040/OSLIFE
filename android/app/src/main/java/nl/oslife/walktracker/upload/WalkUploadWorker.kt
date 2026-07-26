package nl.oslife.walktracker.upload

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkRequest
import androidx.work.Worker
import androidx.work.WorkerParameters
import nl.oslife.walktracker.Prefs
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.TimeUnit

/**
 * Uploads one finished walk with a single POST to walk-ingest. The full
 * payload (points included) is written to a cache file rather than passed
 * through WorkManager's `Data` — `Data` is Parcel-backed with a ~10KB limit,
 * and a realistic 45-minute walk's point list alone is well past that.
 * WorkManager's default retry/backoff means this keeps trying — quietly,
 * whenever there's connectivity — until it succeeds, so a walk finished with
 * no signal still uploads once you're back on wifi at home.
 */
class WalkUploadWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    override fun doWork(): Result {
        val path = inputData.getString(KEY_PAYLOAD_FILE) ?: return Result.failure()
        val file = File(path)
        if (!file.exists()) return Result.failure() // already uploaded + cleaned up by a prior run

        val prefs = Prefs(applicationContext)
        val url = prefs.serverUrl
        if (url.isBlank()) return Result.failure() // not configured yet — nothing to retry towards

        val body = file.readText().toRequestBody(JSON_MEDIA_TYPE)
        val request = Request.Builder()
            .url(url)
            .addHeader("x-webhook-secret", prefs.secret)
            .post(body)
            .build()

        return try {
            OkHttpClient().newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    file.delete()
                    Result.success()
                } else if (response.code in 400..499) {
                    // Bad request/unauthorized — retrying won't help, and would spam the function forever.
                    file.delete()
                    Result.failure()
                } else {
                    Result.retry()
                }
            }
        } catch (_: Exception) {
            Result.retry()
        }
    }

    companion object {
        private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
        private const val KEY_PAYLOAD_FILE = "payload_file"

        fun enqueue(
            context: Context,
            startedAtMs: Long,
            endedAtMs: Long,
            distanceKm: Double,
            points: List<Triple<Double, Double, Long>>,
            triggerSource: String,
        ) {
            val payload = JSONObject().apply {
                put("started_at", isoFormat(startedAtMs))
                put("ended_at", isoFormat(endedAtMs))
                put("duration_min", ((endedAtMs - startedAtMs) / 60000L).toInt())
                put("distance_km", distanceKm)
                put("trigger_source", triggerSource)
                put("points", JSONArray().apply {
                    points.forEach { (lat, lon, t) ->
                        put(JSONObject().apply {
                            put("lat", lat)
                            put("lon", lon)
                            put("t", isoFormat(t))
                        })
                    }
                })
            }

            val file = File(context.cacheDir, "walk_upload_${startedAtMs}.json")
            file.writeText(payload.toString())

            val data = Data.Builder().putString(KEY_PAYLOAD_FILE, file.absolutePath).build()
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val request = OneTimeWorkRequestBuilder<WalkUploadWorker>()
                .setInputData(data)
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, WorkRequest.MIN_BACKOFF_MILLIS, TimeUnit.MILLISECONDS)
                .build()
            WorkManager.getInstance(context).enqueue(request)
        }

        private fun isoFormat(epochMs: Long): String {
            val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
            sdf.timeZone = TimeZone.getTimeZone("UTC")
            return sdf.format(Date(epochMs))
        }
    }
}
