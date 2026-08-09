package nl.oslife.widgets.widget.todo

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.time.Duration

/**
 * Periodic trigger for the to-do widget's collection view. The actual fetch
 * lives in TodoRemoteViewsFactory.onDataSetChanged() — this worker's only job
 * is to call notifyAppWidgetViewDataChanged, which is what makes the OS
 * invoke that factory again. Same WorkManager-over-widget-alarm reasoning as
 * WidgetUpdateWorker (more reliable through Doze).
 */
class TodoWidgetRefreshWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        TodoListWidgetProvider.notifyListChanged(applicationContext)
        return Result.success()
    }

    companion object {
        private const val UNIQUE_PERIODIC_WORK = "todo_widget_refresh_periodic"
        private val REFRESH_INTERVAL = Duration.ofMinutes(30)

        fun schedulePeriodic(context: Context) {
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val request = PeriodicWorkRequestBuilder<TodoWidgetRefreshWorker>(REFRESH_INTERVAL)
                .setConstraints(constraints)
                .build()
            WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork(UNIQUE_PERIODIC_WORK, ExistingPeriodicWorkPolicy.KEEP, request)
        }

        fun cancelPeriodic(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(UNIQUE_PERIODIC_WORK)
        }
    }
}
