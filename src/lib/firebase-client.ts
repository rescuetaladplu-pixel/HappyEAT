// Browser-only Firebase Cloud Messaging client
import { initializeApp, getApps, getApp } from "firebase/app";
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyDDC7pyZCnq1UvZ-vVSIjTgb0_XeEmp-PI",
  authDomain: "happyeat-5ae8b.firebaseapp.com",
  projectId: "happyeat-5ae8b",
  storageBucket: "happyeat-5ae8b.firebasestorage.app",
  messagingSenderId: "873933375315",
  appId: "1:873933375315:web:30b5411f026de9626e43a6",
};

// VAPID key is public (web push identifier) — safe to keep client-side.
// It came from server secret originally but the browser must know it to call getToken.
const VAPID_KEY = "BCYlDV9Y82dqaC8Q2B_yf411Iu7PWlYp6lTyIW8bQUQ4I3FlUPbsS4qURNMd5nG82Mm9HCuD48HYp6Y7dJbjH1o";

function getFirebaseApp() {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export async function requestFcmToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (!(await isSupported())) return null;
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return null;

  // Ask permission first
  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") return null;

  // Register the SW (idempotent)
  const swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");

  const messaging = getMessaging(getFirebaseApp());
  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: swReg,
  });
  return token || null;
}

export async function onForegroundMessage(cb: (payload: { title?: string; body?: string }) => void) {
  if (typeof window === "undefined") return () => {};
  if (!(await isSupported())) return () => {};
  const messaging = getMessaging(getFirebaseApp());
  return onMessage(messaging, (payload) => {
    cb({
      title: payload.notification?.title || payload.data?.title,
      body: payload.notification?.body || payload.data?.body,
    });
  });
}
