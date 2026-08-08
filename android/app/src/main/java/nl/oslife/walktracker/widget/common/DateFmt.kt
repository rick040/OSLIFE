package nl.oslife.walktracker.widget.common

import java.time.LocalDate
import java.time.format.DateTimeParseException

/** Short Dutch relative-date labels shared by the to-do, priority and projects widgets. */
object DateFmt {

    private val DAY_NAMES = arrayOf("ma", "di", "wo", "do", "vr", "za", "zo")
    private val MONTH_NAMES = arrayOf(
        "jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec",
    )

    /** "" for no date, "Vandaag" / "Morgen" / "3d te laat" / "wo" / "6 aug" depending on distance. */
    fun relative(dateStr: String?): String {
        if (dateStr.isNullOrBlank()) return ""
        val date = try {
            LocalDate.parse(dateStr.take(10))
        } catch (_: DateTimeParseException) {
            return dateStr
        }
        val today = LocalDate.now()
        val diff = java.time.temporal.ChronoUnit.DAYS.between(today, date)
        return when {
            diff == 0L -> "Vandaag"
            diff == 1L -> "Morgen"
            diff == -1L -> "Gisteren"
            diff < 0 -> "${-diff}d te laat"
            diff <= 6 -> DAY_NAMES[(date.dayOfWeek.value - 1).coerceIn(0, 6)]
            else -> "${date.dayOfMonth} ${MONTH_NAMES[(date.monthValue - 1).coerceIn(0, 11)]}"
        }
    }

    fun isOverdue(dateStr: String?): Boolean {
        if (dateStr.isNullOrBlank()) return false
        val date = try { LocalDate.parse(dateStr.take(10)) } catch (_: DateTimeParseException) { return false }
        return date.isBefore(LocalDate.now())
    }
}
