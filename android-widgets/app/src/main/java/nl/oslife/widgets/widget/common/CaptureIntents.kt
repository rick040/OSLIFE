package nl.oslife.widgets.widget.common

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import nl.oslife.widgets.widget.braindump.BraindumpUploadActivity
import nl.oslife.widgets.widget.braindump.QuickAddActivity
import nl.oslife.widgets.widget.heyra.HeyraQuickChatActivity

/**
 * The one-tap capture targets shared by the brain-dump, HEYRA and "Snelle acties" widgets.
 * Each has its own request code: the activity intents differ only in extras, and PendingIntent
 * identity ignores extras.
 */
object CaptureIntents {

    fun note(context: Context): PendingIntent = activity(context, 0, Intent(context, QuickAddActivity::class.java))

    fun voice(context: Context): PendingIntent =
        activity(context, 1, Intent(context, QuickAddActivity::class.java).putExtra(QuickAddActivity.EXTRA_AUTO_VOICE, true))

    fun upload(context: Context): PendingIntent = activity(context, 2, Intent(context, BraindumpUploadActivity::class.java))

    fun heyra(context: Context): PendingIntent = activity(context, 3, Intent(context, HeyraQuickChatActivity::class.java))

    fun heyraVoice(context: Context): PendingIntent =
        activity(context, 4, Intent(context, HeyraQuickChatActivity::class.java).putExtra(HeyraQuickChatActivity.EXTRA_AUTO_VOICE, true))

    private fun activity(context: Context, requestCode: Int, intent: Intent): PendingIntent =
        PendingIntent.getActivity(
            context, requestCode, intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
}
