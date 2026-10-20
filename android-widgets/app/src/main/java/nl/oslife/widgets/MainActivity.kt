package nl.oslife.widgets

import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import nl.oslife.widgets.databinding.ActivityMainBinding
import nl.oslife.widgets.widget.braindump.BraindumpQuickAddWidgetWorker
import nl.oslife.widgets.widget.calendar.CalendarWidgetWorker
import nl.oslife.widgets.widget.common.OslifeWidgetApi
import nl.oslife.widgets.widget.finance.FinanceWidgetWorker
import nl.oslife.widgets.widget.health.HealthWidgetWorker
import nl.oslife.widgets.widget.heyra.HeyraQuickWidgetProvider
import nl.oslife.widgets.widget.inbox.InboxWidgetWorker
import nl.oslife.widgets.widget.priority.TopPriorityWidgetWorker
import nl.oslife.widgets.widget.projects.ActiveProjectsWidgetWorker
import nl.oslife.widgets.widget.quickactions.QuickActionsWidgetProvider
import nl.oslife.widgets.widget.today.TodayWidgetWorker
import nl.oslife.widgets.widget.todo.TodoWidgetWorker
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: Prefs
    private val io = Executors.newSingleThreadExecutor()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        prefs = Prefs(this)

        binding.oslifeBaseUrlInput.setText(prefs.oslifeFunctionsBaseUrl)
        binding.oslifeSecretInput.setText(prefs.oslifeWidgetSecret)
        binding.oslifeWebAppUrlInput.setText(prefs.oslifeWebAppUrl)

        binding.saveOslifeSettingsButton.setOnClickListener {
            prefs.oslifeFunctionsBaseUrl = binding.oslifeBaseUrlInput.text.toString().trim()
            prefs.oslifeWidgetSecret = binding.oslifeSecretInput.text.toString().trim()
            prefs.oslifeWebAppUrl = binding.oslifeWebAppUrlInput.text.toString().trim()
            testConnection()
        }

        binding.refreshOslifeWidgetsButton.setOnClickListener {
            refreshAllWidgets()
            Toast.makeText(this, "Widgets worden ververst…", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onDestroy() {
        io.shutdown()
        super.onDestroy()
    }

    /** Saves are only useful if they work — try one real call and say so, instead of leaving it to the widgets to fail later. */
    private fun testConnection() {
        showStatus("Opgeslagen — verbinding testen…", R.color.widget_text_tertiary)
        io.execute {
            val result = OslifeWidgetApi.get(this, "widget-summary")
            runOnUiThread {
                if (isFinishing) return@runOnUiThread
                when (result) {
                    is OslifeWidgetApi.Result.Success -> {
                        showStatus("✓ Verbonden — alle widgets worden ververst.", R.color.widget_done)
                        refreshAllWidgets()
                    }
                    is OslifeWidgetApi.Result.NotConfigured -> showStatus("Vul de functions base URL en het secret in.", R.color.widget_danger)
                    is OslifeWidgetApi.Result.Failure -> showStatus("✗ Geen verbinding: ${result.message}", R.color.widget_danger)
                }
            }
        }
    }

    private fun showStatus(text: String, colorRes: Int) {
        binding.connectionStatus.visibility = View.VISIBLE
        binding.connectionStatus.text = text
        binding.connectionStatus.setTextColor(getColor(colorRes))
    }

    private fun refreshAllWidgets() {
        TodayWidgetWorker.refreshNow(this)
        TodoWidgetWorker.refreshNow(this)
        TopPriorityWidgetWorker.refreshNow(this)
        ActiveProjectsWidgetWorker.refreshNow(this)
        BraindumpQuickAddWidgetWorker.refreshNow(this)
        HealthWidgetWorker.refreshNow(this)
        FinanceWidgetWorker.refreshNow(this)
        InboxWidgetWorker.refreshNow(this)
        CalendarWidgetWorker.refreshNow(this)
        HeyraQuickWidgetProvider.refreshNow(this)
        QuickActionsWidgetProvider.refreshNow(this)
    }
}
