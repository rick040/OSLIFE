package nl.oslife.widgets.widget.todo

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import nl.oslife.widgets.R
import nl.oslife.widgets.widget.common.DeepLink

/**
 * Home-screen "To-do lijst" widget: a real scrollable list of open tasks
 * (widget-tasks edge function), one row per task with a tap-to-complete
 * checkbox. Unlike the flat glance widgets (priority/projects), this one
 * needs a RemoteViewsService/Factory collection — see TodoRemoteViewsService.
 */
class TodoListWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        appWidgetIds.forEach { id -> updateOne(context, appWidgetManager, id) }
    }

    override fun onEnabled(context: Context) {
        TodoWidgetRefreshWorker.schedulePeriodic(context)
    }

    override fun onDisabled(context: Context) {
        TodoWidgetRefreshWorker.cancelPeriodic(context)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        when (intent.action) {
            ACTION_REFRESH -> notifyListChanged(context)
            ACTION_TOGGLE -> {
                val taskId = intent.getStringExtra(EXTRA_TASK_ID) ?: return
                TodoToggleWorker.enqueue(context, taskId)
            }
            ACTION_OPEN -> {
                val taskId = intent.getStringExtra(EXTRA_TASK_ID) ?: return
                context.startActivity(DeepLink.intent(context, "tasks", taskId))
            }
        }
    }

    companion object {
        const val ACTION_REFRESH = "nl.oslife.widgets.widget.todo.ACTION_REFRESH"
        const val ACTION_TOGGLE = "nl.oslife.widgets.widget.todo.ACTION_TOGGLE"
        const val ACTION_OPEN = "nl.oslife.widgets.widget.todo.ACTION_OPEN"
        const val EXTRA_TASK_ID = "task_id"

        private fun updateOne(context: Context, manager: AppWidgetManager, appWidgetId: Int) {
            val views = RemoteViews(context.packageName, R.layout.widget_todo_list)

            val serviceIntent = Intent(context, TodoRemoteViewsService::class.java).apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
                data = Uri.parse("content://widget/todo/$appWidgetId")
            }
            views.setRemoteAdapter(R.id.todo_list, serviceIntent)
            views.setEmptyView(R.id.todo_list, R.id.empty_view)

            // Best-effort: a failure wiring up click targets must never stop the list itself
            // (setRemoteAdapter above) from reaching the widget host — an un-clickable but
            // populated list beats one silently stuck on its blank placeholder forever.
            try {
                val toggleTemplate = Intent(context, TodoListWidgetProvider::class.java).apply { action = ACTION_TOGGLE }
                val togglePendingIntent = android.app.PendingIntent.getBroadcast(
                    context, 0, toggleTemplate,
                    android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_MUTABLE,
                )
                views.setPendingIntentTemplate(R.id.todo_list, togglePendingIntent)

                views.setOnClickPendingIntent(R.id.widget_root, DeepLink.pendingIntent(context, 0, "tasks"))

                val refreshIntent = Intent(context, TodoListWidgetProvider::class.java).apply { action = ACTION_REFRESH }
                val refreshPendingIntent = android.app.PendingIntent.getBroadcast(
                    context, 0, refreshIntent,
                    android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE,
                )
                views.setOnClickPendingIntent(R.id.widget_refresh, refreshPendingIntent)
            } catch (_: Exception) {
                // views.setRemoteAdapter()/setEmptyView() above already succeeded — still push those.
            }

            manager.updateAppWidget(appWidgetId, views)
        }

        fun notifyListChanged(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, TodoListWidgetProvider::class.java))
            manager.notifyAppWidgetViewDataChanged(ids, R.id.todo_list)
        }
    }
}
