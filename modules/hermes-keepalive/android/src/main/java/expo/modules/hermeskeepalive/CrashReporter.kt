package expo.modules.hermeskeepalive

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import android.os.Process
import java.io.File
import java.time.Instant
import kotlin.system.exitProcess

/**
 * Remembers why the app last died. A default uncaught-exception handler writes a plain-text
 * report to filesDir/last-crash.txt, then hands off to the previous handler so Android still
 * shows its normal crash flow. On API 30+ lastExit() also consults
 * getHistoricalProcessExitReasons for ANRs and native crashes, which Java handlers never see.
 */
object CrashReporter {
  private const val CRASH_FILE = "last-crash.txt"
  private const val PREFS = "hermes-crash-reporter"
  private const val KEY_ACK = "acknowledged_exit_ts"
  private const val TRACE_LINES = 200

  @Volatile private var installed = false

  @Synchronized
  fun install(context: Context) {
    if (installed) return
    installed = true
    val app = context.applicationContext
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
      try {
        val version =
          try {
            app.packageManager.getPackageInfo(app.packageName, 0).versionName
          } catch (e: Exception) {
            "?"
          }
        File(app.filesDir, CRASH_FILE).writeText(
          "thread: ${thread.name}\n" +
            "time: ${Instant.ofEpochMilli(System.currentTimeMillis())}\n" +
            "version: $version\n\n" +
            throwable.stackTraceToString(),
        )
      } catch (e: Exception) {
        // Never let the reporter replace the real crash handling.
      }
      if (previous != null) previous.uncaughtException(thread, throwable)
      else {
        Process.killProcess(Process.myPid())
        exitProcess(10)
      }
    }
  }

  /** Most recent crash/ANR newer than the acknowledged timestamp, or null. */
  fun lastExit(context: Context): Map<String, Any?>? {
    val app = context.applicationContext
    val ack = ackTimestamp(app)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val info = latestExit(app)
      if (info != null && info.timestamp > ack) {
        val reason =
          when (info.reason) {
            ApplicationExitInfo.REASON_CRASH -> "crash"
            ApplicationExitInfo.REASON_CRASH_NATIVE -> "native_crash"
            ApplicationExitInfo.REASON_ANR -> "anr"
            else -> null
          }
        if (reason != null) {
          val trace = if (reason == "crash") crashFileText(app) ?: traceText(info) else traceText(info) ?: crashFileText(app)
          return mapOf(
            "reason" to reason,
            "timestamp" to info.timestamp.toDouble(),
            "description" to (info.description ?: reason),
            "trace" to (trace ?: ""),
          )
        }
      }
    }
    // Older Androids (or a missing exit record): the handler's own report is all we have.
    val file = File(app.filesDir, CRASH_FILE)
    if (file.exists() && file.lastModified() > ack) {
      return mapOf(
        "reason" to "crash",
        "timestamp" to file.lastModified().toDouble(),
        "description" to "Uncaught exception",
        "trace" to file.readText(),
      )
    }
    return null
  }

  /** The user has seen (or ignored) the report — don't surface it again. */
  fun acknowledge(context: Context) {
    val app = context.applicationContext
    app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong(KEY_ACK, System.currentTimeMillis()).apply()
    File(app.filesDir, CRASH_FILE).delete()
  }

  private fun ackTimestamp(context: Context) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(KEY_ACK, 0L)

  private fun latestExit(context: Context): ApplicationExitInfo? {
    val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    return try {
      am.getHistoricalProcessExitReasons(context.packageName, 0, 1).firstOrNull()
    } catch (e: Exception) {
      null
    }
  }

  private fun crashFileText(context: Context): String? {
    val file = File(context.filesDir, CRASH_FILE)
    return try {
      if (file.exists()) file.readText() else null
    } catch (e: Exception) {
      null
    }
  }

  /** ANR traces and native tombstones come back as a stream; keep the head only. */
  private fun traceText(info: ApplicationExitInfo): String? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return null
    return try {
      info.traceInputStream?.bufferedReader()?.use { reader ->
        val out = StringBuilder()
        reader.lineSequence().take(TRACE_LINES).forEach { out.append(it).append('\n') }
        out.toString().ifEmpty { null }
      }
    } catch (e: Exception) {
      null
    }
  }
}
