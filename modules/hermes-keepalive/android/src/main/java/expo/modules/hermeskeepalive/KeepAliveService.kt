package expo.modules.hermeskeepalive

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * Foreground service that exists only while the agent is working (or waiting for the user) and the
 * app may be in the background. Its job is to keep the process, and with it the gateway WebSocket,
 * from being frozen or killed, so "turn finished" and approval notifications still arrive.
 */
class KeepAliveService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Hermes is working"
    val text = intent?.getStringExtra(EXTRA_TEXT) ?: ""
    ensureChannel(this)
    val notification = build(this, title, text)
    try {
      val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC else 0
      ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type)
    } catch (e: Exception) {
      // Android 12+ refuses to start foreground services from the background; nothing to keep alive then.
      stopSelf()
      return START_NOT_STICKY
    }
    // Not sticky: if the system kills us, the app has gone with us and has nothing to resume.
    return START_NOT_STICKY
  }

  /** Android 15 caps dataSync services at six hours a day; bow out cleanly when told to. */
  override fun onTimeout(startId: Int, fgsType: Int) {
    stopSelf()
  }

  @Deprecated("Superseded by the two-argument overload on Android 15")
  override fun onTimeout(startId: Int) {
    stopSelf()
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    // The user swiped the app away: stop rather than keep an orphaned notification.
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  companion object {
    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"
    private const val CHANNEL_ID = "hermes-working"
    private const val NOTIFICATION_ID = 9119

    fun ensureChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (manager.getNotificationChannel(CHANNEL_ID) != null) return
      val channel = NotificationChannel(CHANNEL_ID, "Agent at work", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Shown while Hermes works on a turn so the connection stays open in the background."
        setShowBadge(false)
      }
      manager.createNotificationChannel(channel)
    }

    fun build(context: Context, title: String, text: String): Notification {
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
        flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
      }
      val content = launch?.let {
        PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      }
      return NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_stat_hermes)
        .setContentTitle(title)
        .setContentText(text)
        .setContentIntent(content)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setSilent(true)
        .setCategory(NotificationCompat.CATEGORY_PROGRESS)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
        .setProgress(0, 0, true)
        .build()
    }

    fun notificationId() = NOTIFICATION_ID
  }
}
