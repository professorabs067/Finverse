import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, getAuth } from 'firebase/auth'; 
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const firebaseConfig = {
  apiKey: "AIzaSyCjBovgFjAOznzd1rksFRr7J0yU1cj8pdo",
  authDomain: "fir-auth-fb3a7.firebaseapp.com",
  projectId: "fir-auth-fb3a7",
  storageBucket: "fir-auth-fb3a7.firebasestorage.app",
  messagingSenderId: "647658667020",
  appId: "1:647658667020:web:f6f1587e8b028605ebc229",
  measurementId: "G-1V6ZDJ262F"
};

let app;
let auth;

// Prevent double-initialization during Expo Fast Refresh
if (getApps().length === 0) {
  // If no app exists, initialize it normally with AsyncStorage
  app = initializeApp(firebaseConfig);
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
} else {
  // If app already exists, just grab the existing instance
  app = getApp();
  auth = getAuth(app);
}

export { auth };
export const db = getFirestore(app);