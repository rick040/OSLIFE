package nl.oslife.widgets.widget.todo

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.text.SpannableString
import android.text.Spanned
import android.text.style.StrikethroughSpan
import android.view.View
import android.widget.RemoteViews
import nl.oslife.widgets.R
import nl.oslife.widgets.widget.common.DateFmt
import nl.oslife.widgets.widget.common.DeepLink
import nl.oslife.widgets.widget.common.WidgetData
import nl.oslife.widgets.widget.common.str
import nl.oslife.widgets.widget.priority.TopPriorityWidgetWorker
import org.json.JSONObject

internal data class TaskItem(val id: String, val title: String, val due: String?, val priority: String?)

/**
 * The to-do and "Belangrijkste" widgets both draw widget-tasks rows, so the parsing, the row
 * anatomy (priority ring = checkbox, title, due pill) and the optimistic tick-off live here once.
 * Both widgets are also always redrawn together from the same response — tick a task off in one
 * and the other one updates too.
 */
internal object TaskRows {
    const val FUNCTION = "widget-tasks"

    /** Row height and header/footer/padding used for WidgetStyle.rowCapacity (see widget_styles.xml). */
    const val ROW_HEIGHT_DP = 36
    const val CHROME_DP = 70

    class Ids(val rows: IntArray, val checks: IntArray, val titles: IntArray, val dues: IntArray)

    fun parse(json: JSONObject?): List<TaskItem> {
        val tasks = json?.optJSONArray("tasks") ?: return emptyList()
        return (0 until tasks.length()).map {
            val o = tasks.getJSONObject(it)
            TaskItem(
                id = o.optString("id"),
                title = o.str("title") ?: "(zonder titel)",
                due = o.str("due"),
                priority = o.str("priority"),
            )
        }
    }

    /** Redraw both task widgets — after a fetch, or right after a tap ticked something off. */
    fun pushAll(context: Context, data: WidgetData) {
        TodoWidgetWorker.push(context, null, data)
        TopPriorityWidgetWorker.push(context, null, data)
    }

    /**
     * Draws the first [shown] of [items] into the row slots and hides the rest. [compact] (a
     * narrow 2-column widget) drops the due pills so titles keep their room; overdue tasks then
     * show it in the title color instead.
     */
    fun render(context: Context, views: RemoteViews, ids: Ids, items: List<TaskItem>, shown: Int, done: Set<String>, compact: Boolean = false) {
        for (i in ids.rows.indices) {
            if (i >= shown || i >= items.size) {
                views.setViewVisibility(ids.rows[i], View.GONE)
                continue
            }
            val item = items[i]
            val isDone = item.id in done
            views.setViewVisibility(ids.rows[i], View.VISIBLE)

            if (isDone) {
                val struck = SpannableString(item.title)
                struck.setSpan(StrikethroughSpan(), 0, struck.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                views.setTextViewText(ids.titles[i], struck)
                views.setTextColor(ids.titles[i], context.getColor(R.color.widget_text_tertiary))
                views.setImageViewResource(ids.checks[i], R.drawable.ic_w_task_done)
                views.setContentDescription(ids.checks[i], "Gedaan — tik om ongedaan te maken")
                views.setViewVisibility(ids.dues[i], View.GONE)
            } else {
                val overdueTitle = compact && DateFmt.isOverdue(item.due)
                views.setTextViewText(ids.titles[i], item.title)
                views.setTextColor(ids.titles[i], context.getColor(if (overdueTitle) R.color.widget_danger else R.color.widget_text_primary))
                views.setImageViewResource(ids.checks[i], ringFor(item.priority))
                views.setContentDescription(ids.checks[i], "Afvinken: ${item.title}")
                if (compact) views.setViewVisibility(ids.dues[i], View.GONE) else bindDue(context, views, ids.dues[i], item.due)
            }

            views.setOnClickPendingIntent(ids.checks[i], togglePendingIntent(context, item.id))
            views.setOnClickPendingIntent(ids.rows[i], DeepLink.pendingIntent(context, 400 + i, "tasks", item.id))
        }
    }

    private fun ringFor(priority: String?) = when (priority) {
        "High" -> R.drawable.ic_w_task_open_high
        "Medium" -> R.drawable.ic_w_task_open_medium
        else -> R.drawable.ic_w_task_open_low
    }

    fun bindDue(context: Context, views: RemoteViews, viewId: Int, due: String?) {
        val label = DateFmt.relative(due)
        if (label.isEmpty()) {
            views.setViewVisibility(viewId, View.GONE)
            return
        }
        val overdue = DateFmt.isOverdue(due)
        views.setViewVisibility(viewId, View.VISIBLE)
        views.setTextViewText(viewId, label)
        views.setInt(viewId, "setBackgroundResource", if (overdue) R.drawable.pill_danger else R.drawable.pill_glass)
        views.setTextColor(viewId, context.getColor(if (overdue) R.color.widget_danger else R.color.widget_text_secondary))
    }

    // The data URI makes each task's PendingIntent distinct (extras alone don't).
    private fun togglePendingIntent(context: Context, taskId: String): PendingIntent {
        val intent = Intent(context, TodoListWidgetProvider::class.java).apply {
            action = TodoListWidgetProvider.ACTION_TOGGLE
            data = Uri.parse("todowidget://toggle/${Uri.encode(taskId)}")
            putExtra(TodoListWidgetProvider.EXTRA_TASK_ID, taskId)
        }
        return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
}
