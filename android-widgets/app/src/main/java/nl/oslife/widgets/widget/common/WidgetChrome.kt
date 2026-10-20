package nl.oslife.widgets.widget.common

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews
import nl.oslife.widgets.MainActivity
import nl.oslife.widgets.R
import org.json.JSONObject

/**
 * The parts every data widget draws the same way — background opacity, card tap, ↻ button,
 * footer, and the loading / not-configured / error states — so each widget's own code only
 * deals with its content. Relies on the shared ids from widget_styles.xml layouts:
 * widget_root, @android:id/background, widget_refresh, widget_empty, widget_content,
 * widget_updated, widget_more.
 */
object WidgetChrome {

    /** Returns the JSON to draw, or null when [data] has none and this call drew an empty state. */
    fun bind(
        context: Context,
        views: RemoteViews,
        appWidgetId: Int,
        data: WidgetData,
        provider: Class<out AppWidgetProvider>,
        refreshAction: String,
        open: PendingIntent,
    ): JSONObject? {
        WidgetStyle.applyBackground(context, views, appWidgetId)
        views.setOnClickPendingIntent(R.id.widget_root, open)
        views.setOnClickPendingIntent(R.id.widget_refresh, refreshPendingIntent(context, provider, refreshAction))

        if (data is WidgetData.Ready) {
            views.setViewVisibility(R.id.widget_content, View.VISIBLE)
            views.setViewVisibility(R.id.widget_empty, View.GONE)
            val time = DateFmt.clock(data.fetchedAt)
            views.setTextViewText(R.id.widget_updated, if (data.offline) "Offline · stand van $time" else "Bijgewerkt $time")
            views.setTextColor(R.id.widget_updated, context.getColor(if (data.offline) R.color.widget_warning else R.color.widget_text_tertiary))
            return data.json
        }

        val message = when (data) {
            is WidgetData.Error -> "Kon niet laden (${data.message}). Tik ↻ om het opnieuw te proberen."
            WidgetData.NotConfigured -> "Nog niet ingesteld — tik hier om de app te openen."
            else -> "Laden…"
        }
        if (data == WidgetData.NotConfigured) views.setOnClickPendingIntent(R.id.widget_root, openAppPendingIntent(context))
        showEmpty(views, message)
        views.setTextViewText(R.id.widget_updated, "")
        views.setViewVisibility(R.id.widget_more, View.GONE)
        return null
    }

    /** Swap the content area for a single line of text ("Niets meer vandaag", an error...). */
    fun showEmpty(views: RemoteViews, message: String) {
        views.setViewVisibility(R.id.widget_content, View.GONE)
        views.setViewVisibility(R.id.widget_empty, View.VISIBLE)
        views.setTextViewText(R.id.widget_empty, message)
    }

    /** "+3 meer" at the end of the footer line, hidden when nothing is cut off. */
    fun setMore(views: RemoteViews, label: String?) {
        if (label.isNullOrEmpty()) {
            views.setViewVisibility(R.id.widget_more, View.GONE)
        } else {
            views.setViewVisibility(R.id.widget_more, View.VISIBLE)
            views.setTextViewText(R.id.widget_more, label)
        }
    }

    /** Instant feedback on ↻: a partial update only touches the footer, the data stays. */
    fun showRefreshing(context: Context, provider: Class<*>, layoutId: Int) {
        val manager = AppWidgetManager.getInstance(context)
        val ids = manager.getAppWidgetIds(ComponentName(context, provider))
        if (ids.isEmpty()) return
        val views = RemoteViews(context.packageName, layoutId)
        views.setTextViewText(R.id.widget_updated, "Verversen…")
        views.setTextColor(R.id.widget_updated, context.getColor(R.color.widget_text_tertiary))
        manager.partiallyUpdateAppWidget(ids, views)
    }

    fun refreshPendingIntent(context: Context, provider: Class<*>, action: String): PendingIntent =
        PendingIntent.getBroadcast(
            context, 0, Intent(context, provider).setAction(action),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    fun openAppPendingIntent(context: Context): PendingIntent =
        PendingIntent.getActivity(
            context, 9_000, Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
}
