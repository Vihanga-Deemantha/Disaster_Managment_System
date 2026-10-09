import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { API_BASE_URL } from '@/shared/config';
import type { ConnectivityMonitor } from '../offline/ports';

const online = (state: NetInfoState) =>
  state.isConnected === true && state.isInternetReachable !== false;
/** Constructed once, before screen listeners mount. Probe our API rather than public internet. */
export class NetInfoConnectivityMonitor implements ConnectivityMonitor {
  constructor() {
    NetInfo.configure({
      reachabilityUrl: `${API_BASE_URL}/api/health`,
      reachabilityMethod: 'GET',
      useNativeReachability: false,
      reachabilityTest: async (response) => response.status === 200,
      reachabilityShortTimeout: 5000,
      reachabilityLongTimeout: 30000,
      reachabilityRequestTimeout: 5000,
    });
  }
  async isOnline(): Promise<boolean> {
    return online(await NetInfo.fetch());
  }
  onChange(listener: (connected: boolean) => void): () => void {
    return NetInfo.addEventListener((state) => listener(online(state)));
  }
  onReconnect(listener: () => void): () => void {
    let wasOnline = true;
    return NetInfo.addEventListener((state) => {
      const connected = online(state);
      if (connected && !wasOnline) listener();
      wasOnline = connected;
    });
  }
}
