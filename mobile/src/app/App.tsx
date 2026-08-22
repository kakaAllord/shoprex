import { StatusBar } from 'expo-status-bar';
import { Platform, StatusBar as RNStatusBar, StyleSheet, View } from 'react-native';
import { ApiClient } from '../core/api/apiClient';
import { HealthScreen } from '../features/health/HealthScreen';
import { colors } from './theme';

/**
 * Shoprex Android shell.
 *
 * Device enrolment, the Mauzo selling flow, and stock receiving are built in
 * Phases 2, 4, and 5. For now the shell proves one thing: this installation
 * can reach exactly one Shoprex backend.
 *
 * The client is injectable so tests never touch the network.
 */
export default function App({ apiClient }: { apiClient?: ApiClient }) {
  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <HealthScreen apiClient={apiClient ?? new ApiClient()} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    // Android draws behind the status bar; keep content clear of it.
    paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 0) : 0,
  },
});
