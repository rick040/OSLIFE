package nl.oslife.widgets.widget.calendar

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
import java.time.LocalTime

private val ROW_IDS = intArrayOf(R.id.widget_row1, R.id.widget_row2, R.id.widget_row3, R.id.widget_row4, R.id.widget_row5, R.id.widget_row6, R.id.widget_row7, R.id.widget_row8)
private val BAR_IDS = intArrayOf(R.id.widget_bar1, R.id.widget_bar2, R.id.widget_bar3, R.id.widget_bar4, R.id.widget_bar5, R.id.widget_bar6, R.id.widget_bar7, R.id.widget_bar8)
private val TITLE_IDS = intArrayOf(R.id.widget_title1, R.id.widget_title2, R.id.widget_title3, R.id.widget_title4, R.id.widget_title5, R.id.widget_title6, R.id.widget_title7, R.id.widget_title8)
private val TIME_IDS = intArrayOf(R.id.widget_time1, R.id.widget_time2, R.id.widget_time3, R.id.widget_time4, R.id.widget_time5, R.id.widget_time6, R.id.widget_time7, R.id.widget_time8)

class CalendarWidgetWorker(context: Context, params: WorkerParameters) : DataWidgetWorker(context, params) {

    override val function = FUNCTION
    override fun push(context: Context, data: WidgetData) = push(context, null, data)

    companion object {
        const val FUNCTION = "widget-calendar"
        private const val UNIQUE_PERIODIC_WORK = "calendar_widget_refresh_periodic"
        private const val UNIQUE_ONE_TIME_WORK = "calendar_widget_refresh_once"
        private const val ROW_HEIGHT_DP = 44

        fun push(context: Context, appWidgetIds: IntArray?, data: WidgetData) =
            WidgetPush.push(context, CalendarWidgetProvider::class.java, appWidgetIds, data) { id, d -> buildViews(context, id, d) }

        fun buildViews(context: Context, appWidgetId: Int, data: WidgetData, now: LocalTime = LocalTime.now()): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_calendar)
            val open = DeepLink.pendingIntent(context, 0, "daybuilder")
            val json = WidgetChrome.bind(
                context, views, appWidgetId, data,
                CalendarWidgetProvider::class.java, CalendarWidgetProvider.ACTION_REFRESH, open,
            ) ?: return views

            val blocks = json.optJSONArray("blocks")
            // widget-calendar already drops finished blocks (same end-or-start rule), but a cached
            // copy can be hours old.
            val items = (0 until (blocks?.length() ?: 0)).map { i -> blocks!!.getJSONObject(i) }
                .filter { b ->
                    val until = DateFmt.time(b.str("endTime")) ?: DateFmt.time(b.str("startTime"))
                    until == null || !until.isBefore(now)
                }
            if (items.isEmpty()) {
                WidgetChrome.showEmpty(views, "Niets meer op de agenda vandaag.")
                WidgetChrome.setMore(views, null)
                return views
            }

            val shown = minOf(WidgetStyle.rowCapacity(context, appWidgetId, ROW_HEIGHT_DP, TaskRows.CHROME_DP, ROW_IDS.size), items.size)
            for (i in ROW_IDS.indices) {
                if (i >= shown) {
                    views.setViewVisibility(ROW_IDS[i], View.GONE)
                    continue
                }
                val b = items[i]
                val start = DateFmt.time(b.str("startTime"))
                val end = DateFmt.time(b.str("endTime"))
                val isNow = start != null && end != null && !start.isAfter(now) && end.isAfter(now)

                views.setViewVisibility(ROW_IDS[i], View.VISIBLE)
                views.setTextViewText(TITLE_IDS[i], b.str("title") ?: "(geen titel)")
                views.setTextViewText(TIME_IDS[i], when {
                    isNow -> "Nu · tot ${hhmm(end!!)}"
                    start != null && end != null -> "${hhmm(start)} – ${hhmm(end)}"
                    start != null -> hhmm(start)
                    else -> "Hele dag"
                })
                views.setTextColor(TIME_IDS[i], context.getColor(if (isNow) R.color.widget_accent_calendar else R.color.widget_text_tertiary))
                views.setInt(BAR_IDS[i], "setImageAlpha", if (isNow) 255 else 110)
                views.setOnClickPendingIntent(ROW_IDS[i], open)
            }
            WidgetChrome.setMore(views, if (items.size > shown) "+${items.size - shown} later" else null)
            return views
        }

        private fun hhmm(t: LocalTime) = String.format("%02d:%02d", t.hour, t.minute)

        fun refreshNow(context: Context) = WidgetJobs.refreshNow(context, CalendarWidgetWorker::class.java, UNIQUE_ONE_TIME_WORK)

        fun schedulePeriodic(context: Context) = WidgetJobs.schedulePeriodic(context, CalendarWidgetWorker::class.java, UNIQUE_PERIODIC_WORK)

        fun cancelPeriodic(context: Context) = WidgetJobs.cancel(context, UNIQUE_PERIODIC_WORK)
    }
}
