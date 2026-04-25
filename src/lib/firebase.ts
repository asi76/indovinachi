import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyBRASV4u7AwfFjfdn1m2hJG2TmW_RQ4UUQ',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'studio-7990555522-7e3ef.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'studio-7990555522-7e3ef',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'studio-7990555522-7e3ef.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '247230095494',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:247230095494:web:8b1b92cf713a3030ef7107',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const buildProvider = () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
};

export const signInWithGoogle = async (): Promise<User> => {
  const result = await signInWithPopup(auth, buildProvider());
  return result.user;
};

export const signOutFromGoogle = () => signOut(auth);
export { onAuthStateChanged };
