package nl.oslife.widgets.widget.todo

import android.appwidget.AppWidgetManager
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import nl.oslife.widgets.R
import nl.oslife.widgets.widget.common.DateFmt
import nl.oslife.widgets.widget.common.OslifeWidgetApi
import org.json.JSONObject

class TodoRemoteViewsService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory =
        TodoRemoteViewsFactory(applicationContext, intent)
}

private data class TodoItem(val id: String, val title: String, val due: String?, val priority: String?, val domain: String?)

/**
 * Fetches the widget-tasks snapshot and renders one row per open task. Runs
 * fully synchronously inside onDataSetChanged() — this is the documented
 * contract for RemoteViewsFactory (the OS already calls it off the main
 * thread), same one-fetch-per-refresh model as WidgetUpdateWorker.doWork().
 */
private class TodoRemoteViewsFactory(
    private val context: android.content.Context,
    intent: Intent,
) : RemoteViewsService.RemoteViewsFactory {

    private val appWidgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
    private var items: List<TodoItem> = emptyList()

    override fun onCreate() = Unit

    override fun onDataSetChanged() {
        // Never let this throw: an uncaught exception here leaves the widget host's
        // RemoteViewsAdapter stuck on its default "Laden..." placeholder forever
        // (it never gets a completed metadata fetch to replace it with), which
        // looks identical to "still loading" instead of a visible, retriable error.
        items = try {
            when (val result = OslifeWidgetApi.get(context, "widget-tasks")) {
                is OslifeWidgetApi.Result.Success -> {
                    val arr = result.json.optJSONArray("tasks") ?: org.json.JSONArray()
                    (0 until arr.length()).map { i ->
                        val o = arr.getJSONObject(i)
                        TodoItem(
                            id = o.optString("id"),
                            title = o.optString("title", "(zonder titel)"),
                            due = o.optString("due", null),
                            priority = o.optString("priority", null),
                            domain = o.optString("domain", null),
                        )
                    }
                }
                else -> emptyList()
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    override fun onDestroy() = Unit

    override fun getCount(): Int = items.size

    override fun getViewAt(position: Int): RemoteViews {
        val item = items[position]
        val views = RemoteViews(context.packageName, R.layout.widget_todo_item)
        views.setTextViewText(R.id.todo_title, item.title)

        val dueLabel = DateFmt.relative(item.due)
        val overdue = DateFmt.isOverdue(item.due)
        val meta = buildString {
            if (dueLabel.isNotEmpty()) append(dueLabel)
            if (item.domain != null && item.domain != "personal") {
                if (isNotEmpty()) append(" · ")
                append(item.domain)
            }
        }
        views.setTextViewText(R.id.todo_meta, meta)
        views.setTextColor(R.id.todo_meta, if (overdue) 0xFFEF4444.toInt() else 0xFF9AA0AC.toInt())

        val dotRes = when (item.priority) {
            "High" -> R.drawable.priority_dot_high
            "Medium" -> R.drawable.priority_dot_medium
            else -> R.drawable.priority_dot_low
        }
        views.setInt(R.id.todo_priority_dot, "setBackgroundResource", dotRes)

        // Two tap zones sharing the collection's one PendingIntentTemplate: the
        // checkbox toggles done/open (fillInIntent's own action wins over the
        // template's), tapping the rest of the row opens this task in OSLIFE.
        val toggleFillIn = Intent().setAction(TodoListWidgetProvider.ACTION_TOGGLE)
            .putExtra(TodoListWidgetProvider.EXTRA_TASK_ID, item.id)
        views.setOnClickFillInIntent(R.id.todo_check, toggleFillIn)

        val openFillIn = Intent().setAction(TodoListWidgetProvider.ACTION_OPEN)
            .putExtra(TodoListWidgetProvider.EXTRA_TASK_ID, item.id)
        views.setOnClickFillInIntent(R.id.row_root, openFillIn)

        return views
    }

    override fun getLoadingView(): RemoteViews? = null
    override fun getViewTypeCount(): Int = 1
    override fun getItemId(position: Int): Long = position.toLong()
    override fun hasStableIds(): Boolean = false
}
