export { firebaseClientConfig, firebaseClientReadiness, readFirebaseClientConfig } from './clientConfig';
export { getFirebaseApp, getFirebaseAuth, getFirebaseFirestore } from './client';
export {
  type FirebaseActionResult,
  type FirebaseSessionState,
  signInWithGoogle,
  signOutCurrentUser,
  subscribeToFirebaseSession,
} from './auth';
export {
  saveBoardTemplateForCurrentUser,
  saveValueSetForCurrentUser,
  templatesCollectionName,
  valueSetsCollectionName,
  type BoardTemplateWriteInput,
  type ValueSetWriteInput,
} from './firestore';
