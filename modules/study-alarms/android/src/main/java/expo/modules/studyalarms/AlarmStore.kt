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

  data class Item(val slug: String, val title: String, val difficulty: String, val costMs: Long)

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
        JSONObject().put("slug", it.slug).put("title", it.title).put("difficulty", it.difficulty).put("costMs", it.costMs.toLong()),
      )
    }
    return json.toString()
  }

  private fun fromJson(text: String?): List<Item> {
    val json = JSONArray(text ?: "[]")
    return (0 until json.length()).map { i ->
      val o = json.getJSONObject(i)
      Item(o.getString("slug"), o.getString("title"), o.getString("difficulty"), o.getLong("costMs"))
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

  fun next(ctx: Context): Triple<Long, String, String>? {
    val p = prefs(ctx)
    val at = p.getLong("nextAt", 0L)
    if (at <= System.currentTimeMillis()) return null
    return Triple(at, p.getString("nextSlug", "") ?: "", p.getString("nextTitle", "") ?: "")
  }
}
