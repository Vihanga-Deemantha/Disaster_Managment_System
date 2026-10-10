/** Images are imported like any module; Metro (and Jest) turn them into a value `Image` accepts. */
declare module '*.png' {
  import type { ImageSourcePropType } from 'react-native';
  const source: ImageSourcePropType;
  export default source;
}
