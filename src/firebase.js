// Firebase initialization.

import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: "AIzaSyBHkZqRIrnETRymkIQ8xdRqZ6rnETxPqQs",
  authDomain: "obratrack-2a464.firebaseapp.com",
  projectId: "obratrack-2a464",
  storageBucket: "obratrack-2a464.firebasestorage.app",
  messagingSenderId: "152136124318",
  appId: "1:152136124318:web:67c7375a6dcc1cb3eb388f"
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)