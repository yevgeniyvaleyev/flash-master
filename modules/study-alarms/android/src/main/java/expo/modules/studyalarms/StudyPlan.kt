package expo.modules.studyalarms

import java.util.Calendar

/**
 * Kotlin mirror of src/logic/study-plan.ts (planDay / nextAlarmAt) — keep them in sync. The rest of the learning
 * day is split into one interval per remaining topic block and each block's learning time is centred in it.
 * Blocks with a topic deadline come first: for each deadline (earliest first) the blocks due by then form a group
 * spread from the end of the previous group up to that deadline (earlier if later deadlines need the time). Other
 * blocks before them in order join only while everything fits; the rest move after. The plan is in time order;
 * `index` points back to the item.
 */
object StudyPlan {
  const val MIN_ALARM_GAP_MS = 10 * 60_000L

  data class Block(val start: Long, val end: Long, val index: Int = 0)

  /** `deadlines[i]`: block i's topic deadline (null = the day's deadline). */
  fun planDay(now: Long, start: Long, deadline: Long, costs: List<Long>, deadlines: List<Long?> = emptyList()): List<Block> {
    val from = maxOf(now, start)
    if (costs.isEmpty() || from >= deadline) return emptyList()
    val own = LongArray(costs.size) { i ->
      val d = deadlines.getOrNull(i)
      if (d != null && d > from && d < deadline) d else Long.MAX_VALUE
    }
    fun cost(ids: List<Int>) = ids.sumOf { costs[it] }
    var remaining = costs.indices.toList()
    val plan = mutableListOf<Block>()
    var t = from
    fun place(ids: List<Int>, to: Long) {
      val group = spread(t, maxOf(t, to), ids.map { costs[it] })
      group.forEachIndexed { k, b -> plan.add(Block(b.start, b.end, ids[k])) }
      // The next group starts right after this one: free time before a deadline isn't wasted.
      t = group.last().end
      val placed = ids.toSet()
      remaining = remaining.filter { it !in placed }
    }

    val sorted = own.filter { it != Long.MAX_VALUE }.distinct().sorted()
    sorted.forEachIndexed { j, d ->
      val last = remaining.indexOfLast { own[it] <= d }
      if (last < 0) return@forEachIndexed
      val candidates = remaining.subList(0, last + 1)
      val due = candidates.filter { own[it] <= d }
      // End early enough that the work due by each later deadline still fits before it.
      var to = d
      for (later in sorted.drop(j + 1)) {
        to = minOf(to, later - cost(remaining.filter { own[it] > d && own[it] <= later }))
      }
      // Blocks without this deadline fill what's left before it, in order, as long as they fit.
      var room = to - t - cost(due)
      val group = candidates.filter { i ->
        when {
          own[i] <= d -> true
          costs[i] > room -> false
          else -> {
            room -= costs[i]
            true
          }
        }
      }
      place(group, to)
    }
    if (remaining.isNotEmpty()) place(remaining.toList(), deadline)
    return plan
  }

  /** Spreads `costs` evenly over [from, to]; back to back from `from` when they don't fit. */
  private fun spread(from: Long, to: Long, costs: List<Long>): List<Block> {
    val span = (to - from).toDouble()
    val total = costs.sum().toDouble()

    // Doesn't fit at all: back to back from now.
    if (total > span || span <= 0) {
      var t = from
      return costs.map { c -> Block(t, t + c).also { t += c } }
    }

    // Equal intervals when every block fits its interval, otherwise intervals proportional to cost.
    val equal = span / costs.size
    val proportional = costs.any { it > equal }
    var t = from.toDouble()
    return costs.map { c ->
      val width = if (proportional && total > 0) span * c / total else equal
      val mid = t + width / 2
      t += width
      Block((mid - c / 2.0).toLong(), (mid + c / 2.0).toLong())
    }
  }

  fun nextAlarmAt(plan: List<Block>, now: Long): Long? =
    plan.firstOrNull()?.let { maxOf(it.start, now + MIN_ALARM_GAP_MS) }

  /**
   * Timestamp of `minutes` after midnight on the app day of `dayMs` (already shifted back by the day start hour) moved
   * by `dayOffset` days; times before the day start hour fall after midnight (mirrors atMinutes in dates.ts).
   */
  fun atMinutes(dayMs: Long, dayOffset: Int, minutes: Int, dayStartHour: Int): Long =
    Calendar.getInstance().apply {
      timeInMillis = dayMs
      add(Calendar.DAY_OF_YEAR, dayOffset + if (minutes < dayStartHour * 60) 1 else 0)
      set(Calendar.HOUR_OF_DAY, minutes / 60)
      set(Calendar.MINUTE, minutes % 60)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }.timeInMillis

  /** Timestamp of `hour`:00 on the local day of `dayMs` shifted by `dayOffset` days (mirrors atHour in budget.ts). */
  fun atHour(dayMs: Long, dayOffset: Int, hour: Int): Long =
    Calendar.getInstance().apply {
      timeInMillis = dayMs
      add(Calendar.DAY_OF_YEAR, dayOffset)
      set(Calendar.HOUR_OF_DAY, hour)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }.timeInMillis
}
