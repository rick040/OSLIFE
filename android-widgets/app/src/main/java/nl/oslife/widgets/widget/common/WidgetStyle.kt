package nl.oslife.widgets.widget.common

import android.appwidget.AppWidgetManager
import android.content.Context
import android.os.Build
import android.view.View
import android.widget.RemoteViews
import nl.oslife.widgets.R

/**
 * Per-widgetId styling: opacity (set via WidgetConfigureActivity, the native
 * "Edit widget" entry point) and, for row-list widgets, how many rows fit at
 * the size the user has currently resized that instance to. Both are stored
 * per appWidgetId (not per widget type) since several instances of the same
 * widget can be pinned at different sizes/opacities side by side.
 */
object WidgetStyle {
    private const val PREFS = "widget_instance_style"
    private const val MIN_OPACITY = 40
    private const val MAX_OPACITY = 100

    fun getOpacityPercent(context: Context, appWidgetId: Int): Int =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getInt(opacityKey(appWidgetId), MAX_OPACITY)

    fun setOpacityPercent(context: Context, appWidgetId: Int, percent: Int) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putInt(opacityKey(appWidgetId), percent.coerceIn(MIN_OPACITY, MAX_OPACITY))
            .apply()
    }

    /** Call from onDeleted() so removed widget instances don't leak prefs forever. */
    fun clear(context: Context, appWidgetId: Int) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .remove(opacityKey(appWidgetId))
            .apply()
    }

    private fun opacityKey(appWidgetId: Int) = "opacity_$appWidgetId"

    /**
     * Returns a per-instance copy of [base] with this widgetId's saved opacity applied and,
     * if [rowIds] is given, any rows beyond what this instance's current on-screen height can
     * fit hidden. Never mutates [base] itself — several instances at different sizes/opacities
     * are pushed from the same base RemoteViews and must not bleed into each other.
     */
    fun applyInstanceStyle(
        context: Context,
        base: RemoteViews,
        appWidgetId: Int,
        rowIds: IntArray? = null,
        rowHeightDp: Int = 0,
        chromeDp: Int = 0,
    ): RemoteViews {
        // RemoteViews' copy constructor was added in API 28; on the rare pre-Pie device fall
        // back to the shared instance — opacity/row-count then apply identically to every
        // pinned instance of that widget instead of independently, a safe degradation.
        val instance = if (Build.VERSION.SDK_INT >= 28) RemoteViews(base) else base

        if (rowIds != null && rowHeightDp > 0) {
            val visible = visibleRowCount(context, appWidgetId, rowHeightDp, chromeDp, rowIds.size)
            for (i in rowIds.indices) {
                if (i >= visible) instance.setViewVisibility(rowIds[i], View.GONE)
            }
        }

        val opacity = getOpacityPercent(context, appWidgetId).coerceIn(MIN_OPACITY, MAX_OPACITY)
        instance.setFloat(R.id.widget_root, "setAlpha", if (opacity < MAX_OPACITY) opacity / 100f else 1f)

        return instance
    }

    private fun visibleRowCount(
        context: Context,
        appWidgetId: Int,
        rowHeightDp: Int,
        chromeDp: Int,
        maxRows: Int,
    ): Int {
        val options = AppWidgetManager.getInstance(context).getAppWidgetOptions(appWidgetId)
        val heightDp = maxOf(
            options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0),
            options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0),
        )
        if (heightDp <= 0) return maxRows
        val usable = heightDp - chromeDp
        if (usable <= 0) return 1
        return (usable / rowHeightDp).coerceIn(1, maxRows)
    }
}
