package expo.modules.studyalarms

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

/** Keeps exactly one exact alarm set: the start of the next planned block (today, or tomorrow once today is done). */
object AlarmScheduler {
  private const val REQUEST_ALARM = 1
  private const val REQUEST_TEST = 2
  private const val REQUEST_SNOOZE = 3
  private const val TEST_DELAY_MS = 5_000L

  const val EXTRA_SLUG = "slug"
  const val EXTRA_TITLE = "title"
  const val EXTRA_DIFFICULTY = "difficulty"
  const val EXTRA_COST = "costMs"
  const val EXTRA_DEADLINE = "deadlineMinutes"
  /** The ring comes from a snooze (not from the plan). */
  const val EXTRA_SNOOZE = "snooze"
  const val MIN_SNOOZE_MINUTES = 5
  const val MAX_SNOOZE_MINUTES = 120

  data class Next(val at: Long, val item: AlarmStore.Item)

  fun computeNext(ctx: Context, now: Long): Next? {
    val config = AlarmStore.read(ctx)
    if (!config.enabled) return null
    // A config written on an earlier day is stale: that day's work list no longer applies, plan a fresh day.
    val stale = config.day != AlarmStore.today(config)
    for (dayOffset in 0..1) {
      // A fresh day has the full targets of every topic (`tomorrow`); today has the topics with work left.
      val fresh = dayOffset == 1 || stale
      val learned = if (fresh) 0 else AlarmStore.learnedToday(config)
      val goal = if (fresh) config.tomorrowGoal else config.goal
      val items = (if (fresh) config.tomorrow else config.upcoming).take(maxOf(0, goal - learned))
      if (items.isEmpty()) continue
      // Hours of the app's day (startHour ≥ the day start hour, so they never fall before the day begins).
      val start = StudyPlan.atHour(config.logical(now), dayOffset, config.startHour)
      val deadline = StudyPlan.atHour(config.logical(now), dayOffset, config.endHour)
      val deadlines = items.map {
        if (it.deadlineMinutes < 0) null
        else StudyPlan.atMinutes(config.logical(now), dayOffset, it.deadlineMinutes, config.dayStartHour)
      }
      val plan = StudyPlan.planDay(now, start, deadline, items.map { it.costMs }, deadlines)
      val at = StudyPlan.nextAlarmAt(plan, now) ?: continue
      // The plan is in time order; a block before a topic deadline may come ahead of the list's first item.
      if (at < deadline) return Next(at, items[plan[0].index])
    }
    return null
  }

  /**
   * Cancels the pending alarm and sets the next one from the stored plan inputs. A pending snooze is set again too
   * (alarms don't survive a reboot or an app update).
   */
  fun reschedule(ctx: Context) {
    val am = ctx.getSystemService(AlarmManager::class.java)
    am.cancel(alarmIntent(ctx, REQUEST_ALARM, null))
    val next = computeNext(ctx, System.currentTimeMillis())
    AlarmStore.saveNext(ctx, next?.at, next?.item)
    if (next != null) set(ctx, am, next.at, alarmIntent(ctx, REQUEST_ALARM, next.item))
    AlarmStore.readSnooze(ctx)?.let { (at, item) -> set(ctx, am, at, alarmIntent(ctx, REQUEST_SNOOZE, item, snooze = true)) }
  }

  /** Rings `item` again in `minutes` (one snooze at a time; a new one replaces it) and stops the ringing alarm. */
  fun snooze(ctx: Context, item: AlarmStore.Item, minutes: Int) {
    val m = minutes.coerceIn(MIN_SNOOZE_MINUTES, MAX_SNOOZE_MINUTES)
    val at = System.currentTimeMillis() + m * 60_000L
    AlarmStore.saveSnooze(ctx, at, item, m)
    set(ctx, ctx.getSystemService(AlarmManager::class.java), at, alarmIntent(ctx, REQUEST_SNOOZE, item, snooze = true))
    AlarmNotification.cancel(ctx)
  }

  /** The item an alarm intent carries (see `alarmIntent`). */
  fun itemOf(intent: Intent) = AlarmStore.Item(
    slug = intent.getStringExtra(EXTRA_SLUG) ?: "",
    title = intent.getStringExtra(EXTRA_TITLE) ?: "",
    difficulty = intent.getStringExtra(EXTRA_DIFFICULTY) ?: "",
    costMs = intent.getLongExtra(EXTRA_COST, 0L),
    deadlineMinutes = intent.getIntExtra(EXTRA_DEADLINE, -1),
  )

  /** Puts `item` into an intent's extras. */
  fun putItem(intent: Intent, item: AlarmStore.Item): Intent =
    intent.putExtra(EXTRA_SLUG, item.slug)
      .putExtra(EXTRA_TITLE, item.title)
      .putExtra(EXTRA_DIFFICULTY, item.difficulty)
      .putExtra(EXTRA_COST, item.costMs)
      .putExtra(EXTRA_DEADLINE, item.deadlineMinutes)

  fun test(ctx: Context) {
    val item = AlarmStore.read(ctx).upcoming.firstOrNull()
      ?: AlarmStore.Item("", "Тестовый будильник", "проверка", 30 * 60_000L)
    val am = ctx.getSystemService(AlarmManager::class.java)
    set(ctx, am, System.currentTimeMillis() + TEST_DELAY_MS, alarmIntent(ctx, REQUEST_TEST, item))
  }

  private fun set(ctx: Context, am: AlarmManager, at: Long, operation: PendingIntent) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, operation)
      return
    }
    // An alarm clock is exact, fires in Doze and shows the alarm icon; tapping that icon opens the app.
    val show = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.let {
      PendingIntent.getActivity(ctx, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    am.setAlarmClock(AlarmManager.AlarmClockInfo(at, show), operation)
  }

  private fun alarmIntent(ctx: Context, requestCode: Int, item: AlarmStore.Item?, snooze: Boolean = false): PendingIntent {
    val intent = Intent(ctx, AlarmReceiver::class.java).setAction(AlarmReceiver.ACTION_RING)
    if (item != null) putItem(intent, item).putExtra(EXTRA_SNOOZE, snooze)
    return PendingIntent.getBroadcast(
      ctx,
      requestCode,
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
  }
}
