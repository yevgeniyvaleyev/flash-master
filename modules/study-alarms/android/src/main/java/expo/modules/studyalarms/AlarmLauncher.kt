package expo.modules.studyalarms

import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.util.Log

/**
 * Opens the alarm screen as soon as the alarm rings, so it's full screen even while the phone is in use (a
 * full-screen intent alone only opens over the lock screen; in use Android shows a heads-up banner). Android blocks
 * activity starts from the background unless the app has a bound accessibility service (FlashMaster's app blocker)
 * or may draw over other apps («Поверх других приложений»). Without either, the notification stays as before.
 */
object AlarmLauncher {
  private const val TAG = "FlashMasterAlarm"

  /** One of this app's accessibility services is enabled (the app blocker lives in another module). */
  fun accessibilityEnabled(ctx: Context): Boolean {
    val enabled = Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
    return enabled.split(':').any { it.startsWith("${ctx.packageName}/") }
  }

  fun canDrawOverlays(ctx: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(ctx)

  fun canLaunch(ctx: Context): Boolean = accessibilityEnabled(ctx) || canDrawOverlays(ctx)

  fun launch(ctx: Context, item: AlarmStore.Item) {
    if (!canLaunch(ctx)) return
    try {
      ctx.startActivity(AlarmActivity.intent(ctx, item))
    } catch (e: Exception) {
      Log.w(TAG, "Alarm screen not started; the notification remains", e)
    }
  }
}
