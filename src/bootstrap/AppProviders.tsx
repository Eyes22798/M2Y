import { type PropsWithChildren, useState } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SecureWorkspaceGate } from '@/features/secure-workspace/SecureWorkspaceGate';
import { SecureWorkspaceProvider } from '@/stores/secure-workspace/SecureWorkspaceProvider';

import { createAppRuntime, type AppRuntime } from './createAppRuntime';

export function AppProviders({ children, runtime }: PropsWithChildren<{ runtime?: AppRuntime }>) {
  const [appRuntime] = useState(() => runtime ?? createAppRuntime());
  return (
    <GestureHandlerRootView style={styles.root}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <SecureWorkspaceProvider controller={appRuntime.secureWorkspaceController}>
            <SecureWorkspaceGate>{children}</SecureWorkspaceGate>
          </SecureWorkspaceProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
