import * as admin from 'firebase-admin';
import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Avoid initializing multiple times
if (getApps().length === 0) {
  try {
    initializeApp({
      credential: applicationDefault(),
    });
  } catch (error) {
    console.error('Firebase admin initialization error', error);
  }
}

export async function verifyIdToken(token: string) {
  if (process.env.NODE_ENV === 'development' && token === 'local-dev-token') {
    return {
      uid: 'local-dev-uid',
      email: 'yogeshvar2508@gmail.com',
    };
  }
  
  try {
    return await getAuth().verifyIdToken(token);
  } catch (error) {
    console.error('Firebase token verification error', error);
    return null;
  }
}

export { admin };
