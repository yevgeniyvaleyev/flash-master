package expo.modules.studyalarms

import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log

/**
 * Rings one alarm as a short foreground service: the chosen sound looped (setting «Мелодия будильника»; silent
 * possible) and the vibration waveform built in JS (preset × repetition: once, N times, or until answered with a
 * pause). Shows the alarm notification as its foreground notification. Stops when the alarm is answered (Начать,
 * Без звука, Отложить, back, swipe) or after RING_MS.
 */
class AlarmRingService : Service() {
  companion object {
    private const val TAG = "FlashMasterAlarm"
    const val RING_MS = 60_000L
    private const val ACTION_RING = "expo.modules.studyalarms.RING_SERVICE"

    fun start(ctx: Context, item: AlarmStore.Item) {
      val intent = AlarmScheduler.putItem(Intent(ctx, AlarmRingService::class.java).setAction(ACTION_RING), item)
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(intent) else ctx.startService(intent)
      } catch (e: Exception) {
        // Not allowed to start now: show the (silent) notification and vibrate once.
        Log.w(TAG, "Ring service not started", e)
        ctx.getSystemService(NotificationManager::class.java)
          .notify(AlarmNotification.NOTIFICATION_ID, AlarmNotification.build(ctx, item, RING_MS))
        val config = AlarmStore.read(ctx)
        vibrate(ctx, config.vibrationTimings, -1)
      }
    }

    fun stop(ctx: Context) {
      ctx.stopService(Intent(ctx, AlarmRingService::class.java))
    }

    private fun vibrator(ctx: Context): Vibrator? =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        ctx.getSystemService(VibratorManager::class.java)?.defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
      }

    fun vibrate(ctx: Context, timings: LongArray, repeat: Int) {
      if (timings.size < 2 || timings.all { it == 0L }) return
      val v = vibrator(ctx) ?: return
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val attrs = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build()
        @Suppress("DEPRECATION")
        v.vibrate(VibrationEffect.createWaveform(timings, repeat.coerceIn(-1, timings.size - 1)), attrs)
      } else {
        @Suppress("DEPRECATION")
        v.vibrate(timings, repeat)
      }
    }

    fun cancelVibration(ctx: Context) {
      vibrator(ctx)?.cancel()
    }

    /** The stored sound: '' = the default alarm sound, "silent" = none, else a content URI. */
    fun soundUri(sound: String): Uri? = when (sound) {
      "silent" -> null
      "" -> RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
        ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
      else -> Uri.parse(sound)
    }

    fun playSound(ctx: Context, uri: Uri, looping: Boolean): MediaPlayer? =
      try {
        MediaPlayer().apply {
          setAudioAttributes(
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_ALARM)
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
              .build(),
          )
          setDataSource(ctx, uri)
          isLooping = looping
          prepare()
          start()
        }
      } catch (e: Exception) {
        Log.w(TAG, "Sound not played: $uri", e)
        null
      }
  }

  private val handler = Handler(Looper.getMainLooper())
  private var player: MediaPlayer? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val item = intent?.let { AlarmScheduler.itemOf(it) } ?: AlarmStore.Item("", "", "", 0L)
    val notification = AlarmNotification.build(this, item, RING_MS)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(AlarmNotification.NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(AlarmNotification.NOTIFICATION_ID, notification)
    }

    // A new ring replaces the one in progress.
    release()
    val config = AlarmStore.read(this)
    soundUri(config.sound)?.let { uri ->
      player = playSound(this, uri, looping = true)
        ?: soundUri("")?.takeIf { config.sound != "" }?.let { playSound(this, it, looping = true) }
    }
    vibrate(this, config.vibrationTimings, config.vibrationRepeat)

    handler.removeCallbacksAndMessages(null)
    handler.postDelayed({ stopSelf() }, RING_MS)
    return START_NOT_STICKY
  }

  private fun release() {
    player?.let {
      try {
        it.stop()
      } catch (_: Exception) {
      }
      it.release()
    }
    player = null
    cancelVibration(this)
  }

  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    release()
    @Suppress("DEPRECATION")
    stopForeground(true)
    super.onDestroy()
  }
}
