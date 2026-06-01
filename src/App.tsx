import { firebaseClientReadiness } from './shared/firebase/clientConfig';

const readinessItems = [
  'Vercel은 루트 Vite 앱의 정적 빌드를 배포할 준비가 됩니다.',
  'Firebase는 VITE_FIREBASE_* 공개 웹 설정만 읽도록 준비했습니다.',
  '서비스 계정 키와 관리자 권한 키는 클라이언트 코드에 넣지 않습니다.',
];

function App() {
  const firebaseMessage =
    firebaseClientReadiness.status === 'ready'
      ? 'Firebase 클라이언트 설정 값이 모두 감지되었습니다.'
      : `Firebase 연결 대기 중: ${firebaseClientReadiness.missingKeys.join(', ')} 값을 .env.local에 추가하세요.`;

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

        <p className="next-note">
          다음 단계에서는 현장 보드 스키마와 빈칸 기준 대량 생성 흐름을 별도 기능으로 다룹니다.
        </p>
      </section>
    </main>
  );
}

export default App;
