package nl.oslife.walktracker.widget.heyra

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import nl.oslife.walktracker.R

/**
 * Home-screen "HEYRA quick chat/voice" widget — deliberately static (no
 * periodic network fetch, unlike the other four): there is no passive metric
 * worth polling for here, only two tap targets that both open
 * HeyraQuickChatActivity — the card itself (text mode) and the mic chip
 * (starts listening immediately).
 */
class HeyraQuickWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        val views = RemoteViews(context.packageName, R.layout.widget_heyra_quick)

        val openChat = PendingIntent.getActivity(
            context, 0, Intent(context, HeyraQuickChatActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        views.setOnClickPendingIntent(R.id.widget_root, openChat)

        val openChatWithVoice = PendingIntent.getActivity(
            context, 1,
            Intent(context, HeyraQuickChatActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                .putExtra(HeyraQuickChatActivity.EXTRA_AUTO_VOICE, true),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        views.setOnClickPendingIntent(R.id.widget_mic_button, openChatWithVoice)

        appWidgetIds.forEach { id -> appWidgetManager.updateAppWidget(id, views) }
    }
}
