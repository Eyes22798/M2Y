import { Redirect } from 'expo-router';

import { FlashListBenchmarkScreen } from '@/testing/benchmarks/FlashListBenchmarkScreen';

export default function FlashListBenchmarkRoute() {
  if (!__DEV__) {
    return <Redirect href="/settings" />;
  }

  return <FlashListBenchmarkScreen />;
}
