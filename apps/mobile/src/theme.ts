import { darkSemantic, lightSemantic, shape } from '@tessera/tokens';
import type { ColorSchemeName } from 'react-native';

export function colors(scheme: ColorSchemeName) {
  return scheme === 'dark' ? darkSemantic : lightSemantic;
}

export const layout = {
  radius: shape.radiusTileLg,
  touch: shape.touchTargetMin,
};
