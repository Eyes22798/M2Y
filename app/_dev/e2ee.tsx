import { Redirect } from 'expo-router';

import { E2EENativeLoadScreen } from '@/testing/e2ee/E2EENativeLoadScreen';

export default function E2EENativeLoadRoute() {
  if (!__DEV__) {
    return <Redirect href="/settings" />;
  }

  return <E2EENativeLoadScreen />;
}
