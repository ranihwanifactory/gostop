
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyDJoI2d4yhRHl-jOsZMp57V41Skn8HYFa8",
  authDomain: "touchgame-bf7e2.firebaseapp.com",
  databaseURL: "https://touchgame-bf7e2-default-rtdb.firebaseio.com",
  projectId: "touchgame-bf7e2",
  storageBucket: "touchgame-bf7e2.firebasestorage.app",
  messagingSenderId: "289443560144",
  appId: "1:289443560144:web:6ef844f5e4a022fca13cd5"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const googleProvider = new GoogleAuthProvider();
