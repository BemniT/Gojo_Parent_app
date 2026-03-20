import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

const PRIMARY = "#1E90FF";
const BG = "#F8FAFC";
const CARD = "#FFFFFF";
const TEXT = "#0F172A";
const MUTED = "#64748B";
const BORDER = "#E2E8F0";

export default function EditMyInfo() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [schoolKey, setSchoolKey] = useState(null);
  const [parentId, setParentId] = useState(null);
  const [userId, setUserId] = useState(null);

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

  const schoolAwarePath = useCallback(
    (subPath) => (schoolKey ? `Platform1/Schools/${schoolKey}/${subPath}` : subPath),
    [schoolKey]
  );

  const handleBack = useCallback(() => {
    if (router?.canGoBack && router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  }, [router]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [pid, sk] = await Promise.all([
          AsyncStorage.getItem("parentId"),
          AsyncStorage.getItem("schoolKey"),
        ]);

        if (!mounted) return;
        setParentId(pid || null);
        setSchoolKey(sk || null);

        if (!pid) {
          Alert.alert("Error", "User not found");
          handleBack();
          return;
        }

        const parentSnap = await get(ref(database, `${sk ? `Platform1/Schools/${sk}/` : ""}Parents/${pid}`));
        if (!parentSnap.exists()) {
          Alert.alert("Error", "Parent data not found");
          handleBack();
          return;
        }

        const p = parentSnap.val() || {};
        if (!p.userId) {
          Alert.alert("Error", "User ID not found");
          handleBack();
          return;
        }

        setUserId(p.userId);

        const userSnap = await get(ref(database, `${sk ? `Platform1/Schools/${sk}/` : ""}Users/${p.userId}`));
        if (!userSnap.exists()) {
          Alert.alert("Error", "User profile not found");
          handleBack();
          return;
        }

        const u = userSnap.val() || {};
        setUserInfo({
          name: u.name || "",
          phone: u.phone || "",
          email: u.email || "",
          username: u.username || "",
          job: u.job || "",
          age: u.age ? String(u.age) : "",
          city: u.city || "",
          citizenship: u.citizenship || "",
          address: u.address || "",
          bio: u.bio || "",
        });
      } catch (e) {
        console.error("load profile error:", e);
        Alert.alert("Error", "Failed to load your information");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [handleBack]);

  const updateField = (field, value) => {
    setUserInfo((prev) => ({ ...prev, [field]: value }));
  };

  const editablePayload = useMemo(
    () => ({
      username: (userInfo.username || "").trim(),
      job: (userInfo.job || "").trim(),
      age: (userInfo.age || "").trim(),
      city: (userInfo.city || "").trim(),
      citizenship: (userInfo.citizenship || "").trim(),
      address: (userInfo.address || "").trim(),
      bio: (userInfo.bio || "").trim(),
    }),
    [userInfo]
  );

  const handleSave = async () => {
    if (!userId || !parentId) {
      Alert.alert("Error", "User not found");
      return;
    }

    if (editablePayload.age && !/^\d{1,3}$/.test(editablePayload.age)) {
      Alert.alert("Validation", "Age must be a number (1-3 digits).");
      return;
    }

    setSaving(true);
    try {
      await update(ref(database, `${schoolAwarePath("Users")}/${userId}`), editablePayload);
      Alert.alert("Success", "Your information has been updated successfully.");
      handleBack();
    } catch (e) {
      console.error("save profile error:", e);
      Alert.alert("Error", "Failed to save your information");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={PRIMARY} />
        <Text style={styles.loadingText}>Loading your profile...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.topIcon} onPress={handleBack}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Edit My Info</Text>

        <TouchableOpacity
          style={[styles.saveButton, saving && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveButtonText}>Save</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.lockedNotice}>
          <Ionicons name="lock-closed-outline" size={16} color="#1D4ED8" />
          <Text style={styles.lockedNoticeText}>
            Name, Email, and Phone Number are protected and cannot be changed.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Protected Information</Text>

          <InputField label="Name" value={userInfo.name} editable={false} />
          <InputField label="Email" value={userInfo.email} editable={false} />
          <InputField label="Phone Number" value={userInfo.phone} editable={false} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Editable Details</Text>

          <InputField
            label="Username"
            value={userInfo.username}
            onChangeText={(v) => updateField("username", v)}
            placeholder="Enter username"
          />

          <InputField
            label="Job / Occupation"
            value={userInfo.job}
            onChangeText={(v) => updateField("job", v)}
            placeholder="Enter job or occupation"
          />

          <InputField
            label="Age"
            value={userInfo.age}
            onChangeText={(v) => updateField("age", v.replace(/[^0-9]/g, ""))}
            keyboardType="numeric"
            maxLength={3}
            placeholder="Enter age"
          />

          <InputField
            label="City"
            value={userInfo.city}
            onChangeText={(v) => updateField("city", v)}
            placeholder="Enter city"
          />

          <InputField
            label="Citizenship"
            value={userInfo.citizenship}
            onChangeText={(v) => updateField("citizenship", v)}
            placeholder="Enter citizenship"
          />

          <InputField
            label="Address"
            value={userInfo.address}
            onChangeText={(v) => updateField("address", v)}
            placeholder="Enter full address"
            multiline
            numberOfLines={3}
          />

          <InputField
            label="Bio"
            value={userInfo.bio}
            onChangeText={(v) => updateField("bio", v)}
            placeholder="Tell us about yourself"
            multiline
            numberOfLines={4}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  editable = true,
  multiline = false,
  numberOfLines,
  keyboardType = "default",
  maxLength,
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          multiline && styles.textArea,
          !editable && styles.inputDisabled,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        editable={editable}
        selectTextOnFocus={editable}
        multiline={multiline}
        numberOfLines={numberOfLines}
        keyboardType={keyboardType}
        maxLength={maxLength}
        placeholderTextColor="#94A3B8"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: BG,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: MUTED,
  },

  header: {
    backgroundColor: PRIMARY,
    paddingBottom: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
  topIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.20)",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  saveButton: {
    minWidth: 70,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.20)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },

  content: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
  },

  lockedNotice: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  lockedNoticeText: {
    marginLeft: 8,
    flex: 1,
    color: "#1E3A8A",
    fontSize: 12.5,
    fontWeight: "600",
  },

  card: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: TEXT,
    marginBottom: 10,
  },

  inputGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: TEXT,
  },
  inputDisabled: {
    backgroundColor: "#F1F5F9",
    color: "#64748B",
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },

  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    flexDirection: "row",
    alignItems: "center",
  },
  menuText: {
    fontSize: 15,
    color: TEXT,
  },
});