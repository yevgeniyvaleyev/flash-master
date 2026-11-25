package expo.modules.studyalarms

import android.app.NotificationManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class AlarmItemRecord : Record {
  @Field var slug: String = ""
  @Field var title: String = ""
  @Field var difficulty: String = "easy"
  @Field var costMs: Double = 0.0
  /** The topic's deadline in minutes after midnight; -1 = none. */
  @Field var deadlineMinutes: Int = -1
}

/** Planning inputs pushed from JS whenever progress or settings change. */
class AlarmConfig : Record {
  @Field var enabled: Boolean = false
  @Field var startHour: Int = 9
  @Field var endHour: Int = 21
  @Field var goal: Int = 3
  @Field var learnedToday: Int = 0
  @Field var day: String = ""
  @Field var dayStartHour: Int = 0
  @Field var upcoming: List<AlarmItemRecord> = emptyList()
  /** A fresh day's full work (every target), planned for tomorrow or once the stored day is over. */
  @Field var tomorrowGoal: Int = 0
  @Field var tomorrow: List<AlarmItemRecord> = emptyList()
  /** The ring's vibration waveform ([off, on, off, …] ms; empty = none) and the index it repeats from (-1 = once). */
  @Field var vibrationTimings: List<Double> = emptyList()
  @Field var vibrationRepeat: Int = 0
  /** Alarm sound: "" = the default alarm sound, "silent" = none, else a content URI. */
  @Field var sound: String = ""
}

class StudyAlarmsModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("FlashMasterStudyAlarms")

    Function("setConfig") { config: AlarmConfig ->
      AlarmStore.write(context, config)
      AlarmScheduler.reschedule(context)
    }

    Function("getNextAlarm") {
      AlarmStore.next(context)?.let { (at, slug, title) ->
        mapOf("at" to at.toDouble(), "slug" to slug, "title" to title)
      }
    }

    Function("canUseFullScreenIntent") {
      if (Build.VERSION.SDK_INT >= 34) {
        context.getSystemService(NotificationManager::class.java).canUseFullScreenIntent()
      } else {
        true
      }
    }

    Function("openFullScreenIntentSettings") {
      val intent =
        if (Build.VERSION.SDK_INT >= 34) {
          Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${context.packageName}"))
        } else {
          Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        }
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /** The alarm screen can open by itself while the phone is in use (accessibility service or overlay permission). */
    Function("canOpenAlarmScreen") {
      AlarmLauncher.canLaunch(context)
    }

    Function("openOverlaySettings") {
      val intent =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}"))
        } else {
          Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
        }
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /** Alarm sounds of the phone (then its ringtones), for «Мелодия будильника». */
    Function("getAlarmSounds") {
      AlarmSounds.list(context).map { (title, uri) -> mapOf("title" to title, "uri" to uri) }
    }

    /** Plays a sound for a few seconds ("" = the default alarm sound). */
    Function("previewSound") { sound: String ->
      AlarmSounds.preview(context, sound)
    }

    Function("stopPreview") {
      AlarmSounds.stopPreview()
    }

    Function("testAlarm") {
      AlarmScheduler.test(context)
    }
  }
}
