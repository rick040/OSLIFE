package nl.oslife.widgets

import org.json.JSONObject
import java.time.LocalDate

/** Realistic sample responses for each widget-* edge function, shaped like the real ones. */
object Samples {
    private val today: LocalDate get() = LocalDate.now()

    fun tasks() = JSONObject("""{"ok":true,"tasks":[
      {"id":"1","title":"Offerte ParkingYou versturen","due":"${today.minusDays(2)}","priority":"High"},
      {"id":"2","title":"Belastingaangifte afronden","due":"$today","priority":"High"},
      {"id":"3","title":"Dierenarts bellen voor Kyra","due":"${today.plusDays(1)}","priority":"Medium"},
      {"id":"4","title":"Buurtkaart: nieuwe wijk toevoegen","due":"${today.plusDays(4)}","priority":"Medium"},
      {"id":"5","title":"Boodschappen","due":null,"priority":"Low"},
      {"id":"6","title":"Fiets naar de reparatie","due":"${today.plusDays(12)}","priority":null},
      {"id":"7","title":"Mail Jan terugsturen","due":null,"priority":"Low"},
      {"id":"8","title":"Nieuwe hardloopschoenen","due":null,"priority":"Low"},
      {"id":"9","title":"Verzekering opzeggen","due":null,"priority":"Low"}
    ]}""")

    fun projects() = JSONObject("""{"ok":true,"projects":[
      {"id":"p1","name":"ParkingYou app v2","client":"ParkingYou","progress":0.62,"deadline":"${today.plusDays(9)}"},
      {"id":"p2","name":"PRJCT website","client":"PRJCT","progress":0.35,"deadline":"${today.minusDays(1)}"},
      {"id":"p3","name":"Buurtkaart Utrecht","client":null,"progress":0.8,"deadline":null},
      {"id":"p4","name":"OSLIFE widgets","client":null,"progress":0.9,"deadline":"${today.plusDays(2)}"}
    ]}""")

    fun inbox() = JSONObject("""{"ok":true,"unreadCount":7,"recent":[
      {"id":"m1","from":"Gemeente Utrecht <noreply@utrecht.nl>","subject":"Uw parkeervergunning","snippet":"Beste meneer, uw aanvraag is in behandeling genomen.","receivedAt":"${today}T09:12:00+02:00"},
      {"id":"m2","from":"\"Jan de Vries\" <jan@example.nl>","subject":"Re: offerte","snippet":"Ziet er goed uit, laten we volgende week bellen.","receivedAt":"${today.minusDays(1)}T16:40:00+02:00"},
      {"id":"m3","from":"Bol.com","subject":"Je pakket is onderweg","snippet":"Verwachte bezorging morgen tussen 10:00 en 13:00.","receivedAt":"${today.minusDays(3)}T11:00:00+02:00"}
    ]}""")

    fun calendar() = JSONObject("""{"ok":true,"blocks":[
      {"id":"c0","title":"Standup team","startTime":"09:00:00","endTime":"09:15:00"},
      {"id":"c1","title":"Klantgesprek ParkingYou","startTime":"10:30:00","endTime":"11:30:00"},
      {"id":"c2","title":"Lunch met Sanne","startTime":"12:30:00","endTime":"13:15:00"},
      {"id":"c3","title":"Uitlaten Kyra","startTime":"17:00:00","endTime":"17:45:00"},
      {"id":"c4","title":"Sportschool","startTime":"19:00:00","endTime":"20:00:00"}
    ]}""")

    fun health() = JSONObject("""{"ok":true,"today":{"steps":7432,"sleepMin":432,"activeMin":38},
      "weight":{"kg":82.4,"asOf":"$today"},
      "habits":{"doneToday":2,"totalActive":5,"bestStreakDays":7,"bestStreakHabit":"Lezen"}}""")

    fun finance() = JSONObject("""{"ok":true,"balance":2345.67,"balanceAsOf":"${today.minusDays(2)}",
      "openPayments":{"count":3,"totalAmount":456.5},"urgentCount":1}""")

    fun summary() = JSONObject("""{"ok":true,"asOf":"${today}T12:00:00Z",
      "dog":{"lastWalkAt":"${today}T07:40:00+02:00","walksToday":2,"distanceTodayKm":3.42},
      "tasks":{"dueToday":3,"openTotal":12},
      "habits":{"doneToday":2,"totalActive":5,"bestStreakDays":7,"bestStreakHabit":"Lezen"},
      "calendar":{"nextTitle":"Klantgesprek ParkingYou","nextStart":"10:30:00"}}""")
}
