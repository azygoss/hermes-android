// Static launcher shortcuts (long-press the app icon): "New chat" and "Scheduled jobs",
// resolved through the `hermes` scheme already handled by MainActivity.
const { AndroidConfig, withAndroidManifest, withDangerousMod, withStringsXml } = require('expo/config-plugins')
const fs = require('fs')
const path = require('path')

const EN = { shortcut_new_chat: 'New chat', shortcut_scheduled_jobs: 'Scheduled jobs' }
const TR = { shortcut_new_chat: 'Yeni sohbet', shortcut_scheduled_jobs: 'Zamanlanmış işler' }

const shortcutsXml = (pkg, mainClass) => `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
    <shortcut
        android:shortcutId="new_chat"
        android:icon="@mipmap/ic_launcher_monochrome"
        android:shortcutShortLabel="@string/shortcut_new_chat"
        android:shortcutLongLabel="@string/shortcut_new_chat">
        <intent
            android:action="android.intent.action.VIEW"
            android:data="hermes:///chat?new=1"
            android:targetPackage="${pkg}"
            android:targetClass="${mainClass}" />
        <categories android:name="android.shortcut.DEFAULT" />
    </shortcut>
    <shortcut
        android:shortcutId="scheduled_jobs"
        android:icon="@mipmap/ic_launcher_monochrome"
        android:shortcutShortLabel="@string/shortcut_scheduled_jobs"
        android:shortcutLongLabel="@string/shortcut_scheduled_jobs">
        <intent
            android:action="android.intent.action.VIEW"
            android:data="hermes:///cron"
            android:targetPackage="${pkg}"
            android:targetClass="${mainClass}" />
        <categories android:name="android.shortcut.DEFAULT" />
    </shortcut>
</shortcuts>
`

const stringsXml = (labels) =>
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n` +
  Object.entries(labels)
    .map(([name, value]) => `    <string name="${name}">${value}</string>\n`)
    .join('') +
  `</resources>\n`

module.exports = function withShortcuts(config) {
  const pkg = config.android?.package ?? 'com.azygoss.hermes'
  const mainClass = `${pkg}.MainActivity`

  // Pin the shortcuts.xml on the main activity.
  config = withAndroidManifest(config, (cfg) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults)
    activity['meta-data'] = [
      ...(activity['meta-data'] ?? []).filter((m) => m.$['android:name'] !== 'android.app.shortcuts'),
      { $: { 'android:name': 'android.app.shortcuts', 'android:resource': '@xml/shortcuts' } },
    ]
    return cfg
  })

  // English labels in values/strings.xml.
  config = withStringsXml(config, (cfg) => {
    cfg.modResults = AndroidConfig.Strings.setStringItem(
      Object.entries(EN).map(([name, value]) => ({ _: value, $: { name } })),
      cfg.modResults,
    )
    return cfg
  })

  // Generated files: res/xml/shortcuts.xml and values-tr/strings.xml.
  config = withDangerousMod(config, [
    'android',
    (cfg) => {
      const res = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res')
      const xmlDir = path.join(res, 'xml')
      fs.mkdirSync(xmlDir, { recursive: true })
      fs.writeFileSync(path.join(xmlDir, 'shortcuts.xml'), shortcutsXml(pkg, mainClass))

      const trDir = path.join(res, 'values-tr')
      fs.mkdirSync(trDir, { recursive: true })
      const trFile = path.join(trDir, 'strings.xml')
      if (fs.existsSync(trFile)) {
        let existing = fs.readFileSync(trFile, 'utf8')
        for (const [name, value] of Object.entries(TR)) {
          if (existing.includes(`name="${name}"`)) continue
          existing = existing.replace('</resources>', `    <string name="${name}">${value}</string>\n</resources>`)
        }
        fs.writeFileSync(trFile, existing)
      } else {
        fs.writeFileSync(trFile, stringsXml(TR))
      }
      return cfg
    },
  ])

  return config
}
