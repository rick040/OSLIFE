package nl.oslife.widgets.widget.common

import java.time.LocalDate
import java.time.format.DateTimeParseException

/** Short Dutch date/time labels shared by all widgets. */
object DateFmt {

    private val DAY_NAMES = arrayOf("ma", "di", "wo", "do", "vr", "za", "zo")
    private val MONTH_NAMES = arrayOf(
        "jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec",
    )

    /** "" for no date, "Vandaag" / "Morgen" / "3d te laat" / "wo" / "6 aug" depending on distance. */
    fun relative(dateStr: String?): String {
        if (dateStr.isNullOrBlank() || dateStr == "null") return ""
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

    /** Gmail-style short label for a received timestamp: "14:32" today, "Gisteren", a day
     * name this week, or "6 aug" further back. Accepts a full ISO-8601 instant (with offset). */
    fun shortTime(isoStr: String?): String {
        if (isoStr.isNullOrBlank()) return ""
        val instant = try {
            java.time.OffsetDateTime.parse(isoStr).toInstant()
        } catch (_: Exception) {
            try { java.time.Instant.parse(isoStr) } catch (_: Exception) { return "" }
        }
        val zoned = instant.atZone(java.time.ZoneId.systemDefault())
        val date = zoned.toLocalDate()
        val today = LocalDate.now()
        val diff = java.time.temporal.ChronoUnit.DAYS.between(date, today)
        return when {
            diff <= 0L -> String.format("%02d:%02d", zoned.hour, zoned.minute)
            diff == 1L -> "Gisteren"
            diff <= 6L -> DAY_NAMES[(date.dayOfWeek.value - 1).coerceIn(0, 6)]
            else -> "${date.dayOfMonth} ${MONTH_NAMES[(date.monthValue - 1).coerceIn(0, 11)]}"
        }
    }

    /** "18 okt" for a YYYY-MM-DD date, "" if it doesn't parse. */
    fun dayMonth(dateStr: String?): String {
        if (dateStr.isNullOrBlank()) return ""
        val date = try { LocalDate.parse(dateStr.take(10)) } catch (_: DateTimeParseException) { return "" }
        return "${date.dayOfMonth} ${MONTH_NAMES[(date.monthValue - 1).coerceIn(0, 11)]}"
    }

    /** When a widget last got data: "14:32" today, "gisteren 14:32", "ma 14:32", or "6 aug". */
    fun clock(epochMillis: Long): String {
        val zoned = java.time.Instant.ofEpochMilli(epochMillis).atZone(java.time.ZoneId.systemDefault())
        val time = String.format("%02d:%02d", zoned.hour, zoned.minute)
        val diff = java.time.temporal.ChronoUnit.DAYS.between(zoned.toLocalDate(), LocalDate.now())
        return when {
            diff <= 0L -> time
            diff == 1L -> "gisteren $time"
            diff <= 6L -> "${DAY_NAMES[(zoned.dayOfWeek.value - 1).coerceIn(0, 6)]} $time"
            else -> "${zoned.dayOfMonth} ${MONTH_NAMES[(zoned.monthValue - 1).coerceIn(0, 11)]}"
        }
    }

    /** Parses a "10:30:00" time column; null when absent or unparseable. */
    fun time(timeStr: String?): java.time.LocalTime? =
        try { if (timeStr.isNullOrBlank()) null else java.time.LocalTime.parse(timeStr.take(5)) } catch (_: Exception) { null }
}
