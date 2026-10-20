package nl.oslife.widgets.widget.inbox

import android.content.Context
import android.view.View
import android.widget.RemoteViews
import androidx.work.WorkerParameters
import nl.oslife.widgets.R
import nl.oslife.widgets.widget.common.DataWidgetWorker
import nl.oslife.widgets.widget.common.DateFmt
import nl.oslife.widgets.widget.common.DeepLink
import nl.oslife.widgets.widget.common.WidgetChrome
import nl.oslife.widgets.widget.common.WidgetData
import nl.oslife.widgets.widget.common.WidgetJobs
import nl.oslife.widgets.widget.common.WidgetPush
import nl.oslife.widgets.widget.common.WidgetStyle
import nl.oslife.widgets.widget.common.str
import nl.oslife.widgets.widget.todo.TaskRows

private val ROW_IDS = intArrayOf(R.id.widget_row1, R.id.widget_row2, R.id.widget_row3, R.id.widget_row4, R.id.widget_row5)
private val FROM_IDS = intArrayOf(R.id.widget_from1, R.id.widget_from2, R.id.widget_from3, R.id.widget_from4, R.id.widget_from5)
private val TIME_IDS = intArrayOf(R.id.widget_time1, R.id.widget_time2, R.id.widget_time3, R.id.widget_time4, R.id.widget_time5)
private val SUBJECT_IDS = intArrayOf(R.id.widget_subject1, R.id.widget_subject2, R.id.widget_subject3, R.id.widget_subject4, R.id.widget_subject5)
private val SNIPPET_IDS = intArrayOf(R.id.widget_snippet1, R.id.widget_snippet2, R.id.widget_snippet3, R.id.widget_snippet4, R.id.widget_snippet5)

class InboxWidgetWorker(context: Context, params: WorkerParameters) : DataWidgetWorker(context, params) {

    override val function = FUNCTION
    override fun push(context: Context, data: WidgetData) = push(context, null, data)

    companion object {
        const val FUNCTION = "widget-inbox"
        private const val UNIQUE_PERIODIC_WORK = "inbox_widget_refresh_periodic"
        private const val UNIQUE_ONE_TIME_WORK = "inbox_widget_refresh_once"
        private const val ROW_HEIGHT_DP = 58
        private const val COMPACT_ROW_HEIGHT_DP = 44

        fun push(context: Context, appWidgetIds: IntArray?, data: WidgetData) =
            WidgetPush.push(context, InboxWidgetProvider::class.java, appWidgetIds, data) { id, d -> buildViews(context, id, d) }

        fun buildViews(context: Context, appWidgetId: Int, data: WidgetData): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_inbox)
            val open = DeepLink.pendingIntent(context, 0, "inbox")
            val json = WidgetChrome.bind(
                context, views, appWidgetId, data,
                InboxWidgetProvider::class.java, InboxWidgetProvider.ACTION_REFRESH, open,
            )
            if (json == null) {
                views.setViewVisibility(R.id.widget_count, View.GONE)
                return views
            }

            val unreadCount = json.optInt("unreadCount", 0)
            views.setViewVisibility(R.id.widget_count, if (unreadCount > 0) View.VISIBLE else View.GONE)
            views.setTextViewText(R.id.widget_count, unreadCount.toString())

            val recent = json.optJSONArray("recent")
            val rows = (0 until (recent?.length() ?: 0)).map { i -> recent!!.getJSONObject(i) }
            if (rows.isEmpty()) {
                WidgetChrome.showEmpty(views, "Inbox zero — geen ongelezen mail.")
                WidgetChrome.setMore(views, null)
                return views
            }

            // Full rows (sender, subject, snippet) when at least three fit; otherwise drop the
            // snippet line so a 4x2 widget shows three mails instead of one and a half.
            val fullCapacity = WidgetStyle.rowCapacity(context, appWidgetId, ROW_HEIGHT_DP, TaskRows.CHROME_DP, ROW_IDS.size)
            val compact = fullCapacity < 3
            val capacity = if (compact) WidgetStyle.rowCapacity(context, appWidgetId, COMPACT_ROW_HEIGHT_DP, TaskRows.CHROME_DP, ROW_IDS.size) else fullCapacity
            val shown = minOf(capacity, rows.size)
            for (i in ROW_IDS.indices) {
                if (i >= shown) {
                    views.setViewVisibility(ROW_IDS[i], View.GONE)
                    continue
                }
                val m = rows[i]
                views.setViewVisibility(ROW_IDS[i], View.VISIBLE)
                val from = m.str("from")?.substringBefore("<")?.trim()?.trim('"')
                views.setTextViewText(FROM_IDS[i], if (from.isNullOrBlank()) "(onbekend)" else from)
                views.setTextViewText(TIME_IDS[i], DateFmt.shortTime(m.str("receivedAt")))
                views.setTextViewText(SUBJECT_IDS[i], m.str("subject") ?: "(geen onderwerp)")
                val snippet = m.str("snippet")
                views.setViewVisibility(SNIPPET_IDS[i], if (snippet == null || compact) View.GONE else View.VISIBLE)
                views.setTextViewText(SNIPPET_IDS[i], snippet ?: "")
                views.setOnClickPendingIntent(ROW_IDS[i], open)
            }
            val hidden = unreadCount - shown
            WidgetChrome.setMore(views, if (hidden > 0) "+$hidden ongelezen" else null)
            return views
        }

        fun refreshNow(context: Context) = WidgetJobs.refreshNow(context, InboxWidgetWorker::class.java, UNIQUE_ONE_TIME_WORK)

        fun schedulePeriodic(context: Context) = WidgetJobs.schedulePeriodic(context, InboxWidgetWorker::class.java, UNIQUE_PERIODIC_WORK)

        fun cancelPeriodic(context: Context) = WidgetJobs.cancel(context, UNIQUE_PERIODIC_WORK)
    }
}
