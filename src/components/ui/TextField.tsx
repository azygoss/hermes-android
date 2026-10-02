import { Eye, EyeOff } from '@/components/icons'
import { forwardRef, useState } from 'react'
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native'

import { useT } from '@/i18n'
import { font, radius, space, useTheme } from '@/theme'

import { IconButton } from './Button'
import { Text } from './Text'

interface Props extends TextInputProps {
  label?: string
  helper?: string
  error?: string | null
  mono?: boolean
  secret?: boolean
  minLines?: number
}

/** Labelled input; errors render under the field (never placeholder-only labels). */
export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, helper, error, mono, secret, multiline, minLines = 3, style, ...rest },
  ref,
) {
  const { c } = useTheme()
  const t = useT()
  const [focused, setFocused] = useState(false)
  const [hidden, setHidden] = useState(true)
  return (
    <View style={{ gap: space.xs }}>
      {label ? (
        <Text variant="small" weight="medium" tone="muted" nativeID={`${label}-label`}>
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.box,
          {
            backgroundColor: c.surface,
            borderColor: error ? c.danger : focused ? c.accent : c.border,
          },
        ]}
      >
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityLabelledBy={label ? `${label}-label` : undefined}
          placeholderTextColor={c.textFaint}
          selectionColor={c.accent}
          cursorColor={c.accent}
          secureTextEntry={secret && hidden}
          autoCapitalize={secret || mono ? 'none' : rest.autoCapitalize}
          autoCorrect={secret || mono ? false : rest.autoCorrect}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true)
            rest.onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            rest.onBlur?.(e)
          }}
          style={[
            styles.input,
            {
              color: c.text,
              fontFamily: mono ? font.mono : font.regular,
              minHeight: multiline ? minLines * 22 + 20 : 48,
              textAlignVertical: multiline ? 'top' : 'center',
            },
            style,
          ]}
          {...rest}
        />
        {secret ? (
          <IconButton
            icon={hidden ? Eye : EyeOff}
            label={hidden ? t('Show value') : t('Hide value')}
            onPress={() => setHidden(!hidden)}
            size={18}
          />
        ) : null}
      </View>
      {error ? (
        <Text variant="small" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : helper ? (
        <Text variant="caption" tone="faint">
          {helper}
        </Text>
      ) : null}
    </View>
  )
})

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.md, paddingLeft: space.md },
  input: { flex: 1, fontSize: 15, paddingVertical: space.sm, paddingRight: space.md },
})
