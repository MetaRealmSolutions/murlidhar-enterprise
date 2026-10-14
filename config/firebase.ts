import { initializeApp } from "firebase/app";

const firebaseConfig = {
  apiKey: "AIzaSyBLM5q6A-gwIceBeXdSvkJjviMP-lR3MA0",
  authDomain: "testing-f3b2c.firebaseapp.com",
  projectId: "testing-f3b2c",
  storageBucket: "testing-f3b2c.firebasestorage.app",
  messagingSenderId: "707254092029",
  appId: "1:707254092029:web:c7d302e62512c7c3af7e94"
};

export const app = initializeApp(firebaseConfig);