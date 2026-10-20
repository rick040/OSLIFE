package nl.oslife.widgets.widget.common

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import android.widget.SeekBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import nl.oslife.widgets.R

/**
 * The native "Edit widget" screen: every widget declares android:configure pointing here, so
 * long-pressing any OSLIFE widget → Edit (same affordance Samsung/Pixel launchers already use
 * for their own widgets' transparency sliders) opens this. Android 12+ skips it when a widget
 * is first placed (widgetFeatures="configuration_optional"); older versions still show it once.
 *
 * The slider previews live on the widget itself, visible behind this sheet, so there's no
 * guessing what "60%" looks like on the actual wallpaper.
 */
class WidgetConfigureActivity : AppCompatActivity() {

    private var appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID
    private var savedPercent = WidgetStyle.MAX_BACKGROUND

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_widget_configure)

        appWidgetId = intent?.extras?.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
            ?: AppWidgetManager.INVALID_APPWIDGET_ID
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }
        // OK even on cancel/back: when this opens right after placing a widget, a CANCELED
        // result makes the launcher throw the new widget away — default styling is fine.
        setResult(Activity.RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId))

        val seekBar = findViewById<SeekBar>(R.id.opacitySeekBar)
        val label = findViewById<TextView>(R.id.opacityLabel)

        savedPercent = WidgetStyle.getBackgroundPercent(this, appWidgetId)
        seekBar.max = WidgetStyle.MAX_BACKGROUND - WidgetStyle.MIN_BACKGROUND
        seekBar.progress = savedPercent - WidgetStyle.MIN_BACKGROUND
        label.text = "$savedPercent%"

        seekBar.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(sb: SeekBar, value: Int, fromUser: Boolean) {
                val percent = WidgetStyle.MIN_BACKGROUND + value
                label.text = "$percent%"
                previewOnWidget(percent)
            }
            override fun onStartTrackingTouch(sb: SeekBar) {}
            override fun onStopTrackingTouch(sb: SeekBar) {}
        })

        findViewById<View>(R.id.cancelButton).setOnClickListener {
            previewOnWidget(savedPercent)
            finish()
        }
        findViewById<View>(R.id.saveButton).setOnClickListener {
            WidgetStyle.setBackgroundPercent(this, appWidgetId, WidgetStyle.MIN_BACKGROUND + seekBar.progress)
            redrawWidget()
            finish()
        }
    }

    /** Partial update of just the card's alpha — the widget's content stays untouched. */
    private fun previewOnWidget(percent: Int) {
        val manager = AppWidgetManager.getInstance(this)
        val layout = manager.getAppWidgetInfo(appWidgetId)?.initialLayout ?: return
        val views = RemoteViews(packageName, layout)
        WidgetStyle.applyBackgroundPercent(views, percent)
        manager.partiallyUpdateAppWidget(appWidgetId, views)
    }

    /** Asks the owning provider to redraw this one instance with the saved setting. */
    private fun redrawWidget() {
        val provider = AppWidgetManager.getInstance(this).getAppWidgetInfo(appWidgetId)?.provider ?: return
        sendBroadcast(
            Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
                .setComponent(provider)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, intArrayOf(appWidgetId)),
        )
    }
}
