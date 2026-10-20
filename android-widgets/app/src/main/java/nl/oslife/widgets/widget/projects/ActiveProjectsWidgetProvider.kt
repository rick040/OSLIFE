package nl.oslife.widgets.widget.projects

import android.content.Context
import nl.oslife.widgets.R
import nl.oslife.widgets.widget.common.DataWidgetProvider
import nl.oslife.widgets.widget.common.WidgetData

/**
 * Home-screen "Actieve projecten" widget: active projects with deadline and progress
 * (widget-projects edge function); tap a project to open it in OSLIFE.
 */
class ActiveProjectsWidgetProvider : DataWidgetProvider() {

    override val function = ActiveProjectsWidgetWorker.FUNCTION
    override val layoutId = R.layout.widget_active_projects
    override val refreshAction = ACTION_REFRESH

    override fun push(context: Context, appWidgetIds: IntArray?, data: WidgetData) = ActiveProjectsWidgetWorker.push(context, appWidgetIds, data)
    override fun refreshNow(context: Context) = ActiveProjectsWidgetWorker.refreshNow(context)
    override fun schedulePeriodic(context: Context) = ActiveProjectsWidgetWorker.schedulePeriodic(context)
    override fun cancelPeriodic(context: Context) = ActiveProjectsWidgetWorker.cancelPeriodic(context)

    companion object {
        const val ACTION_REFRESH = "nl.oslife.widgets.widget.projects.ACTION_REFRESH"
    }
}
