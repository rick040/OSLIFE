package nl.oslife.widgets.widget.common

import android.content.Context
import nl.oslife.widgets.Prefs
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Thin, shared client for the five premium widget-* edge functions (widget-tasks,
 * widget-projects, widget-braindump-add, widget-heyra-chat). All five widgets
 * would otherwise repeat the exact same "read Prefs, build an OkHttp request
 * with the x-widget-secret header, parse JSON" boilerplate that
 * WidgetUpdateWorker already established for widget-summary — this factors it
 * into one place instead. Deliberately synchronous (`.execute()`, not
 * `.enqueue()`): every caller already runs off the main thread (a WorkManager
 * Worker, a RemoteViewsFactory, or an explicit background thread in an
 * Activity), same contract as WidgetUpdateWorker.doWork().
 */
object OslifeWidgetApi {

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()
    private val JSON_MEDIA_TYPE = "application/json".toMediaType()

    sealed class Result {
        data class Success(val json: JSONObject) : Result()
        data class NotConfigured(val message: String = "OSLIFE-widgets nog niet ingesteld") : Result()
        data class Failure(val message: String) : Result()
    }

    fun get(context: Context, functionName: String, query: String = ""): Result {
        val prefs = Prefs(context)
        val url = prefs.oslifeFunctionUrl(functionName)
        if (url.isBlank() || prefs.oslifeWidgetSecret.isBlank()) return Result.NotConfigured()

        val request = Request.Builder()
            .url(url + query)
            .addHeader("x-widget-secret", prefs.oslifeWidgetSecret)
            .get()
            .build()
        return execute(request)
    }

    fun post(context: Context, functionName: String, body: JSONObject): Result {
        val prefs = Prefs(context)
        val url = prefs.oslifeFunctionUrl(functionName)
        if (url.isBlank() || prefs.oslifeWidgetSecret.isBlank()) return Result.NotConfigured()

        val request = Request.Builder()
            .url(url)
            .addHeader("x-widget-secret", prefs.oslifeWidgetSecret)
            .post(body.toString().toRequestBody(JSON_MEDIA_TYPE))
            .build()
        return execute(request)
    }

    /** Multipart POST of one file, field name "file" — used by the brain-dump widget's upload shortcut. */
    fun postFile(context: Context, functionName: String, bytes: ByteArray, filename: String, mime: String): Result {
        val prefs = Prefs(context)
        val url = prefs.oslifeFunctionUrl(functionName)
        if (url.isBlank() || prefs.oslifeWidgetSecret.isBlank()) return Result.NotConfigured()

        val body = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("file", filename, bytes.toRequestBody(mime.toMediaType()))
            .build()
        val request = Request.Builder()
            .url(url)
            .addHeader("x-widget-secret", prefs.oslifeWidgetSecret)
            .post(body)
            .build()
        return execute(request)
    }

    private fun execute(request: Request): Result {
        return try {
            client.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                if (!response.isSuccessful) return Result.Failure("Serverfout (${response.code})")
                val json = JSONObject(text)
                if (!json.optBoolean("ok", false)) {
                    return Result.Failure(json.optString("error", "Onbekende fout"))
                }
                Result.Success(json)
            }
        } catch (_: Exception) {
            Result.Failure("Geen verbinding")
        }
    }
}
