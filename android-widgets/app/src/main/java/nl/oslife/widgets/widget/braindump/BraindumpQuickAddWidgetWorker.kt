package nl.oslife.widgets.widget.braindump

import android.content.Context
import android.widget.RemoteViews
import androidx.work.WorkerParameters
import nl.oslife.widgets.R
import nl.oslife.widgets.widget.common.CaptureIntents
import nl.oslife.widgets.widget.common.DataWidgetWorker
import nl.oslife.widgets.widget.common.WidgetChrome
import nl.oslife.widgets.widget.common.WidgetData
import nl.oslife.widgets.widget.common.WidgetJobs
import nl.oslife.widgets.widget.common.WidgetPush

class BraindumpQuickAddWidgetWorker(context: Context, params: WorkerParameters) : DataWidgetWorker(context, params) {

    override val function = FUNCTION
    override fun push(context: Context, data: WidgetData) = push(context, null, data)

    companion object {
        const val FUNCTION = "widget-braindump-add"
        private const val UNIQUE_PERIODIC_WORK = "braindump_widget_refresh_periodic"
        private const val UNIQUE_ONE_TIME_WORK = "braindump_widget_refresh_once"

        fun push(context: Context, appWidgetIds: IntArray?, data: WidgetData) =
            WidgetPush.push(context, BraindumpQuickAddWidgetProvider::class.java, appWidgetIds, data) { id, d -> buildViews(context, id, d) }

        fun buildViews(context: Context, appWidgetId: Int, data: WidgetData): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_braindump_add)
            // The shortcuts work in every state — a capture made offline queues until it can upload.
            views.setOnClickPendingIntent(R.id.widget_shortcut_chat, CaptureIntents.note(context))
            views.setOnClickPendingIntent(R.id.widget_shortcut_talk, CaptureIntents.voice(context))
            views.setOnClickPendingIntent(R.id.widget_shortcut_upload, CaptureIntents.upload(context))

            val json = WidgetChrome.bind(
                context, views, appWidgetId, data,
                BraindumpQuickAddWidgetProvider::class.java, BraindumpQuickAddWidgetProvider.ACTION_REFRESH,
                CaptureIntents.note(context),
            ) ?: return views

            val count = json.optInt("todayCount", 0)
            views.setTextViewText(R.id.widget_count_today, count.toString())
            views.setTextViewText(R.id.widget_caption, if (count == 1) "notitie vandaag vastgelegd" else "notities vandaag vastgelegd")
            return views
        }

        fun refreshNow(context: Context) = WidgetJobs.refreshNow(context, BraindumpQuickAddWidgetWorker::class.java, UNIQUE_ONE_TIME_WORK)

        fun schedulePeriodic(context: Context) = WidgetJobs.schedulePeriodic(context, BraindumpQuickAddWidgetWorker::class.java, UNIQUE_PERIODIC_WORK)

        fun cancelPeriodic(context: Context) = WidgetJobs.cancel(context, UNIQUE_PERIODIC_WORK)
    }
}
