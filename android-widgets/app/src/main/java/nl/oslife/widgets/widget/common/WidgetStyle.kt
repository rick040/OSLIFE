package nl.oslife.widgets.widget.common

import android.appwidget.AppWidgetManager
import android.content.Context
import android.widget.RemoteViews

/**
 * Per-widgetId styling: background opacity (set via WidgetConfigureActivity, the native "Edit
 * widget" entry point) and, for row-list widgets, how many rows fit at the size the user has
 * currently resized that instance to. Both are per appWidgetId (not per widget type) since
 * several instances of the same widget can be pinned at different sizes/opacities side by side.
 */
object WidgetStyle {
    private const val PREFS = "widget_instance_style"
    const val MIN_BACKGROUND = 0
    const val MAX_BACKGROUND = 100

    fun getBackgroundPercent(context: Context, appWidgetId: Int): Int =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getInt(backgroundKey(appWidgetId), MAX_BACKGROUND)
            .coerceIn(MIN_BACKGROUND, MAX_BACKGROUND)

    fun setBackgroundPercent(context: Context, appWidgetId: Int, percent: Int) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putInt(backgroundKey(appWidgetId), percent.coerceIn(MIN_BACKGROUND, MAX_BACKGROUND))
            .apply()
    }

    /** Call from onDeleted() so removed widget instances don't leak prefs forever. */
    fun clear(context: Context, appWidgetId: Int) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .remove(backgroundKey(appWidgetId))
            .apply()
    }

    // Same key as when this setting faded the whole widget, so earlier choices carry over.
    private fun backgroundKey(appWidgetId: Int) = "opacity_$appWidgetId"

    /**
     * Fades only the card (the @android:id/background ImageView every layout starts with) —
     * text and icons stay fully opaque, so even a 0% card stays readable on the wallpaper.
     */
    fun applyBackground(context: Context, views: RemoteViews, appWidgetId: Int) {
        applyBackgroundPercent(views, getBackgroundPercent(context, appWidgetId))
    }

    fun applyBackgroundPercent(views: RemoteViews, percent: Int) {
        views.setInt(android.R.id.background, "setImageAlpha", percent.coerceIn(MIN_BACKGROUND, MAX_BACKGROUND) * 255 / 100)
    }

    /**
     * True when this instance is narrower than [thresholdDp] (portrait width as the launcher
     * reports it), so widgets can drop secondary bits like due-date pills instead of
     * squeezing titles down to "Offe…". Unknown size counts as wide.
     */
    fun isNarrow(context: Context, appWidgetId: Int, thresholdDp: Int = 230): Boolean {
        val widthDp = AppWidgetManager.getInstance(context).getAppWidgetOptions(appWidgetId)
            .getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0)
        return widthDp in 1 until thresholdDp
    }

    /**
     * How many [rowHeightDp]-tall rows fit in this instance at its current size, after
     * [chromeDp] of header/footer/padding. Falls back to [maxRows] when the launcher doesn't
     * report a size.
     */
    fun rowCapacity(context: Context, appWidgetId: Int, rowHeightDp: Int, chromeDp: Int, maxRows: Int): Int {
        val options = AppWidgetManager.getInstance(context).getAppWidgetOptions(appWidgetId)
        val heightDp = maxOf(
            options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0),
            options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0),
        )
        if (heightDp <= 0) return maxRows
        return ((heightDp - chromeDp) / rowHeightDp).coerceIn(1, maxRows)
    }
}
