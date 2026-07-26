package nl.oslife.walktracker.walks

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import nl.oslife.walktracker.R
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

private val TRIGGER_LABELS = mapOf(
    "home" to "vanaf huis",
    "car_forest" to "met de auto ergens heen",
    "manual" to "handmatig",
)

class WalkAdapter(
    private val walks: List<Walk>,
    private val onClick: (Walk) -> Unit,
) : RecyclerView.Adapter<WalkAdapter.ViewHolder>() {

    private val parseFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }
    private val displayFormat = SimpleDateFormat("d MMM, HH:mm", Locale("nl", "NL"))

    class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val dateText: TextView = view.findViewById(R.id.walkDateText)
        val statsText: TextView = view.findViewById(R.id.walkStatsText)
        val triggerText: TextView = view.findViewById(R.id.walkTriggerText)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_walk_card, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val walk = walks[position]
        holder.dateText.text = formatDate(walk.startedAt)
        holder.statsText.text = String.format(Locale.US, "%.1f km · %d min", walk.distanceKm, walk.durationMin)
        holder.triggerText.text = TRIGGER_LABELS[walk.triggerSource] ?: (walk.triggerSource ?: "onbekend")
        holder.itemView.setOnClickListener { onClick(walk) }
    }

    override fun getItemCount() = walks.size

    private fun formatDate(iso: String): String = try {
        displayFormat.format(parseFormat.parse(iso)!!)
    } catch (_: Exception) {
        iso
    }
}
