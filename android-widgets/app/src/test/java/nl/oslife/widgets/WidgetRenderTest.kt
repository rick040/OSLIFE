package nl.oslife.widgets

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import android.os.Bundle
import android.os.SystemClock
import android.view.View
import android.widget.FrameLayout
import android.widget.RemoteViews
import nl.oslife.widgets.widget.braindump.BraindumpQuickAddWidgetWorker
import nl.oslife.widgets.widget.calendar.CalendarWidgetWorker
import nl.oslife.widgets.widget.common.WidgetData
import nl.oslife.widgets.widget.common.WidgetStyle
import nl.oslife.widgets.widget.finance.FinanceWidgetWorker
import nl.oslife.widgets.widget.health.HealthWidgetWorker
import nl.oslife.widgets.widget.heyra.HeyraQuickWidgetProvider
import nl.oslife.widgets.widget.inbox.InboxWidgetWorker
import nl.oslife.widgets.widget.priority.TopPriorityWidgetWorker
import nl.oslife.widgets.widget.projects.ActiveProjectsWidgetWorker
import nl.oslife.widgets.widget.quickactions.QuickActionsWidgetProvider
import nl.oslife.widgets.widget.today.TodayWidgetWorker
import nl.oslife.widgets.widget.todo.PendingDone
import nl.oslife.widgets.widget.todo.TodoListWidgetProvider
import nl.oslife.widgets.widget.todo.TodoWidgetWorker
import org.json.JSONObject
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.TimeZone

/**
 * Renders every widget through the real RemoteViews inflation path (Robolectric, native
 * graphics) — so a layout or setter that a launcher would refuse ("Can't load widget") fails
 * here instead of on the phone — and writes what it drew to PNGs:
 *  - build/widget-renders/  — every widget in its states and sizes, on a mock wallpaper, for review;
 *  - build/widget-previews/ — transparent picker previews; copy into res/drawable-nodpi
 *    (widget_preview_*.png) after a visual change.
 *
 *   ROBOLECTRIC_DEPS_DIR=<dir with android-all-instrumented jar> ./gradlew testDebugUnitTest
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "nl-rNL-w411dp-h891dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class WidgetRenderTest {

    private val context: Context get() = RuntimeEnvironment.getApplication()
    private val today: LocalDate get() = LocalDate.now()
    private var nextId = 100
    private lateinit var host: FrameLayout

    @Before
    fun setUp() {
        TimeZone.setDefault(TimeZone.getTimeZone("Europe/Amsterdam"))
        // Robolectric's clock starts at 1970. Pin TextClock headers to a fixed morning so
        // regenerated previews don't change just because the date did.
        SystemClock.setCurrentTimeMillis(ZonedDateTime.of(2026, 10, 20, 10, 45, 0, 0, ZoneId.systemDefault()).toInstant().toEpochMilli())
        // A real window to attach to: TextClock only sets its text once attached, like on a launcher.
        val activity = Robolectric.buildActivity(Activity::class.java).setup().get()
        host = FrameLayout(activity)
        activity.setContentView(host)
        Prefs(context).apply {
            oslifeFunctionsBaseUrl = "https://example.supabase.co/functions/v1"
            oslifeWidgetSecret = "test"
            oslifeWebAppUrl = "https://oslife.example"
        }
    }

    @Test
    fun renderAllWidgets() {
        // 4x2 list widgets
        shot("todo", 340, 220) { TodoWidgetWorker.buildViews(context, it, ready(Samples.tasks())) }
        shot("todo_compact_2x2", 170, 170) { TodoWidgetWorker.buildViews(context, it, ready(Samples.tasks())) }
        shot("todo_offline", 340, 180) { TodoWidgetWorker.buildViews(context, it, ready(Samples.tasks(), offline = true)) }
        shot("todo_just_ticked", 340, 220) {
            tick("2")
            TodoWidgetWorker.buildViews(context, it, ready(Samples.tasks())).also { tick("2") }
        }
        shot("priority", 340, 180) { TopPriorityWidgetWorker.buildViews(context, it, ready(Samples.tasks())) }
        shot("projects", 340, 220) { ActiveProjectsWidgetWorker.buildViews(context, it, ready(Samples.projects())) }
        shot("inbox", 340, 220) { InboxWidgetWorker.buildViews(context, it, ready(Samples.inbox())) }
        shot("calendar", 250, 220) { CalendarWidgetWorker.buildViews(context, it, ready(Samples.calendar()), now = LocalTime.of(10, 45)) }

        // small glance widgets — must fit their 2x2 / 3x2 default without clipping
        shot("health", 170, 170) { HealthWidgetWorker.buildViews(context, it, ready(Samples.health())) }
        shot("finance", 170, 170) { FinanceWidgetWorker.buildViews(context, it, ready(Samples.finance())) }
        shot("braindump", 250, 180) { BraindumpQuickAddWidgetWorker.buildViews(context, it, ready(JSONObject("""{"todayCount":4}"""))) }
        shot("heyra", 170, 170) { HeyraQuickWidgetProvider.buildViews(context, it) }

        // new widgets
        shot("today", 340, 190) { TodayWidgetWorker.buildViews(context, it, ready(Samples.summary())) }
        shot("quick_actions", 340, 80) { QuickActionsWidgetProvider.buildViews(context, it) }

        // states
        shot("state_loading", 250, 150) { InboxWidgetWorker.buildViews(context, it, WidgetData.Loading) }
        shot("state_not_configured", 250, 150) { InboxWidgetWorker.buildViews(context, it, WidgetData.NotConfigured) }
        shot("state_error", 250, 150) { InboxWidgetWorker.buildViews(context, it, WidgetData.Error("Geen verbinding")) }
        shot("todo_background_30pct", 340, 180) {
            WidgetStyle.setBackgroundPercent(context, it, 30)
            TodoWidgetWorker.buildViews(context, it, ready(Samples.tasks()))
        }
        shot("calendar_empty", 250, 150) { CalendarWidgetWorker.buildViews(context, it, ready(JSONObject("""{"blocks":[]}"""))) }
    }

    @Test
    @Config(qualifiers = "nl-rNL-w411dp-h891dp-xhdpi")
    fun renderPickerPreviews() {
        preview("today", 340, 180) { TodayWidgetWorker.buildViews(context, it, ready(Samples.summary())) }
        preview("quick_actions", 340, 76) { QuickActionsWidgetProvider.buildViews(context, it) }
        preview("todo", 340, 180) { TodoWidgetWorker.buildViews(context, it, ready(Samples.tasks())) }
        preview("priority", 340, 180) { TopPriorityWidgetWorker.buildViews(context, it, ready(Samples.tasks())) }
        preview("projects", 340, 180) { ActiveProjectsWidgetWorker.buildViews(context, it, ready(Samples.projects())) }
        preview("braindump", 250, 170) { BraindumpQuickAddWidgetWorker.buildViews(context, it, ready(JSONObject("""{"todayCount":4}"""))) }
        preview("heyra", 170, 170) { HeyraQuickWidgetProvider.buildViews(context, it) }
        preview("health", 170, 170) { HealthWidgetWorker.buildViews(context, it, ready(Samples.health())) }
        preview("finance", 170, 170) { FinanceWidgetWorker.buildViews(context, it, ready(Samples.finance())) }
        preview("inbox", 340, 180) { InboxWidgetWorker.buildViews(context, it, ready(Samples.inbox())) }
        preview("calendar", 250, 180) { CalendarWidgetWorker.buildViews(context, it, ready(Samples.calendar()), now = LocalTime.of(10, 45)) }
    }

    // ── helpers ────────────────────────────────────────────────────────────────

    private fun ready(json: JSONObject, offline: Boolean = false): WidgetData {
        val fetchedAt = today.atTime(14, 32).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
        return WidgetData.Ready(json, fetchedAt, offline)
    }

    private fun tick(taskId: String) {
        PendingDone.toggle(context, taskId)
    }

    /** A widget id whose launcher-reported size is [wDp] x [hDp] (drives WidgetStyle.rowCapacity). */
    private fun instance(wDp: Int, hDp: Int): Int {
        val id = nextId++
        val options = Bundle().apply {
            putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, wDp)
            putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, wDp)
            putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, hDp)
            putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, hDp)
        }
        val manager = AppWidgetManager.getInstance(context)
        shadowOf(manager).bindAppWidgetId(id, ComponentName(context, TodoListWidgetProvider::class.java))
        manager.updateAppWidgetOptions(id, options)
        check(manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT) == hDp) { "widget options not stored" }
        return id
    }

    private fun draw(views: RemoteViews, wDp: Int, hDp: Int, wallpaper: Boolean): Bitmap {
        // apply() is the exact inflation a launcher does — throws on anything RemoteViews can't do.
        host.removeAllViews()
        val view = views.apply(context, host)
        val density = context.resources.displayMetrics.density
        val w = (wDp * density).toInt()
        val h = (hDp * density).toInt()
        host.addView(view, FrameLayout.LayoutParams(w, h))
        view.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY))
        view.layout(0, 0, w, h)
        val pad = if (wallpaper) (14 * density).toInt() else 0
        val bitmap = Bitmap.createBitmap(w + 2 * pad, h + 2 * pad, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        if (wallpaper) {
            val paint = Paint().apply {
                shader = LinearGradient(0f, 0f, bitmap.width.toFloat(), bitmap.height.toFloat(), 0xFF2E5E8C.toInt(), 0xFF9C6B8E.toInt(), Shader.TileMode.CLAMP)
            }
            canvas.drawRect(0f, 0f, bitmap.width.toFloat(), bitmap.height.toFloat(), paint)
        }
        canvas.translate(pad.toFloat(), pad.toFloat())
        view.draw(canvas)
        return bitmap
    }

    private fun shot(name: String, wDp: Int, hDp: Int, build: (Int) -> RemoteViews) =
        save(File("build/widget-renders", "$name.png"), draw(build(instance(wDp, hDp)), wDp, hDp, wallpaper = true))

    private fun preview(name: String, wDp: Int, hDp: Int, build: (Int) -> RemoteViews) =
        save(File("build/widget-previews", "widget_preview_$name.png"), draw(build(instance(wDp, hDp)), wDp, hDp, wallpaper = false))

    private fun save(file: File, bitmap: Bitmap) {
        file.parentFile!!.mkdirs()
        file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
}
