package nl.oslife.walktracker.widget.braindump

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import nl.oslife.walktracker.widget.common.OslifeWidgetApi
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Reliable, retrying POST of one quick-add capture to widget-braindump-add —
 * same "hand it to WorkManager, let it retry with backoff until it succeeds"
 * contract as WalkUploadWorker, so a capture made with no signal still lands
 * once the phone is back online instead of being silently lost.
 */
class BraindumpAddWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    override fun doWork(): Result {
        val text = inputData.getString(KEY_TEXT)
        if (text.isNullOrBlank()) return Result.failure()

        return when (OslifeWidgetApi.post(applicationContext, "widget-braindump-add", JSONObject().put("text", text))) {
            is OslifeWidgetApi.Result.Success -> {
                BraindumpQuickAddWidgetWorker.refreshNow(applicationContext)
                Result.success()
            }
            is OslifeWidgetApi.Result.NotConfigured -> Result.failure()
            is OslifeWidgetApi.Result.Failure -> Result.retry()
        }
    }

    companion object {
        private const val KEY_TEXT = "text"

        fun enqueue(context: Context, text: String) {
            val data = Data.Builder().putString(KEY_TEXT, text).build()
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val request = OneTimeWorkRequestBuilder<BraindumpAddWorker>()
                .setInputData(data)
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueue(request)
        }
    }
}
