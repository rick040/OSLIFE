package nl.oslife.widgets.widget.common

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.os.Bundle
import android.view.View
import android.widget.SeekBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import nl.oslife.widgets.R
import nl.oslife.widgets.widget.braindump.BraindumpQuickAddWidgetProvider
import nl.oslife.widgets.widget.braindump.BraindumpQuickAddWidgetWorker
import nl.oslife.widgets.widget.calendar.CalendarWidgetProvider
import nl.oslife.widgets.widget.calendar.CalendarWidgetWorker
import nl.oslife.widgets.widget.finance.FinanceWidgetProvider
import nl.oslife.widgets.widget.finance.FinanceWidgetWorker
import nl.oslife.widgets.widget.health.HealthWidgetProvider
import nl.oslife.widgets.widget.health.HealthWidgetWorker
import nl.oslife.widgets.widget.heyra.HeyraQuickWidgetProvider
import nl.oslife.widgets.widget.inbox.InboxWidgetProvider
import nl.oslife.widgets.widget.inbox.InboxWidgetWorker
import nl.oslife.widgets.widget.priority.TopPriorityWidgetProvider
import nl.oslife.widgets.widget.priority.TopPriorityWidgetWorker
import nl.oslife.widgets.widget.projects.ActiveProjectsWidgetProvider
import nl.oslife.widgets.widget.projects.ActiveProjectsWidgetWorker
import nl.oslife.widgets.widget.todo.TodoListWidgetProvider
import nl.oslife.widgets.widget.todo.TodoWidgetWorker

/**
 * The native "Edit widget" screen: every widget declares android:configure pointing here, so
 * long-pressing any OSLIFE widget → Edit (same affordance Samsung/Pixel launchers already use
 * for their own widgets' transparency sliders) opens this, and the OS also opens it once right
 * after a widget is first placed — a platform requirement of declaring android:configure at all,
 * not something this screen can opt out of per-widget.
 */
class WidgetConfigureActivity : AppCompatActivity() {

    private var appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setResult(Activity.RESULT_CANCELED)
        setContentView(R.layout.activity_widget_configure)

        appWidgetId = intent?.extras?.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
            ?: AppWidgetManager.INVALID_APPWIDGET_ID
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }

        val seekBar = findViewById<SeekBar>(R.id.opacitySeekBar)
        val label = findViewById<TextView>(R.id.opacityLabel)

        val current = WidgetStyle.getOpacityPercent(this, appWidgetId)
        seekBar.progress = (current - MIN_OPACITY).coerceIn(0, seekBar.max)
        label.text = "$current%"

        seekBar.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(sb: SeekBar, value: Int, fromUser: Boolean) {
                label.text = "${MIN_OPACITY + value}%"
            }
            override fun onStartTrackingTouch(sb: SeekBar) {}
            override fun onStopTrackingTouch(sb: SeekBar) {}
        })

        findViewById<View>(R.id.cancelButton).setOnClickListener { finish() }
        findViewById<View>(R.id.saveButton).setOnClickListener {
            WidgetStyle.setOpacityPercent(this, appWidgetId, MIN_OPACITY + seekBar.progress)
            refreshOwningWidget(appWidgetId)
            setResult(Activity.RESULT_OK, intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId))
            finish()
        }
    }

    private fun refreshOwningWidget(appWidgetId: Int) {
        val provider = try {
            AppWidgetManager.getInstance(this).getAppWidgetInfo(appWidgetId)?.provider
        } catch (_: Exception) {
            null
        } ?: return

        when (provider.className) {
            TodoListWidgetProvider::class.java.name -> TodoWidgetWorker.refreshNow(this)
            TopPriorityWidgetProvider::class.java.name -> TopPriorityWidgetWorker.refreshNow(this)
            ActiveProjectsWidgetProvider::class.java.name -> ActiveProjectsWidgetWorker.refreshNow(this)
            BraindumpQuickAddWidgetProvider::class.java.name -> BraindumpQuickAddWidgetWorker.refreshNow(this)
            HealthWidgetProvider::class.java.name -> HealthWidgetWorker.refreshNow(this)
            FinanceWidgetProvider::class.java.name -> FinanceWidgetWorker.refreshNow(this)
            InboxWidgetProvider::class.java.name -> InboxWidgetWorker.refreshNow(this)
            CalendarWidgetProvider::class.java.name -> CalendarWidgetWorker.refreshNow(this)
            HeyraQuickWidgetProvider::class.java.name -> HeyraQuickWidgetProvider.refreshNow(this)
        }
    }

    companion object {
        private const val MIN_OPACITY = 40
    }
}
