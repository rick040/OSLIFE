package nl.oslife.gym

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.TextView

/**
 * The gym screen's home screen. Android opens it after every boot, so it is the
 * one place that decides what happens: show OSLIFE fullscreen, start the music,
 * keep the screen awake, and shut down cleanly when the gym is done.
 *
 * Hidden settings: hold three fingers on the screen, or hold the right mouse
 * button, for two seconds.
 */
class MainActivity : Activity() {

    private lateinit var prefs: Prefs
    private lateinit var web: WebView
    private lateinit var offline: TextView
    private val handler = Handler(Looper.getMainLooper())

    @Volatile
    var originAllowed = false
        private set

    @Volatile
    var rootAvailable = false
        private set

    @Volatile
    private var lastActive = SystemClock.elapsedRealtime()

    private var loadedUrl: String? = null
    private var pageFailed = false

    private val openSettingsRunnable = Runnable { openSettings() }
    private val retryRunnable = Runnable { loadHome() }

    private val idleCheck = object : Runnable {
        override fun run() {
            if (GymControl.isMusicActive(this@MainActivity)) markActive()
            val minutes = prefs.idleShutdownMin
            val idleMs = SystemClock.elapsedRealtime() - lastActive
            if (minutes > 0 && rootAvailable && idleMs > minutes * 60_000L) {
                Thread { GymControl.shutdown() }.start()
            }
            handler.postDelayed(this, 60_000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val root = FrameLayout(this)
        root.setBackgroundColor(Color.BLACK)

        web = WebView(this)
        configureWebView()
        root.addView(
            web,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
        )

        offline = TextView(this)
        offline.text = "Geen verbinding met OSLIFE.\nOpnieuw proberen..."
        offline.setTextColor(Color.WHITE)
        offline.textSize = 22f
        offline.gravity = Gravity.CENTER
        offline.setBackgroundColor(Color.BLACK)
        offline.visibility = View.GONE
        root.addView(
            offline,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
        )

        setContentView(root)
        hideSystemUi()
        loadHome()

        Thread { rootAvailable = GymControl.hasRoot() }.start()
        handler.postDelayed(idleCheck, 60_000)

        maybeRunStartup()
        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        if (intent == null) return
        if (intent.getBooleanExtra(EXTRA_RUN_STARTUP, false)) {
            intent.removeExtra(EXTRA_RUN_STARTUP)
            runStartup()
        }
        if (intent.getBooleanExtra(EXTRA_RELOAD, false)) {
            intent.removeExtra(EXTRA_RELOAD)
            loadHome()
        }
    }

    override fun onResume() {
        super.onResume()
        hideSystemUi()
        markActive()
        if (loadedUrl != prefs.url) loadHome()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemUi()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        web.destroy()
        super.onDestroy()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // A launcher has nowhere to go back to: only navigate inside the page.
        if (web.canGoBack()) web.goBack()
    }

    override fun onUserInteraction() {
        super.onUserInteraction()
        markActive()
    }

    fun markActive() {
        lastActive = SystemClock.elapsedRealtime()
    }

    fun appVersion(): String = try {
        @Suppress("DEPRECATION")
        packageManager.getPackageInfo(packageName, 0).versionName ?: ""
    } catch (e: Exception) {
        ""
    }

    // ----- Hidden settings gesture -----

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        when (ev.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                if (ev.isButtonPressed(MotionEvent.BUTTON_SECONDARY)) scheduleSettings()
            }
            MotionEvent.ACTION_POINTER_DOWN -> {
                if (ev.pointerCount >= 3) scheduleSettings()
            }
            MotionEvent.ACTION_POINTER_UP, MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                handler.removeCallbacks(openSettingsRunnable)
            }
        }
        return super.dispatchTouchEvent(ev)
    }

    override fun dispatchGenericMotionEvent(ev: MotionEvent): Boolean {
        when (ev.actionMasked) {
            MotionEvent.ACTION_BUTTON_PRESS -> {
                if (ev.actionButton == MotionEvent.BUTTON_SECONDARY) scheduleSettings()
            }
            MotionEvent.ACTION_BUTTON_RELEASE -> handler.removeCallbacks(openSettingsRunnable)
        }
        return super.dispatchGenericMotionEvent(ev)
    }

    private fun scheduleSettings() {
        handler.removeCallbacks(openSettingsRunnable)
        handler.postDelayed(openSettingsRunnable, 2000)
    }

    fun openSettings() {
        handler.removeCallbacks(openSettingsRunnable)
        startActivity(Intent(this, SettingsActivity::class.java))
    }

    // ----- Web view -----

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        val s = web.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.mediaPlaybackRequiresUserGesture = false
        // Keep text at 100% no matter what Android's font size is set to.
        s.textZoom = 100
        s.useWideViewPort = true
        s.loadWithOverviewMode = false
        s.setSupportZoom(false)
        s.builtInZoomControls = false

        CookieManager.getInstance().setAcceptCookie(true)
        web.setBackgroundColor(Color.BLACK)
        web.addJavascriptInterface(GymBridge(this), "OSLifeGym")
        web.webChromeClient = WebChromeClient()
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val scheme = request.url.scheme ?: return true
                if (scheme == "http" || scheme == "https") return false
                // spotify:, intent: and other app links open in their own app.
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, request.url).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                } catch (e: ActivityNotFoundException) {
                    // Nothing can open it; ignore.
                }
                return true
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                originAllowed = url != null && sameOrigin(Uri.parse(url))
            }

            override fun onPageFinished(view: WebView, url: String?) {
                if (!pageFailed) offline.visibility = View.GONE
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (!request.isForMainFrame) return
                pageFailed = true
                offline.visibility = View.VISIBLE
                handler.removeCallbacks(retryRunnable)
                handler.postDelayed(retryRunnable, 10_000)
            }
        }
    }

    private fun sameOrigin(uri: Uri): Boolean {
        val home = Uri.parse(prefs.url)
        return uri.scheme == home.scheme && uri.host == home.host && uri.port == home.port
    }

    private fun loadHome() {
        pageFailed = false
        loadedUrl = prefs.url
        web.loadUrl(prefs.url)
    }

    @Suppress("DEPRECATION")
    private fun hideSystemUi() {
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            )
    }

    // ----- Startup: once per boot -----

    private fun maybeRunStartup() {
        val bootCount = Settings.Global.getInt(contentResolver, Settings.Global.BOOT_COUNT, -1)
        if (bootCount != -1) {
            if (bootCount == prefs.lastBootCount) return
            prefs.lastBootCount = bootCount
        } else {
            // No boot counter on this device: only run right after a boot.
            if (startupRanThisProcess || SystemClock.elapsedRealtime() > 10 * 60_000L) return
        }
        startupRanThisProcess = true
        runStartup()
    }

    private fun runStartup() {
        Thread {
            GymControl.waitForNetwork(this, 60_000)
            try {
                Thread.sleep(prefs.startDelaySec * 1000L)
            } catch (e: InterruptedException) {
                return@Thread
            }
            runOnUiThread {
                if (pageFailed) loadHome()
                startMusicSequence()
            }
        }.start()
    }

    /** Volume, then Spotify on the playlist, then play, then back to OSLIFE. */
    fun startMusicSequence() {
        GymControl.setVolume(this, prefs.volumePercent)
        if (!prefs.spotifyEnabled || !GymControl.spotifyInstalled(this)) return
        if (!GymControl.openSpotify(this, prefs.playlist)) return
        handler.postDelayed({ GymControl.mediaKey(this, KeyEvent.KEYCODE_MEDIA_PLAY) }, 4000)
        handler.postDelayed({ bringToFront() }, 6000)
    }

    private fun bringToFront() {
        val intent = Intent(this, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
        startActivity(intent)
    }

    companion object {
        const val EXTRA_RUN_STARTUP = "run_startup"
        const val EXTRA_RELOAD = "reload"

        private var startupRanThisProcess = false
    }
}
