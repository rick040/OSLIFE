package nl.oslife.walktracker.widget.heyra

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognizerIntent
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.EditText
import android.widget.ImageButton
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.setPadding
import nl.oslife.walktracker.R
import nl.oslife.walktracker.widget.common.OslifeWidgetApi
import org.json.JSONObject
import java.util.Locale
import java.util.concurrent.Executors

/**
 * Floating "quick chat/voice" screen a home-screen widget tap opens directly.
 * One question in (typed or spoken), one grounded HEYRA reply out
 * (widget-heyra-chat edge function) — a short, stateless back-and-forth
 * rendered as chat bubbles in this same screen, no persistence beyond the
 * activity's lifetime (this is a glance tool, not the full in-app HEYRA chat).
 */
class HeyraQuickChatActivity : AppCompatActivity() {

    private lateinit var input: EditText
    private lateinit var conversation: android.widget.LinearLayout
    private lateinit var scroll: ScrollView
    private lateinit var sendButton: android.widget.Button
    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

    private val speechRecognizer = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val text = result.data
                ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
                ?.firstOrNull()
            if (!text.isNullOrBlank()) {
                input.setText(text)
                send()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_heyra_chat)
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE)

        input = findViewById(R.id.chatInput)
        conversation = findViewById(R.id.conversationContainer)
        scroll = findViewById(R.id.conversationScroll)
        sendButton = findViewById(R.id.sendButton)

        findViewById<View>(R.id.scrim).setOnClickListener { finish() }
        findViewById<ImageButton>(R.id.closeButton).setOnClickListener { finish() }
        findViewById<View>(R.id.micButton).setOnClickListener { startVoiceInput() }
        sendButton.setOnClickListener { send() }

        addBubble("Vraag me iets over je dag, taken of projecten — of spreek in met de microfoon.", isUser = false, muted = true)

        if (intent.getBooleanExtra(EXTRA_AUTO_VOICE, false)) startVoiceInput()
    }

    private fun startVoiceInput() {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale("nl", "NL"))
            putExtra(RecognizerIntent.EXTRA_PROMPT, "Wat wil je HEYRA vragen?")
        }
        try {
            speechRecognizer.launch(intent)
        } catch (_: Exception) {
            Toast.makeText(this, "Spraakherkenning niet beschikbaar op dit toestel", Toast.LENGTH_SHORT).show()
        }
    }

    private fun send() {
        val question = input.text.toString().trim()
        if (question.isBlank()) return
        input.setText("")
        addBubble(question, isUser = true)
        val thinkingBubble = addBubble("HEYRA denkt na…", isUser = false, muted = true)
        sendButton.isEnabled = false

        executor.execute {
            val result = OslifeWidgetApi.post(this, "widget-heyra-chat", JSONObject().put("message", question))
            mainHandler.post {
                sendButton.isEnabled = true
                conversation.removeView(thinkingBubble)
                when (result) {
                    is OslifeWidgetApi.Result.Success -> addBubble(result.json.optString("reply", ""), isUser = false)
                    is OslifeWidgetApi.Result.NotConfigured -> addBubble("Nog niet ingesteld — open de app → Instellingen.", isUser = false, muted = true)
                    is OslifeWidgetApi.Result.Failure -> addBubble("⚠️ ${result.message}", isUser = false, muted = true)
                }
            }
        }
    }

    private fun addBubble(text: String, isUser: Boolean, muted: Boolean = false): View {
        val bubble = TextView(this).apply {
            this.text = text
            textSize = 14f
            setTextColor(if (muted) Color.parseColor("#5B6270") else Color.parseColor("#111318"))
            setPadding(28)
            setBackgroundResource(if (isUser) R.drawable.heyra_question_bg else R.drawable.heyra_reply_bg)
        }
        val params = android.widget.LinearLayout.LayoutParams(
            android.widget.LinearLayout.LayoutParams.WRAP_CONTENT,
            android.widget.LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply {
            topMargin = 8
            gravity = if (isUser) Gravity.END else Gravity.START
        }
        conversation.addView(bubble, params)
        scroll.post { scroll.fullScroll(View.FOCUS_DOWN) }
        return bubble
    }

    override fun onDestroy() {
        super.onDestroy()
        executor.shutdown()
    }

    companion object {
        const val EXTRA_AUTO_VOICE = "auto_voice"
    }
}
