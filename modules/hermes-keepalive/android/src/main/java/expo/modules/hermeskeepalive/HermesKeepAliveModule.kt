package expo.modules.hermeskeepalive

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class HermesKeepAliveModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  override fun definition() = ModuleDefinition {
    Name("HermesKeepAlive")

    OnCreate {
      CrashReporter.install(context)
    }

    /** Last unacknowledged crash/ANR as a map, or null. */
    Function("lastExit") { CrashReporter.lastExit(context) }

    /** Mark the last crash report as seen. */
    Function("acknowledgeExit") { CrashReporter.acknowledge(context) }

    /** Start (or refresh) the foreground service. Returns false when Android refused it. */
    Function("start") { title: String, text: String ->
      val intent = Intent(context, KeepAliveService::class.java)
        .putExtra(KeepAliveService.EXTRA_TITLE, title)
        .putExtra(KeepAliveService.EXTRA_TEXT, text)
      try {
        KeepAliveService.state = ServiceState.STARTING
        ContextCompat.startForegroundService(context, intent)
        true
      } catch (e: Exception) {
        // ForegroundServiceStartNotAllowedException and friends: the app is not in the foreground.
        KeepAliveService.state = ServiceState.IDLE
        false
      }
    }

    /** Change the notification text without restarting the service. False when the service is gone. */
    Function("update") { title: String, text: String ->
      if (KeepAliveService.state == ServiceState.IDLE) return@Function false
      KeepAliveService.ensureChannel(context)
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.notify(KeepAliveService.notificationId(), KeepAliveService.build(context, title, text))
      true
    }

    Function("stop") {
      context.stopService(Intent(context, KeepAliveService::class.java))
    }

    OnDestroy {
      if (KeepAliveService.state != ServiceState.IDLE) context.stopService(Intent(context, KeepAliveService::class.java))
    }
  }
}
