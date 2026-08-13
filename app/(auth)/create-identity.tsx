import { AuthPlaceholderScreen } from '@/features/identity/screens/AuthPlaceholderScreen';

export default function CreateIdentityRoute() {
  return (
    <AuthPlaceholderScreen
      step="01"
      title="创建你的本地身份"
      description="密钥只属于你。正式身份流程将在安全 Spike 验证后接入。"
    />
  );
}
