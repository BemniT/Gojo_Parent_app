// app/profile.jsx
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
} from "react-native";
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
const HEADER_MAX_HEIGHT = Math.max(220, Math.min(300, width * 0.62));
const HEADER_MIN_HEIGHT = 60;
const AVATAR_SIZE = Math.max(96, Math.min(140, width * 0.32));
const CAMERA_SIZE = Math.max(36, Math.min(50, width * 0.12));
const PALETTE = {
  background: "#f5f7fb",
  surface: "#ffffff",
  card: "#ffffff",
  accent: "#2563eb",
  accentDark: "#1d4ed8",
  muted: "#6b7280",
  text: "#0f172a",
  border: "#e5e7eb",
  shadow: "rgba(15, 23, 42, 0.08)",
};

const TERMS_URL = "https://example.com/terms";

export default function ParentProfile() {
    const handleLogout = async () => {
      setShowMenu(false);
      await AsyncStorage.clear();
      router.replace('/'); // or router.replace('/login') if you have a login route
    };
  const router = useRouter();
  const [parentUser, setParentUser] = useState(null);
  const [children, setChildren] = useState([]);
  const [showMenu, setShowMenu] = useState(false);
  const [showFullProfileImage, setShowFullProfileImage] = useState(true); // Start with full image
  const scrollY = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const [online, setOnline] = useState(null);
  
  // Password change states
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  
  // Validation error states
  const [currentPasswordError, setCurrentPasswordError] = useState("");
  const [newPasswordError, setNewPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");

  const defaultProfile =
    "https://cdn-icons-png.flaticon.com/512/847/847969.png";

  useEffect(() => {
    const loadParentData = async () => {
      const parentId = await AsyncStorage.getItem("parentId");
      if (!parentId) return;

      try {
        const [usersSnap, parentsSnap, studentsSnap] = await Promise.all([
          get(ref(database, "Users")),
          get(ref(database, "Parents")),
          get(ref(database, "Students")),
        ]);

        const usersData = usersSnap.val() || {};
        const parentsData = parentsSnap.val() || {};
        const studentsData = studentsSnap.val() || {};

        const parentNode = parentsData[parentId];
        if (!parentNode) return;

        const user = usersData[parentNode.userId] || {};
        setParentUser({
          ...user,
          status: parentNode.status,
          createdAt: parentNode.createdAt,
        });

        const childrenArray = parentNode.children
          ? Object.values(parentNode.children).map((childLink) => {
              const student = studentsData[childLink.studentId];
              const studentUser = usersData[student?.userId] || {};
              return {
                ...childLink,
                name: studentUser.name || "Student Name",
                profileImage: studentUser.profileImage || defaultProfile,
                grade: student?.grade || "--",
                section: student?.section || "--",
              };
            })
          : [];

        setChildren(childrenArray);
      } catch (error) {
        console.log("Error fetching parent profile:", error);
      }
    };

    loadParentData();
  }, []);

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
      if (listener && typeof listener.remove === "function") listener.remove();
    };
  }, []);

  useEffect(() => {
    const shimmer = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmerAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    shimmer.start();
    return () => shimmer.stop();
  }, [shimmerAnim]);

  // Handle scroll-based profile image toggle
  useEffect(() => {
    const listenerId = scrollY.addListener(({ value }) => {
      // When any scroll happens (even 1px), show circular image
      if (value > 0 && showFullProfileImage) {
        setShowFullProfileImage(false);
      }
      // When back to top (0 scroll), show full background image
      else if (value === 0 && !showFullProfileImage) {
        setShowFullProfileImage(true);
      }
    });

    return () => {
      scrollY.removeListener(listenerId);
    };
  }, [showFullProfileImage]);

  const handleChildPress = (child) => {
    router.push(`/userProfile?recordId=${child.studentId}`);
  };

  const handleImagePicker = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadProfileImage(result.assets[0].uri);
      }
    } catch (error) {
      console.log("Error picking image:", error);
      Alert.alert("Error", "Failed to pick image");
    }
  };

  const uploadProfileImage = async (imageUri) => {
    try {
      console.log("Starting image upload for URI:", imageUri);
      
      const parentId = await AsyncStorage.getItem("parentId");
      if (!parentId) {
        console.log("No parentId found");
        Alert.alert("Error", "User not found");
        return;
      }
      console.log("ParentId found:", parentId);

      console.log("Fetching image blob...");
      const response = await fetch(imageUri);
      const blob = await response.blob();
      console.log("Blob created, size:", blob.size);
      
      console.log("Creating storage reference...");
      const imageRef = storageRef(storage, `profileImages/${parentId}`);
      console.log("Storage ref created:", imageRef.fullPath);
      
      console.log("Uploading to storage...");
      await uploadBytes(imageRef, blob);
      console.log("Upload successful");
      
      console.log("Getting download URL...");
      const downloadURL = await getDownloadURL(imageRef);
      console.log("Download URL obtained:", downloadURL);
      
      console.log("Updating database...");
      await update(ref(database, `Users/${parentUser.userId}`), {
        profileImage: downloadURL
      });
      console.log("Database updated");

      setParentUser(prev => ({
        ...prev,
        profileImage: downloadURL
      }));

      Alert.alert("Success", "Profile picture updated successfully");
    } catch (error) {
      console.log("Detailed error uploading image:", error);
      console.log("Error code:", error.code);
      console.log("Error message:", error.message);
      Alert.alert("Error", `Failed to upload image: ${error.message}`);
    }
  };

  const handleTerms = useCallback(async () => {
    setShowMenu(false);
    try {
      const supported = await Linking.canOpenURL(TERMS_URL);
      if (supported) {
        Linking.openURL(TERMS_URL);
      } else {
        Alert.alert("Unable to open", "Please view our Terms & Privacy on the website.");
      }
    } catch (error) {
      Alert.alert("Unable to open", "Please view our Terms & Privacy on the website.");
    }
  }, []);

  const handleEditInfo = () => {
    setShowMenu(false);
    router.push("/editMyInfo");
  };

  const handleSetProfilePhoto = () => {
    setShowMenu(false);
    handleImagePicker();
  };

  const handleSaveProfilePhoto = async () => {
    setShowMenu(false);
    
    console.log("Starting save profile photo...");
    console.log("Profile image URL:", parentUser?.profileImage);
    console.log("Default profile:", defaultProfile);
    
    if (!parentUser?.profileImage || parentUser.profileImage === defaultProfile) {
      Alert.alert("Error", "No profile photo to save");
      return;
    }

    try {
      console.log("Requesting media library permissions...");
      // Request media library permissions
      const { status } = await MediaLibrary.requestPermissionsAsync();
      console.log("Permission status:", status);
      
      if (status === 'denied') {
        Alert.alert("Permission Required", "Please allow access to save photos to your gallery in Settings");
        return;
      }
      
      if (status !== 'granted') {
        // Try requesting again for undetermined status
        const { status: newStatus } = await MediaLibrary.requestPermissionsAsync();
        console.log("Second permission request status:", newStatus);
        
        if (newStatus !== 'granted') {
          Alert.alert("Permission Required", "Please allow access to save photos to your gallery");
          return;
        }
      }

      console.log("Creating download...");
      // Download image using new API
      const fileName = `profile_photo_${Date.now()}.jpg`;
      console.log("Filename:", fileName);
      
      const fileUri = FileSystem.cacheDirectory + fileName;
      console.log("Download path:", fileUri);
      
      const downloadObject = FileSystem.downloadAsync(parentUser.profileImage, fileUri);
      console.log("Download started:", downloadObject);
      
      const { uri } = await downloadObject;
      console.log("Downloaded to:", uri);
      
      console.log("Creating asset...");
      // Save to device gallery
      const asset = await MediaLibrary.createAssetAsync(uri);
      console.log("Asset created:", asset);
      
      console.log("Creating album...");
      await MediaLibrary.createAlbumAsync('Gojo Parent App', asset, false);
      console.log("Album created");
      
      Alert.alert("Success", "Profile photo saved to your phone's gallery!");
    } catch (error) {
      console.log("Error saving photo:", error);
      console.log("Error details:", JSON.stringify(error, null, 2));
      Alert.alert("Error", `Failed to save profile photo: ${error.message || error}`);
    }
  };

  const validateCurrentPassword = async () => {
    if (!currentPassword) {
      setCurrentPasswordError("Current password is required");
      return false;
    }
    
    // Check if current password matches the one in database
    try {
      const userRef = ref(database, `Users/${parentUser.userId}`);
      const snapshot = await get(userRef);
      const userData = snapshot.val();
      
      if (userData.password !== currentPassword) {
        setCurrentPasswordError("Current password is incorrect");
        return false;
      }
      
      setCurrentPasswordError("");
      return true;
    } catch (error) {
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
    // Clear previous errors
    setCurrentPasswordError("");
    setNewPasswordError("");
    setConfirmPasswordError("");
    
    // Validate all fields
    const isCurrentValid = await validateCurrentPassword();
    const isNewValid = validateNewPassword();
    const isConfirmValid = validateConfirmPassword();
    
    if (!isCurrentValid || !isNewValid || !isConfirmValid) {
      return;
    }

    setIsChangingPassword(true);

    try {
      console.log("Parent user data:", parentUser);
      console.log("Parent user ID:", parentUser?.userId);
      
      // Update password in Realtime Database under Users node
      const dbPath = `Users/${parentUser.userId}`;
      console.log("Updating database at path:", dbPath);
      console.log("New password:", newPassword);
      
      await update(ref(database, dbPath), {
        password: newPassword
      });
      console.log("Database password updated successfully");
      
      Alert.alert("Success", "Password updated successfully");
      setShowPasswordModal(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      console.log("Error changing password:", error);
      console.log("Error code:", error.code);
      console.log("Error message:", error.message);
      Alert.alert("Error", `Failed to change password: ${error.message}`);
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleShowPasswordModal = () => {
    setShowPasswordModal(true);
  };

  const handleClosePasswordModal = () => {
    setShowPasswordModal(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    // Clear errors
    setCurrentPasswordError("");
    setNewPasswordError("");
    setConfirmPasswordError("");
  };

  const handleBack = useCallback(() => {
    router.replace("/dashboard/home");
  }, [router]);

  const handleCall = useCallback(() => {
    const phone = parentUser?.phone || "";
    if (!phone) {
      Alert.alert("No phone number", "No phone number available for this profile.");
      return;
    }
    try {
      const sanitized = phone.toString().trim();
      Linking.openURL(`tel:${sanitized}`);
    } catch (e) {
      Alert.alert("Call failed", "Unable to start a call on this device.");
    }
  }, [parentUser?.phone]);

  if (!parentUser) {
    const shimmerStyle = {
      opacity: shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] }),
    };

    return (
      <View style={styles.skeletonContainer}>
        <Animated.View style={[styles.skelHeader, shimmerStyle]} />
        <View style={styles.skelProfileRow}>
          <Animated.View style={[styles.skelAvatar, shimmerStyle]} />
          <View style={styles.skelProfileText}>
            <Animated.View style={[styles.skelLine, shimmerStyle, { marginBottom: 10 }]} />
            <Animated.View style={[styles.skelLineShort, shimmerStyle]} />
          </View>
        </View>
        <View style={styles.skelCard}>
          <Animated.View style={[styles.skelTitle, shimmerStyle]} />
          <Animated.View style={[styles.skelLine, shimmerStyle]} />
          <Animated.View style={[styles.skelLine, shimmerStyle]} />
          <Animated.View style={[styles.skelLineShort, shimmerStyle]} />
        </View>
        <View style={styles.skelCard}>
          <Animated.View style={[styles.skelTitle, shimmerStyle]} />
          <Animated.View style={[styles.skelChild, shimmerStyle]} />
          <Animated.View style={[styles.skelChild, shimmerStyle]} />
        </View>
      </View>
    );
  }

  const derivedStatus = ((parentUser.status || "").toString().toLowerCase() === "online");
  const isOnline = online !== null ? online : derivedStatus;

  // Header height animation
  const headerHeight = scrollY.interpolate({
    inputRange: [0, HEADER_MAX_HEIGHT - HEADER_MIN_HEIGHT],
    outputRange: [HEADER_MAX_HEIGHT, HEADER_MIN_HEIGHT],
    extrapolate: "clamp",
  });

  // Avatar + Name animation (move & shrink together)
  const headerContentTranslate = scrollY.interpolate({
    inputRange: [0, HEADER_MAX_HEIGHT - HEADER_MIN_HEIGHT],
    outputRange: [0, -60],
    extrapolate: "clamp",
  });
  const headerContentScale = scrollY.interpolate({
    inputRange: [0, HEADER_MAX_HEIGHT - HEADER_MIN_HEIGHT],
    outputRange: [1, 0.6],
    extrapolate: "clamp",
  });
  const headerContentOpacity = scrollY.interpolate({
    inputRange: [0, HEADER_MAX_HEIGHT - HEADER_MIN_HEIGHT - 20],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  // Camera icon animation
  const cameraTranslate = scrollY.interpolate({
    inputRange: [0, HEADER_MAX_HEIGHT - HEADER_MIN_HEIGHT],
    outputRange: [0, -60],
    extrapolate: "clamp",
  });
  const cameraOpacity = scrollY.interpolate({
    inputRange: [0, HEADER_MAX_HEIGHT - HEADER_MIN_HEIGHT - 20],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  // Small name in top bar appear
  const smallNameOpacity = scrollY.interpolate({
    inputRange: [0, HEADER_MAX_HEIGHT - HEADER_MIN_HEIGHT - 20, HEADER_MAX_HEIGHT - HEADER_MIN_HEIGHT],
    outputRange: [0, 0, 1],
    extrapolate: "clamp",
  });

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Fixed Top Bar with Back & 3-dot */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.topIcon}
          onPress={handleBack}
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>

        <View style={styles.topTitleStack}>
          <Animated.Text style={[styles.smallName, { opacity: smallNameOpacity }]}>
            {parentUser.name}
          </Animated.Text>
          {parentUser.status ? (
            <Animated.Text style={[styles.smallStatus, { opacity: smallNameOpacity }]}>
              {isOnline ? "Online" : "Offline"}
            </Animated.Text>
          ) : null}
        </View>

        <TouchableOpacity style={styles.topIcon} onPress={() => setShowMenu(!showMenu)}>
          <Ionicons name="ellipsis-vertical" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Telegram Style Dropdown Menu */}
      {showMenu && (
        <>
          <TouchableOpacity 
            style={styles.menuOverlay} 
            activeOpacity={1}
            onPress={() => setShowMenu(false)}
          />
          <View style={styles.dropdownMenu}>
            <TouchableOpacity style={styles.menuItem} onPress={handleEditInfo}>
              <Text style={styles.menuText}>Edit Info</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleSetProfilePhoto}>
              <Text style={styles.menuText}>Set Profile Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleSaveProfilePhoto}>
              <Text style={styles.menuText}>Save to Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleCall}>
              <Text style={styles.menuText}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleTerms}>
              <Text style={styles.menuText}>Terms & Privacy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
              <Text style={[styles.menuText, { color: '#e53935', fontWeight: 'bold' }]}>Logout</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Scrollable content */}
      <Animated.ScrollView
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        contentContainerStyle={{ paddingTop: HEADER_MAX_HEIGHT + CAMERA_SIZE / 2 }}
      >
        {/* Info Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Info</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Name</Text>
            <Text style={styles.infoValue}>{parentUser.name}</Text>
          </View>
          {parentUser.username && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Username</Text>
              <Text style={styles.infoValue}>{parentUser.username}</Text>
            </View>
          )}
          {parentUser.phone && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Phone</Text>
              <Text style={styles.infoValue}>{parentUser.phone}</Text>
            </View>
          )}
          {parentUser.email && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{parentUser.email}</Text>
            </View>
          )}
        </View>

        {/* Children Section */}
        {children.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Children</Text>
            {children.map((child) => (
              <TouchableOpacity 
                key={child.studentId} 
                style={styles.childCard}
                onPress={() => handleChildPress(child)}
              >
                <Image source={{ uri: child.profileImage }} style={styles.childImage} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.childName}>{child.name}</Text>
                  <Text style={styles.childDetails}>
                    Grade {child.grade} - Section {child.section}
                  </Text>
                  <Text style={styles.childDetails}>
                    Relation: {child.relationship}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#999" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <TouchableOpacity style={styles.accountItem} onPress={handleShowPasswordModal}>
            <Ionicons name="key-outline" size={20} color="#2563eb" />
            <Text style={styles.accountText}>Change Password</Text>
            <Ionicons name="chevron-forward-outline" size={20} color="#999" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.accountItem} onPress={handleEditInfo}>
            <Ionicons name="mail-outline" size={20} color="#2563eb" />
            <Text style={styles.accountText}>Update Email / Info</Text>
            <Ionicons name="chevron-forward-outline" size={20} color="#999" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.accountItem} onPress={handleTerms}>
            <Ionicons name="document-text-outline" size={20} color="#2563eb" />
            <Text style={styles.accountText}>Terms & Privacy</Text>
            <Ionicons name="chevron-forward-outline" size={20} color="#999" />
          </TouchableOpacity>
          {/* Contact Developer Section */}
          <View style={{ marginTop: 18 }}>
            <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>Contact Developer</Text>
            <View style={{ gap: 10 }}>
              <TouchableOpacity style={styles.accountItem} onPress={() => Linking.openURL('https://t.me/gojo_edu')}>
                <Ionicons name="paper-plane" size={22} color="#2AABEE" style={{ marginRight: 8 }} />
                <Text style={styles.accountText}>Telegram</Text>
                <Ionicons name="chevron-forward-outline" size={20} color="#999" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.accountItem} onPress={() => Linking.openURL('mailto:gojo.education1@gmail.com')}>
                <Ionicons name="mail" size={22} color="#EA4335" />
                <Text style={styles.accountText}>Email</Text>
                <Ionicons name="chevron-forward-outline" size={20} color="#999" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.accountItem} onPress={() => Linking.openURL('https://t.me/gojo_edu')}>
                <Ionicons name="logo-linkedin" size={22} color="#0077B5" />
                <Text style={styles.accountText}>LinkedIn</Text>
                <Ionicons name="chevron-forward-outline" size={20} color="#999" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Animated.ScrollView>

      {/* Animated Header (Avatar + Name move & shrink together) */}
      <Animated.View
        style={[
          styles.header,
          { height: headerHeight }
        ]}
      >
        {/* Background Profile Image - Shows at top (0 scroll) */}
        <Image
          source={{ uri: parentUser.profileImage || defaultProfile }}
          style={[
            styles.bgProfileImage,
            {
              opacity: showFullProfileImage ? 1 : 0,
            }
          ]}
        />

        {showFullProfileImage ? (
          <View style={styles.heroOverlayBare}>
            <Text style={styles.heroName}>{parentUser.name}</Text>
            {parentUser.status ? (
              <View style={[styles.statusBadge, isOnline ? styles.statusBadgeOnline : styles.statusBadgeOffline]}>
                <View style={[styles.statusDot, isOnline ? styles.statusDotOnline : styles.statusDotOffline]} />
                <Text style={[styles.statusText, isOnline ? styles.statusTextOnline : styles.statusTextOffline]}>
                  {isOnline ? "Online" : "Offline"}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
        
        <Animated.View
          style={{
            transform: [
              { translateY: headerContentTranslate },
              { scale: headerContentScale },
            ],
            opacity: showFullProfileImage ? 0 : headerContentOpacity,
            alignItems: "center",
          }}
        >
          {showFullProfileImage ? null : (
            <>
              <Image
                source={{ uri: parentUser.profileImage || defaultProfile }}
                style={styles.avatar}
              />
              <View style={styles.collapsedInfo}>
                <Text style={styles.nameOverlay}>{parentUser.name}</Text>
              </View>
            </>
          )}
        </Animated.View>
      </Animated.View>

      {/* Camera Icon */}
      <TouchableOpacity 
        style={[
          {
            position: "absolute",
            top: HEADER_MAX_HEIGHT - CAMERA_SIZE / 2,
            right: 20,
            width: CAMERA_SIZE,
            height: CAMERA_SIZE,
            zIndex: 20,
          }
        ]}
        onPress={handleImagePicker}
      >
        <Animated.View
          style={[
            {
              width: CAMERA_SIZE,
              height: CAMERA_SIZE,
              borderRadius: CAMERA_SIZE / 2,
              backgroundColor: "#2AABEE",
              justifyContent: "center",
              alignItems: "center",
              transform: [{ translateY: cameraTranslate }],
              opacity: cameraOpacity,
            },
          ]}
        >
          <Ionicons name="camera" size={24} color="#fff" />
        </Animated.View>
      </TouchableOpacity>

      {/* Password Change Modal */}
      <Modal
        visible={showPasswordModal}
        transparent={true}
        animationType="slide"
        onRequestClose={handleClosePasswordModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Password</Text>
              <TouchableOpacity onPress={handleClosePasswordModal}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalContent}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Current Password</Text>
                <TextInput
                  style={[styles.textInput, currentPasswordError ? styles.errorInput : null]}
                  secureTextEntry={true}
                  value={currentPassword}
                  onChangeText={(text) => {
                    setCurrentPassword(text);
                    setCurrentPasswordError("");
                  }}
                  placeholder="Enter current password"
                />
                {currentPasswordError ? (
                  <Text style={styles.errorText}>{currentPasswordError}</Text>
                ) : null}
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>New Password</Text>
                <TextInput
                  style={[styles.textInput, newPasswordError ? styles.errorInput : null]}
                  secureTextEntry={true}
                  value={newPassword}
                  onChangeText={(text) => {
                    setNewPassword(text);
                    setNewPasswordError("");
                    // Check confirm password if it has value
                    if (confirmPassword) {
                      if (text !== confirmPassword) {
                        setConfirmPasswordError("Passwords do not match");
                      } else {
                        setConfirmPasswordError("");
                      }
                    }
                  }}
                  placeholder="Enter new password (min 6 characters)"
                />
                {newPasswordError ? (
                  <Text style={styles.errorText}>{newPasswordError}</Text>
                ) : null}
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Confirm New Password</Text>
                <TextInput
                  style={[styles.textInput, confirmPasswordError ? styles.errorInput : null]}
                  secureTextEntry={true}
                  value={confirmPassword}
                  onChangeText={(text) => {
                    setConfirmPassword(text);
                    setConfirmPasswordError("");
                    // Check if it matches new password
                    if (newPassword && text !== newPassword) {
                      setConfirmPasswordError("Passwords do not match");
                    }
                  }}
                  placeholder="Confirm new password"
                />
                {confirmPasswordError ? (
                  <Text style={styles.errorText}>{confirmPasswordError}</Text>
                ) : null}
              </View>
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
                <Text style={styles.confirmButtonText}>
                  {isChangingPassword ? "Saving..." : "Save"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.background },
  skeletonContainer: { flex: 1, padding: 16, backgroundColor: PALETTE.background },
  skelHeader: { height: 200, borderRadius: 18, backgroundColor: "#e8ecf3", marginBottom: 18 },
  skelProfileRow: { flexDirection: "row", alignItems: "center", marginBottom: 18 },
  skelAvatar: { width: 82, height: 82, borderRadius: 41, backgroundColor: "#e8ecf3", marginRight: 14 },
  skelProfileText: { flex: 1 },
  skelLine: { height: 16, borderRadius: 10, backgroundColor: "#e8ecf3" },
  skelLineShort: { height: 12, width: "60%", borderRadius: 10, backgroundColor: "#e8ecf3" },
  skelCard: { backgroundColor: PALETTE.surface, borderRadius: 14, padding: 18, marginBottom: 16, shadowColor: PALETTE.shadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 6 },
  skelTitle: { height: 18, width: "40%", borderRadius: 10, backgroundColor: "#e8ecf3", marginBottom: 16 },
  skelChild: { height: 64, borderRadius: 12, backgroundColor: "#e8ecf3", marginBottom: 12 },

  topBar: {
    position: "absolute",
    top: 20,
    left: 12,
    right: 12,
    height: 40,
    zIndex: 100,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  topIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(37,99,235,0.25)",
    justifyContent: "center",
    alignItems: "center",
  },
  smallName: { color: "#fff", fontSize: 18, fontWeight: "700", letterSpacing: 0.3 },
  smallStatus: { color: "#e2e8f0", fontSize: 12, marginTop: 0 },
  topTitleStack: { alignItems: "center", justifyContent: "center" },

  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: PALETTE.accent, // Blue color for header
    alignItems: "center",
    zIndex: 10,
    overflow: "hidden",
  },
  bgProfileImage: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
  },
  heroOverlayBare: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 10,
    alignItems: "flex-start",
  },
  heroName: {
    color: "#fff",
    fontSize: 16, // Decreased font size for header name
    fontWeight: "700",
    letterSpacing: 0.15,
    textAlign: "center",
  },
  collapsedInfo: {
    alignItems: "center",
    marginTop: 6,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusBadgeOnline: {
    backgroundColor: "#ffffff",
    borderColor: "rgba(16,185,129,0.35)",
  },
  statusBadgeOffline: {
    backgroundColor: "#ffffff",
    borderColor: "rgba(100,116,139,0.35)",
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 5,
  },
  statusDotOnline: { backgroundColor: "#10b981" },
  statusDotOffline: { backgroundColor: "#94a3b8" },
  statusText: { fontSize: 11, fontWeight: "600", textAlign: "center" },
  statusTextOnline: { color: "#0f172a" },
  statusTextOffline: { color: "#475569" },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3,
    borderColor: "#fff",
    marginTop: HEADER_MAX_HEIGHT / 2 - AVATAR_SIZE / 2,
  },
  nameOverlay: { color: "#fff", fontSize: 15, fontWeight: "700", marginTop: 4, letterSpacing: 0.15, textAlign: "center" },

  cameraIcon: {
    position: "absolute",
    top: HEADER_MAX_HEIGHT - CAMERA_SIZE / 2,
    right: 20,
    width: CAMERA_SIZE,
    height: CAMERA_SIZE,
    borderRadius: CAMERA_SIZE / 2,
    backgroundColor: PALETTE.accent,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 20,
  },

  section: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: PALETTE.card,
    padding: 18,
    borderRadius: 14,
    shadowColor: PALETTE.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 8,
  },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 14, color: PALETTE.text, letterSpacing: 0.2 },

  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  infoLabel: { color: PALETTE.muted, fontSize: 14 },
  infoValue: { color: PALETTE.text, fontSize: 14, fontWeight: "600" },

  childCard: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 8,
    padding: 12,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PALETTE.border,
    shadowColor: PALETTE.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  childImage: { width: 50, height: 50, borderRadius: 25, borderWidth: 1, borderColor: PALETTE.border },
  childName: { fontSize: 16, fontWeight: "700", color: PALETTE.text },
  childDetails: { fontSize: 13, color: PALETTE.muted, marginTop: 2 },

  accountItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: PALETTE.border },
  accountText: { fontSize: 16, marginLeft: 12, flex: 1, color: PALETTE.text, fontWeight: "600" },

  // Telegram Style Dropdown Menu
  dropdownMenu: {
    position: "absolute",
    top: 28,
    right: 8,
    backgroundColor: PALETTE.surface,
    borderRadius: 10,
    shadowColor: PALETTE.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 10,
    zIndex: 1000,
    minWidth: 180,
    borderWidth: 1,
    borderColor: PALETTE.border,
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
    borderBottomColor: "#f0f0f0",
    backgroundColor: PALETTE.surface,
  },
  menuText: {
    fontSize: 16,
    color: PALETTE.text,
    fontWeight: "500",
  },

  // Password Change Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContainer: {
    backgroundColor: PALETTE.surface,
    borderRadius: 12,
    width: "90%",
    maxWidth: 400,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: PALETTE.text,
  },
  modalContent: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: PALETTE.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#f8fafc",
  },
  modalActions: {
    flexDirection: "row",
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: PALETTE.border,
    gap: 12,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: PALETTE.border,
  },
  confirmButton: {
    backgroundColor: PALETTE.accent,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: PALETTE.muted,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#fff",
  },

  // Error styles
  errorInput: {
    borderColor: "#dc2626",
    borderWidth: 2,
  },
  errorText: {
    color: "#dc2626",
    fontSize: 12,
    marginTop: 4,
  },
});
