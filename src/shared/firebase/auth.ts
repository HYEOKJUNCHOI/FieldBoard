import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type Auth, type User } from 'firebase/auth';
import { getFirebaseAuth } from './client';

export interface FirebaseSessionState {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export interface FirebaseActionResult {
  ok: boolean;
  message: string;
}

function toFirebaseSessionState(user: User): FirebaseSessionState {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
  };
}

export function subscribeToFirebaseSession(
  auth: Auth,
  onSessionChange: (session: FirebaseSessionState | null) => void,
) {
  return onAuthStateChanged(auth, (user) => {
    onSessionChange(user ? toFirebaseSessionState(user) : null);
  });
}

export async function signInWithGoogle(): Promise<FirebaseActionResult> {
  const auth = getFirebaseAuth();

  if (!auth) {
    return { ok: false, message: 'Firebase가 준비되지 않아 Google sign-in을 사용할 수 없습니다.' };
  }

  const provider = new GoogleAuthProvider();
  const credential = await signInWithPopup(auth, provider);

  return {
    ok: true,
    message: `${credential.user.displayName ?? '사용자'} 계정으로 로그인했습니다.`,
  };
}

export async function signOutCurrentUser(): Promise<FirebaseActionResult> {
  const auth = getFirebaseAuth();

  if (!auth) {
    return { ok: false, message: 'Firebase가 준비되지 않아 sign-out을 사용할 수 없습니다.' };
  }

  await signOut(auth);

  return {
    ok: true,
    message: 'Firebase 세션을 종료했습니다.',
  };
}

export { getFirebaseAuth } from './client';
export type { Auth };
