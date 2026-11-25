package expo.modules.studyalarms

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Full-screen alarm, over the lock screen too. The sound and vibration come from the insistent notification:
 * - «Начать» opens the topic (after unlocking);
 * - «Без звука» cancels the notification (sound and vibration stop) but keeps this screen open;
 * - «Отложить»: a quick chip (5/10/20/30 мин) snoozes at once; the «− N мин +» stepper (step 10) and its button snooze
 *   for a chosen time (AlarmScheduler.snooze; the last length is remembered).
 * Back or a minute without an answer dismisses it (counts as ignored; the next alarm was already planned). Once
 * silenced it stays up to 10 minutes.
 */
class AlarmActivity : Activity() {
  companion object {
    private const val TIMEOUT_MS = 60_000L
    private const val SILENCED_TIMEOUT_MS = 10 * 60_000L
    private val CHIPS = listOf(5, 10, 20, 30)
    private const val STEP = 10

    private val BG = Color.parseColor("#0F1115")
    private val CARD = Color.parseColor("#1A1D24")
    private val PRIMARY = Color.parseColor("#3B5BDB")
    private val ACCENT = Color.parseColor("#748FFC")
    private val MUTED = Color.parseColor("#9AA0A6")
    private val SUBTLE = Color.parseColor("#B0B6C3")
    private val LINE = Color.parseColor("#3A3F4B")

    /** The icon font, loaded once from the module's assets. */
    private var iconFont: Typeface? = null

    fun intent(ctx: Context, item: AlarmStore.Item): Intent =
      AlarmScheduler.putItem(Intent(ctx, AlarmActivity::class.java), item)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION)

    /** Stepper «+»: the next multiple of the step. */
    fun stepUp(minutes: Int): Int = minOf(AlarmScheduler.MAX_SNOOZE_MINUTES, (minutes / STEP + 1) * STEP)

    /** Stepper «−»: the previous multiple of the step, down to the shortest snooze. */
    fun stepDown(minutes: Int): Int =
      if (minutes <= STEP) AlarmScheduler.MIN_SNOOZE_MINUTES else ((minutes - 1) / STEP) * STEP
  }

  private val handler = Handler(Looper.getMainLooper())
  private var dp = 1f
  private lateinit var item: AlarmStore.Item
  private var snoozeMinutes = AlarmStore.DEFAULT_SNOOZE_MINUTES

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    window.statusBarColor = BG
    window.navigationBarColor = BG
    dp = resources.displayMetrics.density
    render(intent)
  }

  /** The screen is singleTask: a new ring (or the full-screen intent after the direct start) shows the new item. */
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    render(intent)
  }

  private fun render(intent: Intent) {
    item = AlarmScheduler.itemOf(intent)
    snoozeMinutes = AlarmStore.snoozeMinutes(this)
      .coerceIn(AlarmScheduler.MIN_SNOOZE_MINUTES, AlarmScheduler.MAX_SNOOZE_MINUTES)
    setContentView(build())
    restartTimeout(TIMEOUT_MS)
  }

  /** The topic icon (MaterialCommunityIcons glyph from JS) in the topic's color, or null without one. */
  private fun iconView(): TextView? {
    if (item.icon.isEmpty()) return null
    val face = iconFont ?: runCatching { Typeface.createFromAsset(assets, "fonts/MaterialCommunityIcons.ttf") }
      .getOrNull()
      ?.also { iconFont = it }
      ?: return null
    val color = runCatching { Color.parseColor(item.color) }.getOrDefault(ACCENT)
    return TextView(this).apply {
      text = item.icon
      typeface = face
      textSize = 112f
      setTextColor(color)
      gravity = Gravity.CENTER
      includeFontPadding = false
    }
  }

  private fun build(): View {
    val config = AlarmStore.read(this)
    val deadline = StudyPlan.atHour(config.logical(System.currentTimeMillis()), 0, config.endHour)
    val deadlineText = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(deadline))
    val minutes = item.costMs / 60_000L

    val content = column(Gravity.CENTER_HORIZONTAL).apply {
      val pad = (24 * dp).toInt()
      setPadding(pad, (48 * dp).toInt(), pad, pad)
    }
    content.addView(text("⏰  Пора поработать", 18f, ACCENT, bold = true))
    content.addView(space(16))
    // The topic's icon in its color fills the empty middle of the screen; nothing without an icon.
    iconView()?.let {
      content.addView(it)
      content.addView(space(12))
    }
    content.addView(text(item.title, 34f, Color.WHITE, bold = true))
    content.addView(space(8))
    content.addView(text("${AlarmNotification.difficultyLabel(item.difficulty)} · ~$minutes мин", 18f, SUBTLE))
    content.addView(space(8))
    content.addView(
      text("Сделано сегодня ${AlarmStore.learnedToday(config)} из ${config.goal} · день до $deadlineText", 14f, MUTED),
    )
    // Pushes the actions to the bottom on tall screens.
    content.addView(View(this), LinearLayout.LayoutParams(1, 0, 1f).apply { topMargin = (32 * dp).toInt() })

    content.addView(button("Начать", 22f, Color.WHITE, fill = PRIMARY, heightDp = 72) { start() }, fullWidth())
    content.addView(space(12))
    lateinit var silence: TextView
    silence = button("🔇  Без звука", 18f, Color.WHITE, stroke = LINE, heightDp = 60) {
      silence()
      silence.text = "Звук выключен"
      silence.alpha = 0.5f
      silence.isEnabled = false
    }
    content.addView(silence, fullWidth())
    content.addView(space(16))
    content.addView(snoozeCard(), fullWidth())

    return ScrollView(this).apply {
      setBackgroundColor(BG)
      isFillViewport = true
      addView(content, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    }
  }

  private fun snoozeCard(): View {
    val card = column(Gravity.CENTER_HORIZONTAL).apply {
      background = rounded(CARD, 20f)
      val pad = (16 * dp).toInt()
      setPadding(pad, pad, pad, pad)
    }
    card.addView(text("Отложить", 16f, SUBTLE, bold = true))
    card.addView(space(12))

    // Quick chips: one tap snoozes.
    val chips = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
    CHIPS.forEachIndexed { i, m ->
      chips.addView(
        button("$m мин", 16f, Color.WHITE, stroke = LINE, heightDp = 52, radius = 26f) { snooze(m) },
        LinearLayout.LayoutParams(0, (52 * dp).toInt(), 1f).apply { if (i > 0) marginStart = (8 * dp).toInt() },
      )
    }
    card.addView(chips, fullWidth())
    card.addView(space(16))

    // Stepper « −  N мин  + » and its button.
    lateinit var value: TextView
    lateinit var go: TextView
    val refresh = {
      value.text = "$snoozeMinutes мин"
      go.text = "Отложить на $snoozeMinutes мин"
    }
    val stepper = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
    }
    val round = (60 * dp).toInt()
    stepper.addView(
      button("−", 28f, Color.WHITE, stroke = LINE, heightDp = 60, radius = 30f) {
        snoozeMinutes = stepDown(snoozeMinutes)
        refresh()
      },
      LinearLayout.LayoutParams(round, round),
    )
    value = text("", 26f, Color.WHITE, bold = true)
    stepper.addView(value, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    stepper.addView(
      button("+", 28f, Color.WHITE, stroke = LINE, heightDp = 60, radius = 30f) {
        snoozeMinutes = stepUp(snoozeMinutes)
        refresh()
      },
      LinearLayout.LayoutParams(round, round),
    )
    card.addView(stepper, fullWidth())
    card.addView(space(12))
    go = button("", 18f, Color.WHITE, fill = Color.parseColor("#2B3040"), heightDp = 60) { snooze(snoozeMinutes) }
    card.addView(go, fullWidth())
    refresh()
    return card
  }

  // ---------- Actions ----------

  private fun start() {
    AlarmNotification.cancel(this)
    val open = { startActivity(AlarmNotification.openIntent(this, item.slug)) }
    // Over the lock screen the app can only open after unlocking.
    val keyguard = getSystemService(KeyguardManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && keyguard.isKeyguardLocked) {
      keyguard.requestDismissKeyguard(
        this,
        object : KeyguardManager.KeyguardDismissCallback() {
          override fun onDismissSucceeded() {
            open()
            finish()
          }
        },
      )
    } else {
      open()
      finish()
    }
  }

  /** Stops sound and vibration (they belong to the notification); the screen stays. */
  private fun silence() {
    AlarmNotification.cancel(this)
    restartTimeout(SILENCED_TIMEOUT_MS)
  }

  private fun snooze(minutes: Int) {
    AlarmScheduler.snooze(this, item, minutes)
    finish()
  }

  private fun dismiss() {
    AlarmNotification.cancel(this)
    finish()
  }

  private fun restartTimeout(ms: Long) {
    handler.removeCallbacksAndMessages(null)
    handler.postDelayed({ dismiss() }, ms)
  }

  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    super.onDestroy()
  }

  @Deprecated("Deprecated in Java")
  override fun onBackPressed() {
    dismiss()
  }

  // ---------- Views ----------

  private fun column(gravity: Int) = LinearLayout(this).apply {
    orientation = LinearLayout.VERTICAL
    this.gravity = gravity
  }

  private fun text(value: String, sizeSp: Float, color: Int, bold: Boolean = false) = TextView(this).apply {
    text = value
    textSize = sizeSp
    setTextColor(color)
    gravity = Gravity.CENTER
    if (bold) setTypeface(typeface, Typeface.BOLD)
  }

  private fun space(heightDp: Int) = View(this).apply {
    layoutParams = LinearLayout.LayoutParams(1, (heightDp * dp).toInt())
  }

  private fun fullWidth() =
    LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)

  private fun rounded(fill: Int?, radiusDp: Float, stroke: Int? = null) = GradientDrawable().apply {
    cornerRadius = radiusDp * dp
    setColor(fill ?: Color.TRANSPARENT)
    if (stroke != null) setStroke((1.5f * dp).toInt(), stroke)
  }

  /** A big rounded tappable label (dims while pressed). */
  private fun button(
    label: String,
    sizeSp: Float,
    color: Int,
    fill: Int? = null,
    stroke: Int? = null,
    heightDp: Int,
    radius: Float = 20f,
    onClick: () -> Unit,
  ) = text(label, sizeSp, color, bold = true).apply {
    minHeight = (heightDp * dp).toInt()
    background = rounded(fill, radius, stroke)
    isClickable = true
    isFocusable = true
    setOnTouchListener { v, e ->
      when (e.actionMasked) {
        android.view.MotionEvent.ACTION_DOWN -> v.alpha = 0.7f
        android.view.MotionEvent.ACTION_UP, android.view.MotionEvent.ACTION_CANCEL -> v.alpha = if (v.isEnabled) 1f else 0.5f
      }
      false
    }
    setOnClickListener { onClick() }
  }
}
