// The background task must be defined before any screen exists: when the OS starts the app
// headlessly to sync saved reports, no component ever mounts (see docs/plans/uc3/D-offline-sync-design.md).
import './src/features/hazard-reports/background/syncTask';
import 'expo-router/entry';
