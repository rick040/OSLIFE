package nl.oslife.widgets.widget.quickactions

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import android.widget.RemoteViews
import nl.oslife.widgets.R
import nl.oslife.widgets.widget.common.CaptureIntents
import nl.oslife.widgets.widget.common.DeepLink
import nl.oslife.widgets.widget.common.WidgetStyle

/**
 * Home-screen "Snelle acties" widget: a slim 4x1 bar with five one-tap actions — type a note,
 * speak one, ask HEYRA, upload a file, open OSLIFE. Static like the HEYRA widget: nothing to
 * fetch, so no WorkManager job, just tap targets.
 */
class QuickActionsWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        push(context, appWidgetIds)
    }

    override fun onAppWidgetOptionsChanged(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) {
        super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions)
        push(context, intArrayOf(appWidgetId))
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        appWidgetIds.forEach { id -> WidgetStyle.clear(context, id) }
    }

    companion object {
        fun buildViews(context: Context, appWidgetId: Int): RemoteViews =
            RemoteViews(context.packageName, R.layout.widget_quick_actions).apply {
                WidgetStyle.applyBackground(context, this, appWidgetId)
                setOnClickPendingIntent(R.id.widget_action_note, CaptureIntents.note(context))
                setOnClickPendingIntent(R.id.widget_action_voice, CaptureIntents.voice(context))
                setOnClickPendingIntent(R.id.widget_action_heyra, CaptureIntents.heyra(context))
                setOnClickPendingIntent(R.id.widget_action_upload, CaptureIntents.upload(context))
                setOnClickPendingIntent(R.id.widget_action_open, DeepLink.pendingIntent(context, 0, "dashboard"))
            }

        fun refreshNow(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            push(context, manager.getAppWidgetIds(ComponentName(context, QuickActionsWidgetProvider::class.java)))
        }

        // Static, but still guarded — the widget host aborts adding a widget if onUpdate() throws.
        private fun push(context: Context, appWidgetIds: IntArray) {
            val manager = AppWidgetManager.getInstance(context)
            appWidgetIds.forEach { id ->
                val views = try { buildViews(context, id) } catch (_: Exception) { RemoteViews(context.packageName, R.layout.widget_quick_actions) }
                manager.updateAppWidget(id, views)
            }
        }
    }
}
