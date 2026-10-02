package expo.modules.hermeskeepalive

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class HermesKeepAliveModule : Module() {
  private var running = false

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  override fun definition() = ModuleDefinition {
    Name("HermesKeepAlive")

    /** Start (or refresh) the foreground service. Returns false when Android refused it. */
    Function("start") { title: String, text: String ->
      val intent = Intent(context, KeepAliveService::class.java)
        .putExtra(KeepAliveService.EXTRA_TITLE, title)
        .putExtra(KeepAliveService.EXTRA_TEXT, text)
      try {
        ContextCompat.startForegroundService(context, intent)
        running = true
        true
      } catch (e: Exception) {
        // ForegroundServiceStartNotAllowedException and friends: the app is not in the foreground.
        false
      }
    }

    /** Change the notification text without restarting the service. */
    Function("update") { title: String, text: String ->
      if (!running) return@Function false
      KeepAliveService.ensureChannel(context)
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.notify(KeepAliveService.notificationId(), KeepAliveService.build(context, title, text))
      true
    }

    Function("stop") {
      running = false
      context.stopService(Intent(context, KeepAliveService::class.java))
    }

    OnDestroy {
      if (running) context.stopService(Intent(context, KeepAliveService::class.java))
    }
  }
}
