package nl.oslife.widgets.widget.finance

import android.content.Context
import nl.oslife.widgets.R
import nl.oslife.widgets.widget.common.DataWidgetProvider
import nl.oslife.widgets.widget.common.WidgetData

/**
 * Home-screen "Financiën" widget: current balance, open and urgent payments
 * (widget-finance edge function).
 */
class FinanceWidgetProvider : DataWidgetProvider() {

    override val function = FinanceWidgetWorker.FUNCTION
    override val layoutId = R.layout.widget_finance
    override val refreshAction = ACTION_REFRESH

    override fun push(context: Context, appWidgetIds: IntArray?, data: WidgetData) = FinanceWidgetWorker.push(context, appWidgetIds, data)
    override fun refreshNow(context: Context) = FinanceWidgetWorker.refreshNow(context)
    override fun schedulePeriodic(context: Context) = FinanceWidgetWorker.schedulePeriodic(context)
    override fun cancelPeriodic(context: Context) = FinanceWidgetWorker.cancelPeriodic(context)

    companion object {
        const val ACTION_REFRESH = "nl.oslife.widgets.widget.finance.ACTION_REFRESH"
    }
}
