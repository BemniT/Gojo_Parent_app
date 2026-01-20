// app/index.jsx (Login screen)
import { useRouter } from "expo-router";
import { child, get, ref } from "firebase/database";
import { useState, useEffect } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { database } from "../constants/firebaseConfig";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();

  // On mount, check if user is logged in and lastLogin is within 3 days
  useEffect(() => {
    const checkSession = async () => {
      const userId = await AsyncStorage.getItem("userId");
      const lastLogin = await AsyncStorage.getItem("lastLogin");
      if (userId && lastLogin) {
        const now = Date.now();
        const last = parseInt(lastLogin, 10);
        const threeDays = 3 * 24 * 60 * 60 * 1000;
        if (now - last < threeDays) {
          // Session valid, go to dashboard
          router.replace("/dashboard/home");
        } else {
          // Session expired, clear and stay on login
          await AsyncStorage.removeItem("userId");
          await AsyncStorage.removeItem("parentId");
          await AsyncStorage.removeItem("lastLogin");
        }
      }
    };
    checkSession();
  }, []);

  // Cross-platform alert
  const showAlert = (title, message) => {
    if (typeof window !== "undefined" && window.alert) {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleLogin = async () => {
    if (!username || !password) {
      showAlert("Error", "Please enter both username and password");
      return;
    }

    try {
      const dbRef = ref(database);
      const snapshot = await get(child(dbRef, `Users`));

      if (!snapshot.exists()) {
        showAlert("Error", "No users found in database");
        return;
      }

      const users = snapshot.val();
      let found = false;

      for (const key of Object.keys(users)) {
        const user = users[key];
        if (user.role === "parent" && user.username === username && user.password === password) {
          found = true;

          if (!user.isActive) {
            showAlert("Error", "Your account is inactive");
            break;
          }


          // Save userId and lastLogin to AsyncStorage
          await AsyncStorage.setItem("userId", key);
          await AsyncStorage.setItem("lastLogin", Date.now().toString());

          // Find parentId in Parents node
          const parentsSnapshot = await get(ref(database, "Parents"));
          if (parentsSnapshot.exists()) {
            const parents = parentsSnapshot.val();
            const parentId = Object.keys(parents).find(pKey => parents[pKey].userId === key);
            if (parentId) {
              await AsyncStorage.setItem("parentId", parentId);
            }
          }

          // Removed welcome pop-up message after login
          router.replace("/dashboard/home");
          break;
        }
      }

      if (!found) {
        showAlert("Error", "Invalid username or password");
      }
    } catch (error) {
      console.error("Login Error:", error);
      showAlert("Error", "Something went wrong");
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "right", "left", "bottom"]}>
      <Text style={styles.title}>Gojo Parent Login</Text>

      <TextInput
        placeholder="Username"
        style={styles.input}
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
      />

      <TextInput
        placeholder="Password"
        style={styles.input}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={styles.button} onPress={handleLogin}>
        <Text style={styles.buttonText}>Login</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    
    padding: 20,
    backgroundColor: "#fff",
    marginTop: 120,// adjust as needed
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 30,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
  },
  button: {
    backgroundColor: "#1e90ff",
    padding: 15,
    borderRadius: 8,
  },
  buttonText: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "bold",
  },
});