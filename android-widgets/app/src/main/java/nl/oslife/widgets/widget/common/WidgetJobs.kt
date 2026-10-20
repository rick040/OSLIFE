package nl.oslife.widgets.widget.common

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.ListenableWorker
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.PeriodicWorkRequest
import androidx.work.WorkManager
import androidx.work.WorkRequest
import java.time.Duration
import java.util.concurrent.TimeUnit

/** The two WorkManager jobs every data widget runs: a one-off refresh and a 30-minute periodic one. */
object WidgetJobs {
    private val REFRESH_INTERVAL = Duration.ofMinutes(30)

    /**
     * Refresh now. Deliberately no network constraint: offline, the job fails fast to the cached
     * "Offline" state (and retries a few times, see DataWidgetWorker) instead of leaving the
     * widget on "Verversen…" until a connection shows up.
     */
    fun refreshNow(context: Context, worker: Class<out ListenableWorker>, uniqueName: String) {
        val request = OneTimeWorkRequest.Builder(worker)
            .setBackoffCriteria(BackoffPolicy.LINEAR, WorkRequest.MIN_BACKOFF_MILLIS, TimeUnit.MILLISECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(uniqueName, ExistingWorkPolicy.REPLACE, request)
    }

    fun schedulePeriodic(context: Context, worker: Class<out ListenableWorker>, uniqueName: String) {
        val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        val request = PeriodicWorkRequest.Builder(worker, REFRESH_INTERVAL)
            .setConstraints(constraints)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(uniqueName, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    fun cancel(context: Context, uniqueName: String) {
        WorkManager.getInstance(context).cancelUniqueWork(uniqueName)
    }
}
