import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useT } from '@/shared/i18n/I18nProvider';
import { radius, spacing } from '@/shared/theme/tokens';
import { AppText } from '@/shared/ui/AppText';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { parseMapMessage, type MapPoint } from '../domain/mapMessage';
import { mapDocument } from './mapDocument';

interface Props {
  centre: MapPoint;
  pin?: MapPoint;
  editable: boolean;
  onPin: (point: MapPoint) => void;
}
export function MapPin({ centre, pin, editable, onPin }: Props) {
  const t = useT();
  const web = useRef<WebView>(null);
  // Keep the document stable while a marker is dragged; rerenders must not reset map zoom/pan.
  const [source] = useState(() => ({ html: mapDocument(centre) }));
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const update = useCallback(() => {
    const point = pin ? { lat: pin.lat, lng: pin.lng } : null;
    web.current?.injectJavaScript?.(
      `window.updatePin && window.updatePin(${JSON.stringify(point)},${editable},${JSON.stringify({ lat: centre.lat, lng: centre.lng })});true;`,
    );
  }, [pin, editable, centre.lat, centre.lng]);
  useEffect(update, [update]);
  return (
    <View style={{ gap: spacing.sm }}>
      <WebView
        key={version}
        ref={web}
        testID="report-map"
        accessibilityLabel={t('reports.location.map')}
        style={styles.map}
        source={source}
        originWhitelist={['*']}
        javaScriptEnabled
        scrollEnabled={false}
        onShouldStartLoadWithRequest={({ url }) => url === 'about:blank'}
        onError={() => setFailed(true)}
        onHttpError={() => setFailed(true)}
        onMessage={({ nativeEvent }) => {
          const message = parseMapMessage(nativeEvent.data);
          if (message?.type === 'READY') update();
          if (message?.type === 'ERROR') setFailed(true);
          if (message?.type === 'PIN' && editable) onPin(message.point);
        }}
      />
      {pin ? <AppText>{`${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`}</AppText> : null}
      {failed ? (
        <>
          <Banner tone="warning">{t('reports.location.mapUnavailable')}</Banner>
          <Button
            title={t('reports.location.reloadMap')}
            variant="ghost"
            onPress={() => {
              setFailed(false);
              setVersion((value) => value + 1);
            }}
          />
        </>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({ map: { height: 240, borderRadius: radius.md } });
