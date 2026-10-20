package nl.oslife.widgets.widget.finance

import android.content.Context
import android.view.View
import android.widget.RemoteViews
import androidx.work.WorkerParameters
import nl.oslife.widgets.R
import nl.oslife.widgets.widget.common.DataWidgetWorker
import nl.oslife.widgets.widget.common.DateFmt
import nl.oslife.widgets.widget.common.DeepLink
import nl.oslife.widgets.widget.common.WidgetChrome
import nl.oslife.widgets.widget.common.WidgetData
import nl.oslife.widgets.widget.common.WidgetJobs
import nl.oslife.widgets.widget.common.WidgetPush
import nl.oslife.widgets.widget.common.str
import java.util.Locale

class FinanceWidgetWorker(context: Context, params: WorkerParameters) : DataWidgetWorker(context, params) {

    override val function = FUNCTION
    override fun push(context: Context, data: WidgetData) = push(context, null, data)

    companion object {
        const val FUNCTION = "widget-finance"
        private const val UNIQUE_PERIODIC_WORK = "finance_widget_refresh_periodic"
        private const val UNIQUE_ONE_TIME_WORK = "finance_widget_refresh_once"

        fun push(context: Context, appWidgetIds: IntArray?, data: WidgetData) =
            WidgetPush.push(context, FinanceWidgetProvider::class.java, appWidgetIds, data) { id, d -> buildViews(context, id, d) }

        private fun eur(amount: Double): String =
            "€ " + String.format(Locale.forLanguageTag("nl-NL"), "%,.2f", amount)

        fun buildViews(context: Context, appWidgetId: Int, data: WidgetData): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_finance)
            val json = WidgetChrome.bind(
                context, views, appWidgetId, data,
                FinanceWidgetProvider::class.java, FinanceWidgetProvider.ACTION_REFRESH,
                DeepLink.pendingIntent(context, 0, "money"),
            ) ?: return views

            val balance = json.optDouble("balance", Double.NaN)
            views.setTextViewText(R.id.widget_balance, if (!balance.isNaN()) eur(balance) else "€ —")
            views.setTextColor(R.id.widget_balance, context.getColor(if (!balance.isNaN() && balance < 0) R.color.widget_danger else R.color.widget_hero_number))

            val asOf = DateFmt.dayMonth(json.str("balanceAsOf"))
            views.setTextViewText(R.id.widget_balance_asof, if (asOf.isNotEmpty()) "Saldo · stand $asOf" else "Saldo")

            val openPayments = json.optJSONObject("openPayments")
            val count = openPayments?.optInt("count", 0) ?: 0
            val total = openPayments?.optDouble("totalAmount", 0.0) ?: 0.0
            views.setTextViewText(R.id.widget_open_payments, if (count > 0) "$count open · ${eur(total)}" else "Geen open betalingen")

            val urgentCount = json.optInt("urgentCount", 0)
            views.setViewVisibility(R.id.widget_urgent, if (urgentCount > 0) View.VISIBLE else View.GONE)
            views.setTextViewText(R.id.widget_urgent, "$urgentCount urgent")
            return views
        }

        fun refreshNow(context: Context) = WidgetJobs.refreshNow(context, FinanceWidgetWorker::class.java, UNIQUE_ONE_TIME_WORK)

        fun schedulePeriodic(context: Context) = WidgetJobs.schedulePeriodic(context, FinanceWidgetWorker::class.java, UNIQUE_PERIODIC_WORK)

        fun cancelPeriodic(context: Context) = WidgetJobs.cancel(context, UNIQUE_PERIODIC_WORK)
    }
}
