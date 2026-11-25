package expo.modules.studyalarms

import android.content.Context
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Handler
import android.os.Looper

/** The phone's alarm sounds and ringtones for the picker, and a short preview. */
object AlarmSounds {
  private const val PREVIEW_MS = 5_000L
  private val handler = Handler(Looper.getMainLooper())
  private var preview: MediaPlayer? = null

  /** (title, uri): alarm sounds first, then ringtones; duplicates by URI dropped. */
  fun list(ctx: Context): List<Pair<String, String>> {
    val out = LinkedHashMap<String, String>()
    for (type in listOf(RingtoneManager.TYPE_ALARM, RingtoneManager.TYPE_RINGTONE)) {
      val manager = RingtoneManager(ctx).apply { setType(type) }
      try {
        val cursor = manager.cursor
        while (cursor.moveToNext()) {
          val uri = manager.getRingtoneUri(cursor.position).toString()
          val title = cursor.getString(RingtoneManager.TITLE_COLUMN_INDEX) ?: continue
          out.putIfAbsent(uri, title)
        }
      } catch (_: Exception) {
        // Some devices restrict a type's list; the others still show.
      }
    }
    return out.map { (uri, title) -> title to uri }
  }

  fun preview(ctx: Context, sound: String) {
    stopPreview()
    val uri = AlarmRingService.soundUri(sound) ?: return
    preview = AlarmRingService.playSound(ctx, uri, looping = false)
    handler.postDelayed({ stopPreview() }, PREVIEW_MS)
  }

  fun stopPreview() {
    handler.removeCallbacksAndMessages(null)
    preview?.let {
      try {
        it.stop()
      } catch (_: Exception) {
      }
      it.release()
    }
    preview = null
  }
}
