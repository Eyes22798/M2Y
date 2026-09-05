import { Redirect } from 'expo-router';

import { useIdentityRouteGuard } from '@/features/identity/routing';
import { SafetyNumberScreen } from '@/features/identity/screens/SafetyNumberScreen';

/** 安全码页面只呈现 native 已提交的真实状态；路由守卫负责阻止其他阶段越级进入。 */
export default function VerifySafetyNumberRoute() {
  const nextRoute = useIdentityRouteGuard('/verify-safety-number');

  if (nextRoute) {
    return <Redirect href={nextRoute} />;
  }

  return <SafetyNumberScreen />;
}
