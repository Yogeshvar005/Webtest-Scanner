import admin from 'firebase-admin';

// Avoid initializing multiple times
if (admin && admin.apps && admin.apps.length === 0) {
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
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
    return await admin.auth().verifyIdToken(token);
  } catch (error) {
    console.error('Firebase token verification error', error);
    return null;
  }
}

export { admin };
