import { CameraView, useCameraPermissions } from 'expo-camera'
import { useRef } from 'react'
import { View } from 'react-native'

import { Button, Sheet, Text } from '@/components/ui'
import { useT } from '@/i18n'
import { radius, space, useTheme } from '@/theme'

export function QrScanner({ visible, onClose, onScanned }: { visible: boolean; onClose: () => void; onScanned: (data: string) => void }) {
  const t = useT()
  const { c } = useTheme()
  const [permission, request] = useCameraPermissions()
  const done = useRef(false)

  return (
    <Sheet
      visible={visible}
      onClose={() => {
        done.current = false
        onClose()
      }}
      title={t('Scan a connection QR code')}
    >
      {!permission?.granted ? (
        <View style={{ gap: space.md }}>
          <Text tone="muted">{t('Hermes needs the camera to read the QR code.')}</Text>
          <Button label={t('Allow camera')} onPress={request} />
        </View>
      ) : visible ? (
        <View style={{ gap: space.md }}>
          <View style={{ aspectRatio: 1, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 2, borderColor: c.accent }}>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={(r) => {
                if (done.current) return
                done.current = true
                onScanned(r.data)
                setTimeout(() => (done.current = false), 1500)
              }}
            />
          </View>
          <Text tone="muted" variant="small">
            {t(
              'Encode a link like hermes://connect?url=http://host:9119&token=… as a QR code, for example with: qrencode -t ansiutf8 "<link>"',
            )}
          </Text>
        </View>
      ) : null}
    </Sheet>
  )
}
