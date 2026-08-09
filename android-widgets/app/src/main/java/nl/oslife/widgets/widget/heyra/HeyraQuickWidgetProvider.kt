package nl.oslife.widgets.widget.heyra

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import nl.oslife.widgets.R

/**
 * Home-screen "HEYRA quick chat/voice" widget — deliberately static (no
 * periodic network fetch, unlike the other four): there is no passive metric
 * worth polling for here, only two tap targets that both open
 * HeyraQuickChatActivity — the card itself (text mode) and the mic chip
 * (starts listening immediately).
 */
class HeyraQuickWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        // Purely static, but still wrapped — see TopPriorityWidgetProvider for why
        // onUpdate() must never throw uncaught.
        val views = try {
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

        appWidgetIds.forEach { id -> appWidgetManager.updateAppWidget(id, views) }
    }
}
