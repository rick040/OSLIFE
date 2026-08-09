package nl.oslife.widgets.widget.braindump

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.speech.RecognizerIntent
import android.view.WindowManager
import android.widget.EditText
import android.widget.ImageButton
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import nl.oslife.widgets.R
import java.util.Locale

/**
 * Floating "quick capture" screen a home-screen widget tap opens directly —
 * no need to open the full app. Text or voice in, one POST to
 * widget-braindump-add (via the retrying BraindumpAddWorker) out, same
 * capture pipeline as an in-app Braindump entry. Closes itself right after
 * handing off to WorkManager — the capture finishes uploading in the
 * background even if the screen is already gone.
 */
class QuickAddActivity : AppCompatActivity() {

    private lateinit var input: EditText
    private lateinit var statusText: TextView

    private val speechRecognizer = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val text = result.data
                ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
                ?.firstOrNull()
            if (!text.isNullOrBlank()) {
                val current = input.text.toString()
                input.setText(if (current.isBlank()) text else "$current $text")
                input.setSelection(input.text.length)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_quick_add)
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE)

        input = findViewById(R.id.quickAddInput)
        statusText = findViewById(R.id.statusText)
        input.requestFocus()

        findViewById<android.view.View>(R.id.scrim).setOnClickListener { finish() }
        findViewById<ImageButton>(R.id.closeButton).setOnClickListener { finish() }
        findViewById<android.view.View>(R.id.micButton).setOnClickListener { startVoiceInput() }
        findViewById<android.view.View>(R.id.saveButton).setOnClickListener { save() }

        // The widget's "start talking" shortcut opens straight into voice input,
        // same EXTRA_AUTO_VOICE convention as HeyraQuickChatActivity.
        if (intent.getBooleanExtra(EXTRA_AUTO_VOICE, false)) startVoiceInput()
    }

    private fun startVoiceInput() {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale("nl", "NL"))
            putExtra(RecognizerIntent.EXTRA_PROMPT, "Spreek je notitie in…")
        }
        try {
            speechRecognizer.launch(intent)
        } catch (_: Exception) {
            Toast.makeText(this, "Spraakherkenning niet beschikbaar op dit toestel", Toast.LENGTH_SHORT).show()
        }
    }

    private fun save() {
        val text = input.text.toString().trim()
        if (text.isBlank()) {
            statusText.text = "Typ of spreek eerst iets in."
            return
        }
        BraindumpAddWorker.enqueue(this, text)
        Toast.makeText(this, "Opgeslagen ✅", Toast.LENGTH_SHORT).show()
        finish()
    }

    companion object {
        const val EXTRA_AUTO_VOICE = "auto_voice"
    }
}
