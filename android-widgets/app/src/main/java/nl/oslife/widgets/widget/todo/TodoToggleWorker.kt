package nl.oslife.widgets.widget.todo

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import nl.oslife.widgets.widget.common.OslifeWidgetApi
import nl.oslife.widgets.widget.common.WidgetData
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Toggles one task done/open via widget-tasks. Deliberately a WorkManager job,
 * not a raw background thread spawned from the widget's onReceive() — a
 * BroadcastReceiver's process loses priority the instant onReceive() returns,
 * so an un-managed thread can get killed mid-request; WorkManager keeps it
 * alive for the run and retries on failure, same contract as BraindumpAddWorker.
 * Toggles for the same task are chained (tick, then undo) so they reach the
 * server in tap order.
 */
class TodoToggleWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    override fun doWork(): Result {
        val taskId = inputData.getString(KEY_TASK_ID) ?: return Result.failure()
        return when (OslifeWidgetApi.post(applicationContext, TaskRows.FUNCTION, JSONObject().put("id", taskId).put("action", "toggle"))) {
            is OslifeWidgetApi.Result.Success -> {
                TodoWidgetWorker.refreshNow(applicationContext)
                Result.success()
            }
            is OslifeWidgetApi.Result.NotConfigured -> giveUp(taskId)
            is OslifeWidgetApi.Result.Failure -> if (runAttemptCount >= MAX_ATTEMPTS) giveUp(taskId) else Result.retry()
        }
    }

    /** The server never got it: put the row back the way it was rather than pretending it's done. */
    private fun giveUp(taskId: String): Result {
        PendingDone.remove(applicationContext, taskId)
        TaskRows.pushAll(applicationContext, WidgetData.cached(applicationContext, TaskRows.FUNCTION))
        return Result.failure()
    }

    companion object {
        private const val KEY_TASK_ID = "task_id"
        private const val MAX_ATTEMPTS = 5

        fun enqueue(context: Context, taskId: String) {
            val data = Data.Builder().putString(KEY_TASK_ID, taskId).build()
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val request = OneTimeWorkRequestBuilder<TodoToggleWorker>()
                .setInputData(data)
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.LINEAR, 5, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context)
                .enqueueUniqueWork("todo_toggle_$taskId", ExistingWorkPolicy.APPEND_OR_REPLACE, request)
        }
    }
}
