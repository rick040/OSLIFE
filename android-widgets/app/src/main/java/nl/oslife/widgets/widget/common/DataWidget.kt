package nl.oslife.widgets.widget.common

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.widget.RemoteViews
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONObject

/**
 * Provider side of every widget fed by one widget-* edge function. The lifecycle is the same for
 * all of them, so it lives here once:
 *  - placed / rebooted → draw the cached data immediately, then fetch fresh data;
 *  - resized → redraw from cache (only the row count changes, no network round-trip);
 *  - ↻ tapped → footer shows "Verversen…" right away, then fetch.
 */
abstract class DataWidgetProvider : AppWidgetProvider() {
    /** Edge function that feeds this widget — also its cache key (see WidgetData). */
    protected abstract val function: String
    protected abstract val layoutId: Int
    protected abstract val refreshAction: String

    /** Draw [data] into [appWidgetIds], or into every pinned instance when null. */
    protected abstract fun push(context: Context, appWidgetIds: IntArray?, data: WidgetData)
    protected abstract fun refreshNow(context: Context)
    protected abstract fun schedulePeriodic(context: Context)
    protected abstract fun cancelPeriodic(context: Context)

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        push(context, appWidgetIds, WidgetData.cached(context, function))
        refreshNow(context)
    }

    override fun onAppWidgetOptionsChanged(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) {
        super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions)
        push(context, intArrayOf(appWidgetId), WidgetData.cached(context, function))
    }

    override fun onEnabled(context: Context) = schedulePeriodic(context)

    override fun onDisabled(context: Context) = cancelPeriodic(context)

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        appWidgetIds.forEach { id -> WidgetStyle.clear(context, id) }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == refreshAction) {
            WidgetChrome.showRefreshing(context, javaClass, layoutId)
            refreshNow(context)
        }
    }
}

/** Worker side: fetch (with offline fallback), draw, and retry briefly when the network failed. */
abstract class DataWidgetWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    protected abstract val function: String
    protected abstract fun push(context: Context, data: WidgetData)

    /** Called with a fresh (not cached) response before it's drawn. */
    protected open fun onFresh(context: Context, json: JSONObject) {}

    override fun doWork(): Result {
        val data = WidgetData.fetch(applicationContext, function)
        if (data is WidgetData.Ready && !data.offline) onFresh(applicationContext, data.json)
        push(applicationContext, data)
        // The last good copy is already on screen; a few quick retries cover "booted before the
        // network was up" and short dead zones without waiting for the next 30-minute run.
        val failed = data is WidgetData.Error || (data is WidgetData.Ready && data.offline)
        return if (failed && runAttemptCount < MAX_RETRIES) Result.retry() else Result.success()
    }

    private companion object {
        const val MAX_RETRIES = 3
    }
}

object WidgetPush {
    /**
     * Builds and pushes one RemoteViews per instance — per instance because row count and
     * opacity depend on that instance's own size and settings. Never throws: the widget host
     * aborts adding a widget if onUpdate() throws, so a render bug shows up as an error card.
     */
    fun push(
        context: Context,
        provider: Class<out AppWidgetProvider>,
        appWidgetIds: IntArray?,
        data: WidgetData,
        build: (Int, WidgetData) -> RemoteViews,
    ) {
        val manager = AppWidgetManager.getInstance(context)
        val ids = appWidgetIds ?: manager.getAppWidgetIds(ComponentName(context, provider))
        for (id in ids) {
            val views = try {
                build(id, data)
            } catch (e: Exception) {
                try {
                    build(id, WidgetData.Error("interne fout: ${e.message}"))
                } catch (_: Exception) {
                    null
                }
            } ?: continue
            manager.updateAppWidget(id, views)
        }
    }
}
