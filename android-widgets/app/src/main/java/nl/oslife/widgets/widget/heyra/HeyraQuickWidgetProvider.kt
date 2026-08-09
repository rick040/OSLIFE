package nl.oslife.widgets.widget.heyra

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.widget.RemoteViews
import nl.oslife.widgets.R
import nl.oslife.widgets.widget.common.WidgetStyle

/**
 * Home-screen "HEYRA quick chat/voice" widget — deliberately static (no
 * periodic network fetch, unlike the other four): there is no passive metric
 * worth polling for here, only two tap targets that both open
 * HeyraQuickChatActivity — the card itself (text mode) and the mic chip
 * (starts listening immediately).
 */
class HeyraQuickWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        val views = buildViews(context)
        appWidgetIds.forEach { id -> appWidgetManager.updateAppWidget(id, WidgetStyle.applyInstanceStyle(context, views, id)) }
    }

    override fun onAppWidgetOptionsChanged(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) {
        super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions)
        appWidgetManager.updateAppWidget(appWidgetId, WidgetStyle.applyInstanceStyle(context, buildViews(context), appWidgetId))
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        appWidgetIds.forEach { id -> WidgetStyle.clear(context, id) }
    }

    companion object {
        // Purely static, but still wrapped — see TopPriorityWidgetProvider for why
        // onUpdate() must never throw uncaught.
        private fun buildViews(context: Context): RemoteViews = try {
            RemoteViews(context.packageName, R.layout.widget_heyra_quick).apply {
                val openChat = PendingIntent.getActivity(
                    context, 0, Intent(context, HeyraQuickChatActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
                setOnClickPendingIntent(R.id.widget_root, openChat)
                setOnClickPendingIntent(R.id.widget_chat_button, openChat)

                val openChatWithVoice = PendingIntent.getActivity(
                    context, 1,
                    Intent(context, HeyraQuickChatActivity::class.java)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        .putExtra(HeyraQuickChatActivity.EXTRA_AUTO_VOICE, true),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
                setOnClickPendingIntent(R.id.widget_mic_button, openChatWithVoice)
            }
        } catch (_: Exception) {
            RemoteViews(context.packageName, R.layout.widget_heyra_quick)
        }

        /** No WorkManager job for this static widget — just rebuild + re-push, e.g. after the
         * opacity slider in WidgetConfigureActivity changes. */
        fun refreshNow(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, HeyraQuickWidgetProvider::class.java))
            val views = buildViews(context)
            ids.forEach { id -> manager.updateAppWidget(id, WidgetStyle.applyInstanceStyle(context, views, id)) }
        }
    }
}
