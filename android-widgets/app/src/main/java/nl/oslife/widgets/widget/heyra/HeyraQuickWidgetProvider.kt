package nl.oslife.widgets.widget.heyra

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import android.widget.RemoteViews
import nl.oslife.widgets.R
import nl.oslife.widgets.widget.common.CaptureIntents
import nl.oslife.widgets.widget.common.WidgetStyle

/**
 * Home-screen "HEYRA quick chat/voice" widget — deliberately static (no
 * periodic network fetch, unlike the data widgets): there is no passive metric
 * worth polling for here, only two tap targets that both open
 * HeyraQuickChatActivity — the card / wide button (text mode) and the mic
 * (starts listening immediately).
 */
class HeyraQuickWidgetProvider : AppWidgetProvider() {

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
            RemoteViews(context.packageName, R.layout.widget_heyra_quick).apply {
                WidgetStyle.applyBackground(context, this, appWidgetId)
                setOnClickPendingIntent(R.id.widget_root, CaptureIntents.heyra(context))
                setOnClickPendingIntent(R.id.widget_chat_button, CaptureIntents.heyra(context))
                setOnClickPendingIntent(R.id.widget_mic_button, CaptureIntents.heyraVoice(context))
            }

        /** Re-push every instance, e.g. after the opacity slider in WidgetConfigureActivity changes. */
        fun refreshNow(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            push(context, manager.getAppWidgetIds(ComponentName(context, HeyraQuickWidgetProvider::class.java)))
        }

        // Purely static, but still guarded — the widget host aborts adding a widget if onUpdate() throws.
        private fun push(context: Context, appWidgetIds: IntArray) {
            val manager = AppWidgetManager.getInstance(context)
            appWidgetIds.forEach { id ->
                val views = try { buildViews(context, id) } catch (_: Exception) { RemoteViews(context.packageName, R.layout.widget_heyra_quick) }
                manager.updateAppWidget(id, views)
            }
        }
    }
}
