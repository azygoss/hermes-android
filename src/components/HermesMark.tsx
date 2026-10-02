import Svg, { Circle, Path } from 'react-native-svg'

import { useTheme } from '@/theme'

/** Caduceus-style mark: orb, winged staff and two intertwined snakes. Shared with the app icon (assets/icon.svg). */
export const MARK_PATHS = {
  wingLeft: 'M46 30 C36 22 24 16 10 18 C18 22 22 26 24 28 C18 28 14 30 12 33 C22 33 30 34 46 38 Z',
  wingRight: 'M54 30 C64 22 76 16 90 18 C82 22 78 26 76 28 C82 28 86 30 88 33 C78 33 70 34 54 38 Z',
  staff: 'M50 22 L50 92',
  snakeA: 'M50 44 C67 50 67 60 50 66 C33 72 33 82 50 88',
  snakeB: 'M50 44 C33 50 33 60 50 66 C67 72 67 82 50 88',
}

export function HermesMark({ size = 40, color }: { size?: number; color?: string }) {
  const { c } = useTheme()
  const fill = color ?? c.accent
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="Hermes">
      <Path d={MARK_PATHS.wingLeft} fill={fill} />
      <Path d={MARK_PATHS.wingRight} fill={fill} />
      <Path d={MARK_PATHS.staff} stroke={fill} strokeWidth={5} strokeLinecap="round" />
      <Path d={MARK_PATHS.snakeA} stroke={fill} strokeWidth={4.5} fill="none" strokeLinecap="round" />
      <Path d={MARK_PATHS.snakeB} stroke={fill} strokeWidth={4.5} fill="none" strokeLinecap="round" />
      <Circle cx={50} cy={15} r={7} fill={fill} />
    </Svg>
  )
}
