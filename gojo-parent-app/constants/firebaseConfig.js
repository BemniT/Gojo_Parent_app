// constants/firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

// Your Firebase config here
const firebaseConfig = {
  apiKey: "AIzaSyD47Nw8JROSGpk_HrzOwpoAek_PH12pBS8",
  authDomain: "bale-house-rental.firebaseapp.com",
  databaseURL: "https://bale-house-rental-default-rtdb.firebaseio.com",
  projectId: "bale-house-rental",
  storageBucket: "bale-house-rental.appspot.com",
  messagingSenderId: "964518277159",
  appId: "1:964518277159:web:9ffde0de15dd9000961e02",
  measurementId: "G-X8YCY4YJH6"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Realtime Database
export const database = getDatabase(app);

// Initialize Storage
export const storage = getStorage(app);

// Initialize Auth
export const auth = getAuth(app);
