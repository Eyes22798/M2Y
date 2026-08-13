import { AuthPlaceholderScreen } from '@/features/identity/screens/AuthPlaceholderScreen';

export default function PairRoute() {
  return (
    <AuthPlaceholderScreen
      step="02"
      title="连接另一个人"
      description="M2Y 只维护一段双人关系；配对协议将在 E2EE Spike 后实现。"
    />
  );
}
