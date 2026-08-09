package nl.oslife.widgets

import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import nl.oslife.widgets.databinding.ActivityMainBinding
import nl.oslife.widgets.widget.braindump.BraindumpQuickAddWidgetWorker
import nl.oslife.widgets.widget.priority.TopPriorityWidgetWorker
import nl.oslife.widgets.widget.projects.ActiveProjectsWidgetWorker
import nl.oslife.widgets.widget.todo.TodoListWidgetProvider

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: Prefs

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
            Toast.makeText(this, "Instellingen opgeslagen", Toast.LENGTH_SHORT).show()
        }

        binding.refreshOslifeWidgetsButton.setOnClickListener {
            TodoListWidgetProvider.notifyListChanged(this)
            TopPriorityWidgetWorker.refreshNow(this)
            ActiveProjectsWidgetWorker.refreshNow(this)
            BraindumpQuickAddWidgetWorker.refreshNow(this)
            Toast.makeText(this, "Widgets worden ververst…", Toast.LENGTH_SHORT).show()
        }
    }
}
