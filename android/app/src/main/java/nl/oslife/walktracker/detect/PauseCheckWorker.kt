package nl.oslife.walktracker.detect

import android.content.Context
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import nl.oslife.walktracker.Constants
import java.util.concurrent.TimeUnit

/**
 * Fires once [Constants.PAUSE_TIMEOUT_MS] after a walk goes STILL, to finalize
 * it if it never resumed. Scheduling through WorkManager (rather than a plain
 * Handler/AlarmManager) means the check still fires even if the app process
 * was killed while the dog sniffed around for twenty minutes.
 */
class PauseCheckWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        WalkDetector.checkPauseTimeout(applicationContext)
        return Result.success()
    }

    companion object {
        private const val UNIQUE_WORK_NAME = "pause_timeout_check"

        fun schedule(context: Context) {
            val request = OneTimeWorkRequestBuilder<PauseCheckWorker>()
                .setInitialDelay(Constants.PAUSE_TIMEOUT_MS, TimeUnit.MILLISECONDS)
                .build()
            WorkManager.getInstance(context)
                .enqueueUniqueWork(UNIQUE_WORK_NAME, ExistingWorkPolicy.REPLACE, request)
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(UNIQUE_WORK_NAME)
        }
    }
}
