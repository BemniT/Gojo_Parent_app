import React, { useCallback, useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ScrollView,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ref, get, update } from "firebase/database";
import { database } from "../constants/firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

export default function EditMyInfo() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleBack = useCallback(() => {
    if (router?.canGoBack && router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  }, [router]);
  
  const [userInfo, setUserInfo] = useState({
    name: "",
    phone: "",
    email: "",
    username: "",
    job: "",
    age: "",
    city: "",
    citizenship: "",
    address: "",
    bio: "",
  });

  useEffect(() => {
    loadUserInfo();
  }, []);

  const loadUserInfo = async () => {
    try {
      const parentId = await AsyncStorage.getItem("parentId");
      console.log("Loading info for parentId:", parentId);
      
      if (!parentId) {
        Alert.alert("Error", "User not found");
        handleBack();
        return;
      }

      // First get the parent data to find the userId
      const parentRef = ref(database, `Parents/${parentId}`);
      console.log("Parent database path:", `Parents/${parentId}`);
      
      const parentSnapshot = await get(parentRef);
      console.log("Parent snapshot exists:", parentSnapshot.exists());
      
      if (parentSnapshot.exists()) {
        const parentData = parentSnapshot.val();
        console.log("Parent data loaded:", parentData);
        
        // Get the userId from the parent data
        const userId = parentData.userId;
        console.log("Found userId:", userId);
        
        if (userId) {
          // Now get the user data from Users collection
          const userRef = ref(database, `Users/${userId}`);
          console.log("User database path:", `Users/${userId}`);
          
          const userSnapshot = await get(userRef);
          console.log("User snapshot exists:", userSnapshot.exists());
          
          if (userSnapshot.exists()) {
            const userData = userSnapshot.val();
            console.log("User data loaded:", userData);
            
            setUserInfo({
              name: userData.name || "",
              phone: userData.phone || "",
              email: userData.email || "",
              username: userData.username || "",
              job: userData.job || "",
              age: userData.age || "",
              city: userData.city || "",
              citizenship: userData.citizenship || "",
              address: userData.address || "",
              bio: userData.bio || "",
            });
          } else {
            console.log("No user data found for userId:", userId);
          }
        } else {
          console.log("No userId found in parent data");
        }
      } else {
        console.log("No parent data found for parentId:", parentId);
      }
    } catch (error) {
      console.error("Error loading user info:", error);
      Alert.alert("Error", "Failed to load user information");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!userInfo.name.trim()) {
      Alert.alert("Error", "Name is required");
      return;
    }

    setSaving(true);
    try {
      const parentId = await AsyncStorage.getItem("parentId");
      if (!parentId) {
        Alert.alert("Error", "User not found");
        return;
      }

      // Get the userId from Parents collection first
      const parentRef = ref(database, `Parents/${parentId}`);
      const parentSnapshot = await get(parentRef);
      
      if (parentSnapshot.exists()) {
        const parentData = parentSnapshot.val();
        const userId = parentData.userId;
        
        if (userId) {
          // Save to the Users collection using the userId
          const userRef = ref(database, `Users/${userId}`);
          await update(userRef, userInfo);
          
          Alert.alert("Success", "Your information has been updated successfully");
          handleBack();
        } else {
          Alert.alert("Error", "User ID not found");
        }
      } else {
        Alert.alert("Error", "Parent data not found");
      }
    } catch (error) {
      console.error("Error saving user info:", error);
      Alert.alert("Error", "Failed to save your information");
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field, value) => {
    setUserInfo(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2AABEE" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit My Info</Text>
        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Basic Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Information</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Name *</Text>
            <TextInput
              style={styles.input}
              value={userInfo.name}
              placeholder="Enter your full name"
              editable={false}
              selectTextOnFocus={false}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              style={styles.input}
              value={userInfo.phone}
              placeholder="Enter your phone number"
              keyboardType="phone-pad"
              editable={false}
              selectTextOnFocus={false}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={userInfo.email}
              onChangeText={(value) => updateField('email', value)}
              placeholder="Enter your email"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              value={userInfo.username}
              onChangeText={(value) => updateField('username', value)}
              placeholder="Enter your username"
              autoCapitalize="none"
            />
          </View>
        </View>

        {/* Personal Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Details</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Job/Occupation</Text>
            <TextInput
              style={styles.input}
              value={userInfo.job}
              onChangeText={(value) => updateField('job', value)}
              placeholder="Enter your job or occupation"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Age</Text>
            <TextInput
              style={styles.input}
              value={userInfo.age}
              onChangeText={(value) => updateField('age', value)}
              placeholder="Enter your age"
              keyboardType="numeric"
              maxLength={3}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>City</Text>
            <TextInput
              style={styles.input}
              value={userInfo.city}
              onChangeText={(value) => updateField('city', value)}
              placeholder="Enter your city"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Citizenship</Text>
            <TextInput
              style={styles.input}
              value={userInfo.citizenship}
              onChangeText={(value) => updateField('citizenship', value)}
              placeholder="Enter your citizenship"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Address</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={userInfo.address}
              onChangeText={(value) => updateField('address', value)}
              placeholder="Enter your full address"
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Bio</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={userInfo.bio}
              onChangeText={(value) => updateField('bio', value)}
              placeholder="Tell us about yourself"
              multiline
              numberOfLines={4}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EFEFF4",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#EFEFF4",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#666",
  },
  header: {
    backgroundColor: "#2AABEE",
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#fff",
  },
  saveButton: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    backgroundColor: "#fff",
    marginTop: 20,
    padding: 20,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#666",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#e9ecef",
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    color: "#333",
  },
  textArea: {
    height: 80,
    textAlignVertical: "top",
  },
});
