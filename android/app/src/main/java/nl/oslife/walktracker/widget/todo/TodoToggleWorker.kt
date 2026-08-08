package nl.oslife.walktracker.widget.todo

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
 * Toggles one task done/open via widget-tasks. Deliberately a WorkManager job,
 * not a raw background thread spawned from the widget's onReceive() — a
 * BroadcastReceiver's process loses priority the instant onReceive() returns,
 * so an un-managed thread can get killed mid-request; WorkManager keeps it
 * alive for the run and retries on failure, same contract as BraindumpAddWorker.
 */
class TodoToggleWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    override fun doWork(): Result {
        val taskId = inputData.getString(KEY_TASK_ID) ?: return Result.failure()
        return when (OslifeWidgetApi.post(applicationContext, "widget-tasks", JSONObject().put("id", taskId).put("action", "toggle"))) {
            is OslifeWidgetApi.Result.Success -> {
                TodoListWidgetProvider.notifyListChanged(applicationContext)
                Result.success()
            }
            is OslifeWidgetApi.Result.NotConfigured -> Result.failure()
            is OslifeWidgetApi.Result.Failure -> Result.retry()
        }
    }

    companion object {
        private const val KEY_TASK_ID = "task_id"

        fun enqueue(context: Context, taskId: String) {
            val data = Data.Builder().putString(KEY_TASK_ID, taskId).build()
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val request = OneTimeWorkRequestBuilder<TodoToggleWorker>()
                .setInputData(data)
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.LINEAR, 5, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueue(request)
        }
    }
}
