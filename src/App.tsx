import { useEffect, useMemo, useState } from 'react';
import { firebaseClientReadiness } from './shared/firebase/clientConfig';
import {
  signInWithGoogle,
  signOutCurrentUser,
  subscribeToFirebaseSession,
  type FirebaseSessionState,
} from './shared/firebase/auth';
import { getFirebaseAuth } from './shared/firebase/client';

const readinessItems = [
  'Vercel은 루트 Vite 앱의 정적 빌드를 배포할 준비가 됩니다.',
  'Firebase는 VITE_FIREBASE_* 공개 웹 설정만 읽도록 준비했습니다.',
  '서비스 계정 키와 관리자 권한 키는 클라이언트 코드에 넣지 않습니다.',
];

function App() {
  const [session, setSession] = useState<FirebaseSessionState | null>(null);
  const [actionMessage, setActionMessage] = useState('');

  const authReady = firebaseClientReadiness.status === 'ready';

  useEffect(() => {
    if (!authReady) {
      setSession(null);
      return;
    }

    const auth = getFirebaseAuth();

    if (!auth) {
      setSession(null);
      return;
    }

    return subscribeToFirebaseSession(auth, setSession);
  }, [authReady]);

  const sessionSummary = useMemo(() => {
    if (!session) {
      return '아직 로그인하지 않았습니다.';
    }

    const displayName = session.displayName ?? '표시명 없음';
    const email = session.email ?? '이메일 없음';

    return `${displayName} · ${email} · ${session.uid}`;
  }, [session]);

  const firebaseMessage =
    firebaseClientReadiness.status === 'ready'
      ? 'Firebase 클라이언트 설정 값이 모두 감지되었습니다.'
      : `Firebase 연결 대기 중: ${firebaseClientReadiness.missingKeys.join(', ')} 값을 .env.local에 추가하세요.`;

  const handleGoogleSignIn = async () => {
    try {
      setActionMessage('');
      const result = await signInWithGoogle();
      setActionMessage(result.message);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Google sign-in에 실패했습니다.');
    }
  };

  const handleSignOut = async () => {
    try {
      setActionMessage('');
      const result = await signOutCurrentUser();
      setActionMessage(result.message);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'sign-out에 실패했습니다.');
    }
  };

  return (
    <main className="app-shell" aria-labelledby="fieldboard-title">
      <section className="hero-card">
        <p className="eyebrow">Field-first web scaffold</p>
        <h1 id="fieldboard-title">FieldBoard</h1>
        <p className="hero-copy">웹 보드 편집기 준비 중</p>

        <div className="readiness-panel" aria-label="배포 및 Firebase 준비 상태">
          <p className="readiness-status">{firebaseMessage}</p>
          <ul>
            {readinessItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="foundation-panel" aria-label="Firebase foundation panel">
          <div className="foundation-panel__topline">
            <p className="foundation-panel__label">Firebase Auth session</p>
            <p className="foundation-panel__summary">{sessionSummary}</p>
          </div>

          <div className="foundation-panel__actions">
            <button type="button" onClick={handleGoogleSignIn} disabled={!authReady || session !== null}>
              Google sign in
            </button>
            <button type="button" onClick={handleSignOut} disabled={!authReady || session === null}>
              Sign out
            </button>
          </div>

          <p className="foundation-panel__message">{actionMessage || 'owner 기반 세션 상태는 UID, email, displayName으로 유지됩니다.'}</p>
        </div>

        <p className="next-note">
          다음 단계에서는 현장 보드 스키마와 빈칸 기준 대량 생성 흐름을 별도 기능으로 다룹니다.
        </p>
      </section>
    </main>
  );
}

export default App;
