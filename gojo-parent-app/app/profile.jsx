import { useEffect, useState, useRef, useCallback } from "react";
import { addNetworkStateListener, getNetworkStateAsync } from "expo-network";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  StatusBar,
  Alert,
  TextInput,
  Modal,
  Linking,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ref, get, update } from "firebase/database";
import { database, storage } from "../constants/firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

const { width } = Dimensions.get("window");

const HEADER_MAX_HEIGHT = Math.max(220, Math.min(280, width * 0.68));
const HEADER_MIN_HEIGHT = 58;
const MINI_AVATAR = 34;

const PALETTE = {
  background: "#ffffff",
  card: "#FFFFFF",
  accent: "#2296F3",
  accentDark: "#0B72C7",
  accentSoft: "#EAF5FF",
  text: "#0F172A",
  subtext: "#475569",
  muted: "#64748B",
  border: "#E5EDF5",
  white: "#FFFFFF",
  danger: "#E53935",
  success: "#10B981",
  offline: "#94A3B8",
};

const TERMS_URL = "https://example.com/terms";

export default function ParentProfile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [schoolKey, setSchoolKey] = useState(null);
  const [parentNodeId, setParentNodeId] = useState(null);

  const [parentUser, setParentUser] = useState(null);
  const [children, setChildren] = useState([]);
  const [showMenu, setShowMenu] = useState(false);
  const [online, setOnline] = useState(null);
  const [loading, setLoading] = useState(true);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPasswordError, setCurrentPasswordError] = useState("");
  const [newPasswordError, setNewPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");

  const scrollY = useRef(new Animated.Value(0)).current;

  const defaultProfile = "https://cdn-icons-png.flaticon.com/512/847/847969.png";

  const schoolAwarePath = useCallback(
    (subPath) => (schoolKey ? `Platform1/Schools/${schoolKey}/${subPath}` : subPath),
    [schoolKey]
  );

  useEffect(() => {
    (async () => {
      const [pid, sk] = await Promise.all([
        AsyncStorage.getItem("parentId"),
        AsyncStorage.getItem("schoolKey"),
      ]);
      setParentNodeId(pid || null);
      setSchoolKey(sk || null);
    })();
  }, []);

  useEffect(() => {
    if (!parentNodeId) return;

    const loadParentData = async () => {
      setLoading(true);
      try {
        const [parentsSnap, studentsSnap, usersSnap] = await Promise.all([
          get(ref(database, schoolAwarePath("Parents"))),
          get(ref(database, schoolAwarePath("Students"))),
          get(ref(database, schoolAwarePath("Users"))),
        ]);

        const parentsData = parentsSnap.val() || {};
        const studentsData = studentsSnap.val() || {};
        const usersData = usersSnap.val() || {};

        const parentNode = parentsData[parentNodeId];
        if (!parentNode) return;

        const userData = usersData[parentNode.userId] || {};
        setParentUser({
          ...userData,
          userId: parentNode.userId,
          status: parentNode.status,
          createdAt: parentNode.createdAt,
        });

        const childrenArray = parentNode.children
          ? Object.values(parentNode.children).map((childLink) => {
              const student = studentsData[childLink.studentId];
              const studentUser = usersData[student?.userId] || {};
              return {
                ...childLink,
                name: studentUser.name || "Student",
                profileImage: studentUser.profileImage || defaultProfile,
                grade: student?.grade || "--",
                section: student?.section || "--",
              };
            })
          : [];

        setChildren(childrenArray);
      } catch (error) {
        console.log("Error fetching parent profile:", error);
      } finally {
        setLoading(false);
      }
    };

    loadParentData();
  }, [parentNodeId, schoolAwarePath]);

  useEffect(() => {
    let listener;
    (async () => {
      const state = await getNetworkStateAsync();
      setOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
      listener = addNetworkStateListener((s) => {
        setOnline(Boolean(s.isConnected && s.isInternetReachable !== false));
      });
    })();
    return () => {
      if (listener?.remove) listener.remove();
    };
  }, []);

  const handleBack = useCallback(() => {
    router.replace("/dashboard/home");
  }, [router]);

  const handleChildPress = (child) => {
    router.push(`/userProfile?recordId=${child.studentId}`);
  };

  const handleLogout = async () => {
    setShowMenu(false);
    await AsyncStorage.clear();
    router.replace("/");
  };

  const handleTerms = useCallback(async () => {
    setShowMenu(false);
    try {
      const supported = await Linking.canOpenURL(TERMS_URL);
      if (supported) Linking.openURL(TERMS_URL);
      else Alert.alert("Unable to open", "Please view our Terms & Privacy on the website.");
    } catch {
      Alert.alert("Unable to open", "Please view our Terms & Privacy on the website.");
    }
  }, []);

  const handleEditInfo = () => {
    setShowMenu(false);
    router.push("/editMyInfo");
  };

  const handleImagePicker = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.75,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadProfileImage(result.assets[0].uri);
      }
    } catch {
      Alert.alert("Error", "Failed to pick image");
    }
  };

  const uploadProfileImage = async (imageUri) => {
    try {
      if (!parentUser?.userId) return Alert.alert("Error", "User not found");

      const blob = await (await fetch(imageUri)).blob();
      const imageRef = storageRef(storage, `profileImages/${parentUser.userId}`);
      await uploadBytes(imageRef, blob);
      const downloadURL = await getDownloadURL(imageRef);

      await update(ref(database, schoolAwarePath(`Users/${parentUser.userId}`)), {
        profileImage: downloadURL,
      });

      setParentUser((prev) => ({ ...prev, profileImage: downloadURL }));
      Alert.alert("Success", "Profile picture updated successfully");
    } catch (error) {
      Alert.alert("Error", `Failed to upload image: ${error.message}`);
    }
  };

  const handleSaveProfilePhoto = async () => {
    setShowMenu(false);
    if (!parentUser?.profileImage || parentUser.profileImage === defaultProfile) {
      return Alert.alert("Error", "No profile photo to save");
    }

    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        return Alert.alert("Permission Required", "Please allow access to save photos to your gallery");
      }

      const fileName = `profile_photo_${Date.now()}.jpg`;
      const fileUri = FileSystem.cacheDirectory + fileName;
      const { uri } = await FileSystem.downloadAsync(parentUser.profileImage, fileUri);

      const asset = await MediaLibrary.createAssetAsync(uri);
      await MediaLibrary.createAlbumAsync("Gojo Parent App", asset, false);
      Alert.alert("Success", "Profile photo saved to gallery!");
    } catch (error) {
      Alert.alert("Error", `Failed to save profile photo: ${error.message || error}`);
    }
  };

  const validateCurrentPassword = async () => {
    if (!currentPassword) {
      setCurrentPasswordError("Current password is required");
      return false;
    }
    try {
      const userRef = ref(database, schoolAwarePath(`Users/${parentUser.userId}`));
      const snapshot = await get(userRef);
      const userData = snapshot.val();
      if (userData?.password !== currentPassword) {
        setCurrentPasswordError("Current password is incorrect");
        return false;
      }
      setCurrentPasswordError("");
      return true;
    } catch {
      setCurrentPasswordError("Error validating current password");
      return false;
    }
  };

  const validateNewPassword = () => {
    if (!newPassword) {
      setNewPasswordError("New password is required");
      return false;
    }
    if (newPassword.length < 6) {
      setNewPasswordError("New password must be at least 6 characters long");
      return false;
    }
    setNewPasswordError("");
    return true;
  };

  const validateConfirmPassword = () => {
    if (!confirmPassword) {
      setConfirmPasswordError("Please confirm your new password");
      return false;
    }
    if (newPassword !== confirmPassword) {
      setConfirmPasswordError("Passwords do not match");
      return false;
    }
    setConfirmPasswordError("");
    return true;
  };

  const handleChangePassword = async () => {
    setCurrentPasswordError("");
    setNewPasswordError("");
    setConfirmPasswordError("");

    const isCurrentValid = await validateCurrentPassword();
    const isNewValid = validateNewPassword();
    const isConfirmValid = validateConfirmPassword();

    if (!isCurrentValid || !isNewValid || !isConfirmValid) return;

    setIsChangingPassword(true);
    try {
      await update(ref(database, schoolAwarePath(`Users/${parentUser.userId}`)), {
        password: newPassword,
      });
      Alert.alert("Success", "Password updated successfully");
      handleClosePasswordModal();
    } catch (error) {
      Alert.alert("Error", `Failed to change password: ${error.message}`);
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleClosePasswordModal = () => {
    setShowPasswordModal(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setCurrentPasswordError("");
    setNewPasswordError("");
    setConfirmPasswordError("");
  };

  if (loading || !parentUser) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={PALETTE.accent} />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  const isOnline = online !== null ? online : String(parentUser.status || "").toLowerCase() === "online";

  const headerHeight = scrollY.interpolate({
    inputRange: [0, HEADER_MAX_HEIGHT - HEADER_MIN_HEIGHT],
    outputRange: [HEADER_MAX_HEIGHT + insets.top, HEADER_MIN_HEIGHT + insets.top],
    extrapolate: "clamp",
  });

  const compactBarOpacity = scrollY.interpolate({
    inputRange: [0, 65, 125],
    outputRange: [0, 0.25, 1],
    extrapolate: "clamp",
  });

  const heroTranslateY = scrollY.interpolate({
    inputRange: [0, 120],
    outputRange: [0, -16],
    extrapolate: "clamp",
  });

  const heroScale = scrollY.interpolate({
    inputRange: [0, 120],
    outputRange: [1, 0.96],
    extrapolate: "clamp",
  });

  const heroOpacity = scrollY.interpolate({
    inputRange: [0, 110, 180],
    outputRange: [1, 0.7, 0],
    extrapolate: "clamp",
  });

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <View style={[styles.topActionsRow, { top: insets.top + 8 }]}>
        <TouchableOpacity style={styles.topIcon} onPress={handleBack}>
          <Ionicons name="arrow-back" size={21} color="#fff" />
        </TouchableOpacity>

        <Animated.View style={[styles.compactCenter, { opacity: compactBarOpacity }]}>
          <Image source={{ uri: parentUser.profileImage || defaultProfile }} style={styles.compactAvatar} />
          <View>
            <Text style={styles.compactName} numberOfLines={1}>
              {parentUser.name}
            </Text>
            <Text style={styles.compactSub}>{isOnline ? "Online" : "Offline"}</Text>
          </View>
        </Animated.View>

        <TouchableOpacity style={styles.topIcon} onPress={() => setShowMenu((v) => !v)}>
          <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {showMenu && (
        <>
          <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowMenu(false)} />
          <View style={[styles.dropdownMenu, { top: insets.top + 52 }]}>
            <TouchableOpacity style={styles.menuItem} onPress={handleEditInfo}>
              <Text style={styles.menuText}>Edit Info</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleImagePicker}>
              <Text style={styles.menuText}>Set Profile Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleSaveProfilePhoto}>
              <Text style={styles.menuText}>Save to Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleTerms}>
              <Text style={styles.menuText}>Terms & Privacy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, styles.menuItemNoBorder]} onPress={handleLogout}>
              <Text style={[styles.menuText, { color: PALETTE.danger, fontWeight: "700" }]}>Logout</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <Animated.ScrollView
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: false,
        })}
        contentContainerStyle={{
          paddingTop: HEADER_MAX_HEIGHT + insets.top + 14,
          paddingBottom: Math.max(24, insets.bottom + 8),
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentWrap}>
          <View style={styles.quickActions}>
            <QuickAction icon="camera-outline" label="Photo" onPress={handleImagePicker} />
            <QuickAction icon="create-outline" label="Edit" onPress={handleEditInfo} />
            <QuickAction icon="shield-checkmark-outline" label="Privacy" onPress={handleTerms} />
          </View>

          <View style={styles.card}>
            <SectionHeader title="Info" icon="person-circle-outline" />
            <InfoRow label="Name" value={parentUser.name} />
            <InfoRow label="Username" value={parentUser.username} />
            <InfoRow label="Phone" value={parentUser.phone} />
            <InfoRow label="Email" value={parentUser.email} />
          </View>

          {children.length > 0 && (
            <View style={styles.card}>
              <SectionHeader title="Children" icon="people-outline" />
              {children.map((child) => (
                <TouchableOpacity
                  key={child.studentId}
                  style={styles.childCard}
                  onPress={() => handleChildPress(child)}
                  activeOpacity={0.88}
                >
                  <Image source={{ uri: child.profileImage }} style={styles.childImage} />
                  <View style={styles.childBody}>
                    <Text style={styles.childName}>{child.name}</Text>
                    <Text style={styles.childMeta}>
                      Grade {child.grade} • Section {child.section}
                    </Text>
                    <Text style={styles.childMeta}>Relation: {child.relationship}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#8EA1B5" />
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.card}>
            <SectionHeader title="Account" icon="settings-outline" />

            <TouchableOpacity style={styles.accountItem} onPress={() => setShowPasswordModal(true)}>
              <View style={[styles.accountIconWrap, { backgroundColor: "#E9F5FF" }]}>
                <Ionicons name="key-outline" size={18} color={PALETTE.accentDark} />
              </View>
              <Text style={styles.accountText}>Change Password</Text>
              <Ionicons name="chevron-forward-outline" size={18} color="#8EA1B5" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.accountItem} onPress={handleEditInfo}>
              <View style={[styles.accountIconWrap, { backgroundColor: "#ECFDF3" }]}>
                <Ionicons name="person-outline" size={18} color="#059669" />
              </View>
              <Text style={styles.accountText}>Update Profile Info</Text>
              <Ionicons name="chevron-forward-outline" size={18} color="#8EA1B5" />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.accountItem, styles.accountItemNoBorder]} onPress={handleTerms}>
              <View style={[styles.accountIconWrap, { backgroundColor: "#F1F5FF" }]}>
                <Ionicons name="document-text-outline" size={18} color="#4F46E5" />
              </View>
              <Text style={styles.accountText}>Terms & Privacy</Text>
              <Ionicons name="chevron-forward-outline" size={18} color="#8EA1B5" />
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <SectionHeader title="Contact Developer" icon="chatbubble-ellipses-outline" />

            <TouchableOpacity style={styles.accountItem} onPress={() => Linking.openURL("https://t.me/gojo_edu")}>
              <View style={[styles.accountIconWrap, { backgroundColor: "#EAF7FF" }]}>
                <Ionicons name="paper-plane" size={18} color="#2AABEE" />
              </View>
              <Text style={styles.accountText}>Telegram</Text>
              <Ionicons name="chevron-forward-outline" size={18} color="#8EA1B5" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.accountItem}
              onPress={() => Linking.openURL("mailto:gojo.education1@gmail.com")}
            >
              <View style={[styles.accountIconWrap, { backgroundColor: "#FFF1F1" }]}>
                <Ionicons name="mail-outline" size={18} color="#EA4335" />
              </View>
              <Text style={styles.accountText}>Email</Text>
              <Ionicons name="chevron-forward-outline" size={18} color="#8EA1B5" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.accountItem, styles.accountItemNoBorder]}
              onPress={() => Linking.openURL("https://t.me/gojo_edu")}
            >
              <View style={[styles.accountIconWrap, { backgroundColor: "#EEF5FF" }]}>
                <Ionicons name="logo-linkedin" size={18} color="#0077B5" />
              </View>
              <Text style={styles.accountText}>LinkedIn</Text>
              <Ionicons name="chevron-forward-outline" size={18} color="#8EA1B5" />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.ScrollView>

      <Animated.View style={[styles.header, { height: headerHeight }]}>
        <Image source={{ uri: parentUser.profileImage || defaultProfile }} style={styles.headerBgImage} />
        <View style={styles.headerBgOverlay} />

        <Animated.View
          style={[
            styles.heroWrap,
            {
              transform: [{ translateY: heroTranslateY }, { scale: heroScale }],
              opacity: heroOpacity,
            },
          ]}
        >
          <View style={styles.photoCard}>
            <Image source={{ uri: parentUser.profileImage || defaultProfile }} style={styles.photoCardImage} />
            <TouchableOpacity style={styles.photoCardCamera} onPress={handleImagePicker} activeOpacity={0.9}>
              <Ionicons name="camera" size={16} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.identitySide}>
            <View style={styles.identityCard}>
              <Text style={styles.identityName} numberOfLines={1}>
                {parentUser.name}
              </Text>
              {!!parentUser.username && <Text style={styles.identityUsername}>@{parentUser.username}</Text>}

              {/* <View style={styles.identityMetaRow}>
                <View
                  style={[
                    styles.onlineDot,
                    { backgroundColor: isOnline ? PALETTE.success : PALETTE.offline },
                  ]}
                />
                <Text style={styles.identityMetaText}>{isOnline ? "Online" : "Offline"}</Text>
              </View> */}
            </View>
          </View>
        </Animated.View>
      </Animated.View>

      <Modal visible={showPasswordModal} transparent animationType="slide" onRequestClose={handleClosePasswordModal}>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Change Password</Text>
                <TouchableOpacity onPress={handleClosePasswordModal}>
                  <Ionicons name="close" size={22} color="#64748B" />
                </TouchableOpacity>
              </View>

              <View style={styles.modalContent}>
                <Field
                  label="Current Password"
                  value={currentPassword}
                  onChangeText={(text) => {
                    setCurrentPassword(text);
                    setCurrentPasswordError("");
                  }}
                  secureTextEntry
                  placeholder="Enter current password"
                  error={currentPasswordError}
                />

                <Field
                  label="New Password"
                  value={newPassword}
                  onChangeText={(text) => {
                    setNewPassword(text);
                    setNewPasswordError("");
                    if (confirmPassword && text !== confirmPassword) {
                      setConfirmPasswordError("Passwords do not match");
                    } else {
                      setConfirmPasswordError("");
                    }
                  }}
                  secureTextEntry
                  placeholder="Enter new password (min 6 characters)"
                  error={newPasswordError}
                />

                <Field
                  label="Confirm New Password"
                  value={confirmPassword}
                  onChangeText={(text) => {
                    setConfirmPassword(text);
                    if (newPassword && text !== newPassword) {
                      setConfirmPasswordError("Passwords do not match");
                    } else {
                      setConfirmPasswordError("");
                    }
                  }}
                  secureTextEntry
                  placeholder="Confirm new password"
                  error={confirmPasswordError}
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={handleClosePasswordModal}
                  disabled={isChangingPassword}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.confirmButton]}
                  onPress={handleChangePassword}
                  disabled={isChangingPassword}
                >
                  <Text style={styles.confirmButtonText}>{isChangingPassword ? "Saving..." : "Save"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function SectionHeader({ title, icon }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIconWrap}>
        <Ionicons name={icon} size={16} color={PALETTE.accentDark} />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function QuickAction({ icon, label, onPress }) {
  return (
    <TouchableOpacity style={styles.quickActionItem} onPress={onPress} activeOpacity={0.88}>
      <View style={styles.quickActionIcon}>
        <Ionicons name={icon} size={18} color={PALETTE.accentDark} />
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder, secureTextEntry, error }) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={[styles.textInput, error ? styles.errorInput : null]}
        secureTextEntry={secureTextEntry}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#93A4B7"
      />
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.background },

  loadingWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: PALETTE.background,
  },
  loadingText: {
    marginTop: 10,
    color: PALETTE.muted,
    fontSize: 14,
    fontWeight: "600",
  },

  topActionsRow: {
    position: "absolute",
    left: 12,
    right: 12,
    height: 44,
    zIndex: 150,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(15, 23, 42, 0.28)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
  },

  compactCenter: {
    position: "absolute",
    left: 56,
    right: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  compactAvatar: {
    width: MINI_AVATAR,
    height: MINI_AVATAR,
    borderRadius: 9,
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  compactName: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    maxWidth: 160,
  },
  compactSub: {
    color: "#DBEAFE",
    fontSize: 11,
    marginTop: 1,
  },

  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: PALETTE.accent,
    zIndex: 10,
    overflow: "hidden",
  },
  headerBgImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  headerBgOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(8, 24, 46, 0.42)",
  },

  heroWrap: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 12,
    flexDirection: "row",
    alignItems: "flex-end",
  },

  photoCard: {
    width: 124,
    height: 148,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.95)",
    backgroundColor: "#fff",
  },
  photoCardImage: {
    width: "100%",
    height: "100%",
  },
  photoCardCamera: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(11,114,199,0.95)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#fff",
  },

  identitySide: {
    flex: 1,
    marginLeft: 12,
    alignSelf: "flex-end",
    justifyContent: "flex-end",
  },
  identityCard: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(15,23,42,0.34)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    paddingVertical: 12,
    paddingHorizontal: 12,
    minWidth: "76%",
    maxWidth: "100%",
  },
  identityName: {
    color: "#fff",
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  identityUsername: {
    color: "#DDEAFE",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 3,
  },
  identityMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 9,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  identityMetaText: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "700",
  },

  contentWrap: {
    paddingHorizontal: 14,
    gap: 12,
  },

  quickActions: {
    backgroundColor: PALETTE.card,
    borderWidth: 1,
    borderColor: PALETTE.border,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    shadowColor: "rgba(15,23,42,0.03)",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  quickActionItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: PALETTE.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  quickActionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#33506D",
  },

  card: {
    backgroundColor: PALETTE.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: PALETTE.border,
    padding: 14,
    shadowColor: "rgba(15,23,42,0.03)",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: PALETTE.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: PALETTE.text,
  },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EFF4FA",
  },
  infoLabel: {
    color: PALETTE.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  infoValue: {
    color: PALETTE.text,
    fontSize: 13,
    fontWeight: "700",
    maxWidth: "64%",
    textAlign: "right",
  },

  childCard: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 6,
    padding: 12,
    backgroundColor: "#FAFCFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PALETTE.border,
  },
  childImage: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: PALETTE.border,
  },
  childBody: { flex: 1, marginLeft: 12 },
  childName: {
    fontSize: 15,
    fontWeight: "700",
    color: PALETTE.text,
  },
  childMeta: {
    fontSize: 12.5,
    color: PALETTE.muted,
    marginTop: 2,
  },

  accountItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.border,
  },
  accountItemNoBorder: {
    borderBottomWidth: 0,
  },
  accountIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  accountText: {
    fontSize: 15,
    marginLeft: 11,
    flex: 1,
    color: PALETTE.text,
    fontWeight: "650",
  },

  dropdownMenu: {
    position: "absolute",
    right: 10,
    backgroundColor: PALETTE.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PALETTE.border,
    zIndex: 1000,
    minWidth: 205,
    overflow: "hidden",
  },
  menuOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "transparent",
    zIndex: 999,
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  menuItemNoBorder: { borderBottomWidth: 0 },
  menuText: {
    fontSize: 15,
    color: PALETTE.text,
    fontWeight: "600",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.35)",
    justifyContent: "center",
    padding: 14,
  },
  modalContainer: {
    backgroundColor: PALETTE.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PALETTE.border,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.border,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: PALETTE.text,
  },
  modalContent: { padding: 16 },

  inputGroup: { marginBottom: 14 },
  inputLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 7,
  },
  textInput: {
    borderWidth: 1,
    borderColor: PALETTE.border,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: "#F8FBFF",
    color: PALETTE.text,
  },
  errorInput: {
    borderColor: "#DC2626",
    borderWidth: 1.5,
  },
  errorText: {
    color: "#DC2626",
    fontSize: 12,
    marginTop: 4,
    fontWeight: "600",
  },

  modalActions: {
    flexDirection: "row",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: PALETTE.border,
    gap: 10,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 11,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: PALETTE.border,
  },
  confirmButton: { backgroundColor: PALETTE.accent },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: PALETTE.muted,
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
});