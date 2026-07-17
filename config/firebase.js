const admin = require('firebase-admin');

if (!admin.apps.length) {
  const required = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
  const missing = required.filter((key) => !process.env[key] || !process.env[key].trim());

  if (missing.length) {
    console.error('[firebase] ❌ Missing required environment variable(s): ' + missing.join(', '));
    console.error('[firebase] → On Render: Service → Environment tab → add the key(s) above with real values, then Save & redeploy.');
    console.error('[firebase] → Locally: check your .env file has these keys set.');
    console.error('[firebase] → Available FIREBASE_* keys found: ' +
      (Object.keys(process.env).filter((k) => k.startsWith('FIREBASE_')).join(', ') || '(none)'));
    throw new Error('Firebase Admin SDK cannot initialize — missing env var(s): ' + missing.join(', '));
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // .env stores literal \n — un-escape into real newlines for the PEM key
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
  console.log('[firebase] Admin SDK initialized');
}

module.exports = admin;
