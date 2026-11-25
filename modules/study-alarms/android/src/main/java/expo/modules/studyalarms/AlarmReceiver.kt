package expo.modules.studyalarms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Rings the alarm and immediately plans the next one from "now": if the user ignores or dismisses it, the
 * rest of the day is already re-planned against the remaining time. Logging units re-plans again from JS.
 * A ring shows the insistent notification (sound, vibration) and opens the alarm screen right away when Android allows
 * it (AlarmLauncher), so it's full screen even while the phone is in use. A snoozed ring is skipped once the day's
 * targets are met or alarms are off.
 */
class AlarmReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION_RING = "expo.modules.studyalarms.RING"
    const val ACTION_DISMISS = "expo.modules.studyalarms.DISMISS"
    /** Notification action: snooze for the last used length. */
    const val ACTION_SNOOZE = "expo.modules.studyalarms.SNOOZE"
  }

  /** Alarms are on and today's targets aren't met yet. */
  private fun stillDue(context: Context): Boolean {
    val config = AlarmStore.read(context)
    return config.enabled && AlarmStore.learnedToday(config) < config.goal
  }

  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      ACTION_DISMISS -> AlarmNotification.cancel(context)
      ACTION_SNOOZE ->
        AlarmScheduler.snooze(context, AlarmScheduler.itemOf(intent), AlarmStore.snoozeMinutes(context))
      ACTION_RING -> {
        val item = AlarmScheduler.itemOf(intent)
        val snoozed = intent.getBooleanExtra(AlarmScheduler.EXTRA_SNOOZE, false)
        if (snoozed) AlarmStore.clearSnooze(context)
        if (!snoozed || stillDue(context)) {
          AlarmNotification.show(context, item)
          AlarmLauncher.launch(context, item)
        }
        AlarmScheduler.reschedule(context)
      }
    }
  }
}
