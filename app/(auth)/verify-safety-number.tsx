import { AuthPlaceholderScreen } from '@/features/identity/screens/AuthPlaceholderScreen';

export default function VerifySafetyNumberRoute() {
  return (
    <AuthPlaceholderScreen
      step="03"
      title="确认安全号码"
      description="双方线下核对后，才能确认这段私密连接未被替换。"
    />
  );
}
