package expo.modules.studyalarms

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Planning inputs pushed from JS, kept in SharedPreferences so alarms can be re-planned while the app is closed. */
object AlarmStore {
  private const val PREFS = "flashmaster_study_alarms"

  /** The vibration before the settings existed (preset `default`, repeated until answered). */
  val DEFAULT_VIBRATION = longArrayOf(0, 800, 400, 800, 400)

  /** `deadlineMinutes`: the topic's deadline in minutes after midnight, -1 = none. */
  data class Item(
    val slug: String,
    val title: String,
    val difficulty: String,
    val costMs: Long,
    val deadlineMinutes: Int = -1,
    /** Icon character in the MaterialCommunityIcons font ("" = none) and the topic's color (hex). */
    val icon: String = "",
    val color: String = "",
  )

  data class Config(
    val enabled: Boolean,
    val startHour: Int,
    val endHour: Int,
    val goal: Int,
    val learnedToday: Int,
    val day: String,
    val dayStartHour: Int,
    val upcoming: List<Item>,
    val tomorrowGoal: Int,
    val tomorrow: List<Item>,
    /** The ring's vibration waveform (see vibrationWaveform in src/logic/vibration.ts) and its repeat index. */
    val vibrationTimings: LongArray,
    val vibrationRepeat: Int,
    /** "" = the default alarm sound, "silent" = none, else a content URI. */
    val sound: String,
  ) {
    /** `ms` moved back by the day start hour: its calendar day is the app's day. */
    fun logical(ms: Long): Long = ms - dayStartHour * 3_600_000L
  }

  private fun prefs(ctx: Context): SharedPreferences = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  /** The app's day (local calendar day shifted by the day start hour), same format as dayKey() in JS. */
  fun today(config: Config): String =
    SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(config.logical(System.currentTimeMillis())))

  private fun toJson(items: List<AlarmItemRecord>): String {
    val json = JSONArray()
    items.forEach {
      json.put(
        JSONObject().put("slug", it.slug).put("title", it.title).put("difficulty", it.difficulty).put("costMs", it.costMs.toLong())
          .put("deadlineMinutes", it.deadlineMinutes).put("icon", it.icon).put("color", it.color),
      )
    }
    return json.toString()
  }

  private fun fromJson(text: String?): List<Item> {
    val json = JSONArray(text ?: "[]")
    return (0 until json.length()).map { i ->
      val o = json.getJSONObject(i)
      Item(
        o.getString("slug"),
        o.getString("title"),
        o.getString("difficulty"),
        o.getLong("costMs"),
        o.optInt("deadlineMinutes", -1),
        o.optString("icon", ""),
        o.optString("color", ""),
      )
    }
  }

  fun write(ctx: Context, config: AlarmConfig) {
    prefs(ctx).edit()
      .putBoolean("enabled", config.enabled)
      .putInt("startHour", config.startHour)
      .putInt("endHour", config.endHour)
      .putInt("goal", config.goal)
      .putInt("learned", config.learnedToday)
      .putString("day", config.day)
      .putInt("dayStartHour", config.dayStartHour)
      .putString("upcoming", toJson(config.upcoming))
      .putInt("tomorrowGoal", config.tomorrowGoal)
      .putString("tomorrow", toJson(config.tomorrow))
      .putString("vibrationTimings", JSONArray(config.vibrationTimings.map { it.toLong() }).toString())
      .putInt("vibrationRepeat", config.vibrationRepeat)
      .putString("sound", config.sound)
      .apply()
  }

  fun read(ctx: Context): Config {
    val p = prefs(ctx)
    return Config(
      enabled = p.getBoolean("enabled", false),
      startHour = p.getInt("startHour", 9),
      endHour = p.getInt("endHour", 21),
      goal = p.getInt("goal", 1),
      learnedToday = p.getInt("learned", 0),
      day = p.getString("day", "") ?: "",
      dayStartHour = p.getInt("dayStartHour", 0),
      upcoming = fromJson(p.getString("upcoming", "[]")),
      tomorrowGoal = p.getInt("tomorrowGoal", 0),
      tomorrow = fromJson(p.getString("tomorrow", "[]")),
      vibrationTimings = p.getString("vibrationTimings", null)
        ?.let { text -> JSONArray(text).let { a -> LongArray(a.length()) { a.getLong(it) } } }
        ?: DEFAULT_VIBRATION,
      vibrationRepeat = p.getInt("vibrationRepeat", 0),
      sound = p.getString("sound", null) ?: "",
    )
  }

  /** Learned today; a config written on an earlier day counts as 0. */
  fun learnedToday(config: Config): Int = if (config.day == today(config)) config.learnedToday else 0

  fun saveNext(ctx: Context, at: Long?, item: Item?) {
    prefs(ctx).edit()
      .putLong("nextAt", at ?: 0L)
      .putString("nextSlug", item?.slug)
      .putString("nextTitle", item?.title)
      .apply()
  }

  /** The next alarm: the planned one or a pending snooze, whichever rings first. */
  fun next(ctx: Context): Triple<Long, String, String>? {
    val p = prefs(ctx)
    val now = System.currentTimeMillis()
    val at = p.getLong("nextAt", 0L)
    val planned = if (at > now) Triple(at, p.getString("nextSlug", "") ?: "", p.getString("nextTitle", "") ?: "") else null
    val snooze = readSnooze(ctx)?.let { (snoozeAt, item) -> Triple(snoozeAt, item.slug, item.title) }
    return listOfNotNull(planned, snooze).minByOrNull { it.first }
  }

  // ---------- Snooze ----------

  const val DEFAULT_SNOOZE_MINUTES = 10

  /** Last snooze length the user picked (the alarm screen's stepper and the notification action start from it). */
  fun snoozeMinutes(ctx: Context): Int = prefs(ctx).getInt("snoozeMinutes", DEFAULT_SNOOZE_MINUTES)

  fun saveSnooze(ctx: Context, at: Long, item: Item, minutes: Int) {
    val json = JSONObject()
      .put("slug", item.slug)
      .put("title", item.title)
      .put("difficulty", item.difficulty)
      .put("costMs", item.costMs)
      .put("deadlineMinutes", item.deadlineMinutes)
      .put("icon", item.icon)
      .put("color", item.color)
    prefs(ctx).edit()
      .putLong("snoozeAt", at)
      .putString("snoozeItem", json.toString())
      .putInt("snoozeMinutes", minutes)
      .apply()
  }

  /** The pending snooze (still ahead), if any. */
  fun readSnooze(ctx: Context): Pair<Long, Item>? {
    val p = prefs(ctx)
    val at = p.getLong("snoozeAt", 0L)
    if (at <= System.currentTimeMillis()) return null
    val o = JSONObject(p.getString("snoozeItem", null) ?: return null)
    return at to Item(
      o.getString("slug"),
      o.getString("title"),
      o.getString("difficulty"),
      o.getLong("costMs"),
      o.optInt("deadlineMinutes", -1),
      o.optString("icon", ""),
      o.optString("color", ""),
    )
  }

  fun clearSnooze(ctx: Context) {
    prefs(ctx).edit().remove("snoozeAt").remove("snoozeItem").apply()
  }
}
