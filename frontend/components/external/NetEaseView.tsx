import { useNetEaseStore } from '@/stores/netease-store';
import { NetEaseLogin } from './netease/NetEaseLogin';
import { NetEaseBrowser } from './netease/NetEaseBrowser';

export function NetEaseView() {
  const { cookie, userId, setSession, clearSession } = useNetEaseStore();
  
  if (!cookie || !userId) {
    return <NetEaseLogin onLoginSuccess={setSession} />;
  }

  return <NetEaseBrowser cookie={cookie} userId={userId} onLogout={clearSession} />;
}
