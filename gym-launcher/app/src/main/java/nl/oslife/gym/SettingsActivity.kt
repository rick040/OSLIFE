package nl.oslife.gym

import android.app.Activity
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast

/** Hidden settings screen, built in code so there are no layout files to maintain. */
class SettingsActivity : Activity() {

    private lateinit var prefs: Prefs
    private lateinit var status: TextView
    private lateinit var urlInput: EditText
    private lateinit var playlistInput: EditText
    private lateinit var spotifySwitch: Switch
    private lateinit var volumeInput: EditText
    private lateinit var delayInput: EditText
    private lateinit var idleInput: EditText

    @Volatile
    private var rootStatus = "nog niet gecontroleerd"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)

        val pad = dp(24)
        val column = LinearLayout(this)
        column.orientation = LinearLayout.VERTICAL
        column.setPadding(pad, pad, pad, pad)

        column.addView(title("OSLIFE Gym"))
        status = TextView(this)
        status.textSize = 15f
        status.setPadding(0, dp(8), 0, dp(16))
        column.addView(status)

        column.addView(label("Pagina die het scherm toont"))
        urlInput = input(prefs.url, InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI)
        column.addView(urlInput)

        column.addView(label("Spotify playlist (link uit Spotify: Delen, Link kopiëren)"))
        playlistInput = input(prefs.playlist, InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI)
        column.addView(playlistInput)

        spotifySwitch = Switch(this)
        spotifySwitch.text = "Spotify automatisch starten na het opstarten"
        spotifySwitch.isChecked = prefs.spotifyEnabled
        spotifySwitch.setPadding(0, dp(12), 0, dp(12))
        column.addView(spotifySwitch)

        column.addView(label("Volume bij opstarten (0 tot 100)"))
        volumeInput = input(prefs.volumePercent.toString(), InputType.TYPE_CLASS_NUMBER)
        column.addView(volumeInput)

        column.addView(label("Extra wachttijd na wifi, in seconden"))
        delayInput = input(prefs.startDelaySec.toString(), InputType.TYPE_CLASS_NUMBER)
        column.addView(delayInput)

        column.addView(label("Netjes afsluiten na zoveel minuten zonder muziek of aanraking (0 = nooit, werkt alleen met root)"))
        idleInput = input(prefs.idleShutdownMin.toString(), InputType.TYPE_CLASS_NUMBER)
        column.addView(idleInput)

        column.addView(button("Opslaan") {
            save()
            toast("Opgeslagen")
            backToScreen(reload = true, runStartup = false)
        })
        column.addView(button("Opslaan en opstartroutine nu testen") {
            save()
            backToScreen(reload = true, runStartup = true)
        })

        column.addView(section("Instellen (eenmalig)"))
        column.addView(button("Kies OSLIFE Gym als startscherm") {
            open(Intent(Settings.ACTION_HOME_SETTINGS))
        })
        column.addView(button("Sta 'Weergeven over andere apps' toe") {
            open(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
        })
        column.addView(button("Controleer root") { checkRoot() })

        column.addView(section("Apparaat"))
        column.addView(button("Afsluiten") {
            confirm("Scherm nu afsluiten?") { power(shutdown = true) }
        })
        column.addView(button("Herstarten") {
            confirm("Scherm nu herstarten?") { power(shutdown = false) }
        })
        column.addView(button("Android-instellingen openen") { open(Intent(Settings.ACTION_SETTINGS)) })
        column.addView(button("Nieuwste versie downloaden") {
            open(Intent(Intent.ACTION_VIEW, Uri.parse(Prefs.UPDATE_URL)))
        })
        column.addView(button("Terug naar het scherm") { finish() })

        val scroll = ScrollView(this)
        scroll.addView(column)
        setContentView(scroll)
    }

    override fun onResume() {
        super.onResume()
        refreshStatus()
    }

    private fun refreshStatus() {
        val lines = listOf(
            "Versie: " + versionName(),
            "Startscherm: " + if (GymControl.isDefaultHome(this)) "ja" else "nee, kies het hieronder",
            "Spotify geïnstalleerd: " + if (GymControl.spotifyInstalled(this)) "ja" else "nee",
            "Weergeven over andere apps: " + if (GymControl.canDrawOverlays(this)) "toegestaan" else "nog niet toegestaan",
            "Root: $rootStatus",
        )
        status.text = lines.joinToString("\n")
    }

    private fun save() {
        prefs.url = urlInput.text.toString().ifBlank { Prefs.DEFAULT_URL }
        prefs.playlist = playlistInput.text.toString()
        prefs.spotifyEnabled = spotifySwitch.isChecked
        prefs.volumePercent = volumeInput.text.toString().toIntOrNull() ?: prefs.volumePercent
        prefs.startDelaySec = delayInput.text.toString().toIntOrNull() ?: prefs.startDelaySec
        prefs.idleShutdownMin = idleInput.text.toString().toIntOrNull() ?: prefs.idleShutdownMin
    }

    private fun backToScreen(reload: Boolean, runStartup: Boolean) {
        val intent = Intent(this, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
            .putExtra(MainActivity.EXTRA_RELOAD, reload)
            .putExtra(MainActivity.EXTRA_RUN_STARTUP, runStartup)
        startActivity(intent)
        finish()
    }

    private fun checkRoot() {
        rootStatus = "controleren..."
        refreshStatus()
        Thread {
            val ok = GymControl.hasRoot()
            rootStatus = if (ok) "ja, netjes afsluiten werkt" else "nee, afsluiten via de app kan niet"
            runOnUiThread { refreshStatus() }
        }.start()
    }

    private fun power(shutdown: Boolean) {
        Thread {
            val ok = if (shutdown) GymControl.shutdown() else GymControl.reboot()
            if (!ok) runOnUiThread { toast("Lukt niet: dit board heeft geen root-toegang.") }
        }.start()
    }

    private fun confirm(message: String, onYes: () -> Unit) {
        AlertDialog.Builder(this)
            .setMessage(message)
            .setPositiveButton("Ja") { _, _ -> onYes() }
            .setNegativeButton("Nee", null)
            .show()
    }

    private fun open(intent: Intent) {
        try {
            startActivity(intent)
        } catch (e: ActivityNotFoundException) {
            toast("Dit scherm bestaat niet op dit apparaat.")
        }
    }

    private fun versionName(): String = try {
        @Suppress("DEPRECATION")
        packageManager.getPackageInfo(packageName, 0).versionName ?: "?"
    } catch (e: Exception) {
        "?"
    }

    // ----- Small view helpers -----

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun title(text: String): TextView {
        val view = TextView(this)
        view.text = text
        view.textSize = 28f
        return view
    }

    private fun section(text: String): TextView {
        val view = TextView(this)
        view.text = text
        view.textSize = 20f
        view.setPadding(0, dp(28), 0, dp(8))
        return view
    }

    private fun label(text: String): TextView {
        val view = TextView(this)
        view.text = text
        view.textSize = 14f
        view.setPadding(0, dp(14), 0, dp(4))
        return view
    }

    private fun input(value: String, type: Int): EditText {
        val view = EditText(this)
        view.setText(value)
        view.inputType = type
        view.setSingleLine(true)
        return view
    }

    private fun button(text: String, onClick: () -> Unit): Button {
        val view = Button(this)
        view.text = text
        view.isAllCaps = false
        view.setOnClickListener(View.OnClickListener { onClick() })
        val params = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        )
        params.topMargin = dp(8)
        view.layoutParams = params
        return view
    }

    private fun toast(text: String) {
        Toast.makeText(this, text, Toast.LENGTH_LONG).show()
    }
}
