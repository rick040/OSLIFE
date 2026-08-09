package nl.oslife.widgets.widget.braindump

import android.database.Cursor
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.OpenableColumns
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import nl.oslife.widgets.R
import nl.oslife.widgets.widget.common.OslifeWidgetApi
import java.util.concurrent.Executors

/**
 * The brain-dump widget's third shortcut ("Upload"): launches the system
 * file picker immediately, uploads whatever is picked straight to
 * widget-braindump-upload, then closes itself — no UI of its own beyond a
 * transient "uploading…" card, same "hand off and get out of the way"
 * philosophy as QuickAddActivity/HeyraQuickChatActivity.
 */
class BraindumpUploadActivity : AppCompatActivity() {

    private lateinit var statusText: TextView
    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

    private val filePicker = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri == null) {
            finish()
        } else {
            uploadFile(uri)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_braindump_upload)
        statusText = findViewById(R.id.uploadStatusText)
        findViewById<android.view.View>(R.id.scrim).setOnClickListener { finish() }

        filePicker.launch("*/*")
    }

    private fun uploadFile(uri: Uri) {
        statusText.text = "Bestand uploaden…"
        val mime = contentResolver.getType(uri) ?: "application/octet-stream"
        val filename = queryDisplayName(uri) ?: "bestand"

        executor.execute {
            val bytes = try {
                contentResolver.openInputStream(uri)?.use { it.readBytes() }
            } catch (_: Exception) {
                null
            }
            if (bytes == null) {
                mainHandler.post {
                    Toast.makeText(this, "Kon bestand niet lezen", Toast.LENGTH_SHORT).show()
                    finish()
                }
                return@execute
            }

            val result = OslifeWidgetApi.postFile(this, "widget-braindump-upload", bytes, filename, mime)
            mainHandler.post {
                when (result) {
                    is OslifeWidgetApi.Result.Success -> {
                        BraindumpQuickAddWidgetWorker.refreshNow(this)
                        Toast.makeText(this, "Geüpload ✅", Toast.LENGTH_SHORT).show()
                    }
                    is OslifeWidgetApi.Result.NotConfigured -> Toast.makeText(this, "Nog niet ingesteld — open de app → Instellingen", Toast.LENGTH_LONG).show()
                    is OslifeWidgetApi.Result.Failure -> Toast.makeText(this, "⚠️ ${result.message}", Toast.LENGTH_LONG).show()
                }
                finish()
            }
        }
    }

    private fun queryDisplayName(uri: Uri): String? {
        var cursor: Cursor? = null
        return try {
            cursor = contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
            if (cursor != null && cursor.moveToFirst()) {
                val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (idx >= 0) cursor.getString(idx) else null
            } else {
                null
            }
        } catch (_: Exception) {
            null
        } finally {
            cursor?.close()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        executor.shutdown()
    }
}
