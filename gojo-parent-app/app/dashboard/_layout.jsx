import { Ionicons, FontAwesome6 } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Tabs, useRouter } from "expo-router";
import { ref, onValue, off, get } from "firebase/database";
import { useEffect, useState, useRef, useCallback } from "react";
import { Image, Text, TouchableOpacity, View, StyleSheet, Animated } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { database } from "../../constants/firebaseConfig";

const DEFAULT_AVATAR = "https://cdn-icons-png.flaticon.com/512/847/847969.png";

export default function DashboardLayout() {
  const router = useRouter();

  const [schoolName, setSchoolName] = useState("");
  const [schoolKey, setSchoolKey] = useState(null);

  const [profileImage, setProfileImage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [parentUserId, setParentUserId] = useState(null);
  const [totalUnread, setTotalUnread] = useState(0);

  const shimmerAnim = useRef(new Animated.Value(0)).current;

  const parentRefRef = useRef(null);
  const parentCallbackRef = useRef(null);

  const userRefRef = useRef(null);
  const userCallbackRef = useRef(null);

  const chatsRefRef = useRef(null);
  const chatsCallbackRef = useRef(null);

  const schoolAwarePath = useCallback(
    (subPath, key = schoolKey) => {
      if (key) return `Platform1/Schools/${key}/${subPath}`;
      return subPath;
    },
    [schoolKey]
  );

  const cleanupParentListener = useCallback(() => {
    if (parentRefRef.current && parentCallbackRef.current) {
      try {
        off(parentRefRef.current, "value", parentCallbackRef.current);
      } catch {}
    }
    parentRefRef.current = null;
    parentCallbackRef.current = null;
  }, []);

  const cleanupUserListener = useCallback(() => {
    if (userRefRef.current && userCallbackRef.current) {
      try {
        off(userRefRef.current, "value", userCallbackRef.current);
      } catch {}
    }
    userRefRef.current = null;
    userCallbackRef.current = null;
  }, []);

  const cleanupChatsListener = useCallback(() => {
    if (chatsRefRef.current && chatsCallbackRef.current) {
      try {
        off(chatsRefRef.current, "value", chatsCallbackRef.current);
      } catch {}
    }
    chatsRefRef.current = null;
    chatsCallbackRef.current = null;
  }, []);

  useEffect(() => {
    const shimmer = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );

    shimmer.start();
    return () => shimmer.stop();
  }, [shimmerAnim]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const sk = await AsyncStorage.getItem("schoolKey");
        if (!mounted) return;

        setSchoolKey(sk || null);

        if (sk) {
          const schoolSnap = await get(ref(database, `Platform1/Schools/${sk}/schoolInfo`));
          if (!mounted) return;

          if (schoolSnap.exists()) {
            const info = schoolSnap.val() || {};
            setSchoolName(info.name || "School");
          } else {
            setSchoolName("School");
          }
        } else {
          setSchoolName("School");
        }
      } catch {
        if (mounted) setSchoolName("School");
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const fetchParentProfileImage = async () => {
      try {
        const parentNodeKey = await AsyncStorage.getItem("parentId");

        if (!parentNodeKey) {
          if (mounted) {
            setProfileImage(DEFAULT_AVATAR);
            setLoading(false);
          }
          return;
        }

        const parentRefPath = schoolAwarePath(`Parents/${parentNodeKey}`);
        const parentDbRef = ref(database, parentRefPath);

        cleanupParentListener();
        cleanupUserListener();

        const parentCallback = (parentSnap) => {
          if (!mounted) return;

          if (!parentSnap.exists()) {
            setProfileImage(DEFAULT_AVATAR);
            setLoading(false);
            return;
          }

          const parentData = parentSnap.val() || {};
          const actualUserId = parentData.userId || null;
          setParentUserId(actualUserId);

          if (!actualUserId) {
            setProfileImage(DEFAULT_AVATAR);
            setLoading(false);
            cleanupUserListener();
            return;
          }

          const userRefPath = schoolAwarePath(`Users/${actualUserId}`);
          const userDbRef = ref(database, userRefPath);

          cleanupUserListener();

          const userCallback = (userSnap) => {
            if (!mounted) return;

            if (userSnap.exists()) {
              const user = userSnap.val() || {};
              setProfileImage(user.profileImage || DEFAULT_AVATAR);
            } else {
              setProfileImage(DEFAULT_AVATAR);
            }

            setLoading(false);
          };

          userRefRef.current = userDbRef;
          userCallbackRef.current = userCallback;
          onValue(userDbRef, userCallback);
        };

        parentRefRef.current = parentDbRef;
        parentCallbackRef.current = parentCallback;
        onValue(parentDbRef, parentCallback);
      } catch {
        if (mounted) {
          setProfileImage(DEFAULT_AVATAR);
          setLoading(false);
        }
      }
    };

    if (schoolKey !== undefined) {
      fetchParentProfileImage();
    }

    return () => {
      mounted = false;
      cleanupParentListener();
      cleanupUserListener();
    };
  }, [schoolKey, schoolAwarePath, cleanupParentListener, cleanupUserListener]);

  useEffect(() => {
    if (!parentUserId) {
      setTotalUnread(0);
      cleanupChatsListener();
      return;
    }

    const chatsRefPath = schoolAwarePath("Chats");
    const chatsDbRef = ref(database, chatsRefPath);

    cleanupChatsListener();

    const chatsCallback = (snap) => {
      if (!snap.exists()) {
        setTotalUnread(0);
        return;
      }

      let total = 0;
      snap.forEach((chatSnap) => {
        const unreadNode = chatSnap.child("unread");
        if (unreadNode.exists()) {
          const val = unreadNode.child(parentUserId).val();
          if (typeof val === "number") total += val;
        }
      });

      setTotalUnread(total);
    };

    chatsRefRef.current = chatsDbRef;
    chatsCallbackRef.current = chatsCallback;
    onValue(chatsDbRef, chatsCallback);

    return () => {
      cleanupChatsListener();
    };
  }, [parentUserId, schoolAwarePath, cleanupChatsListener]);

  useEffect(() => {
    return () => {
      cleanupParentListener();
      cleanupUserListener();
      cleanupChatsListener();
    };
  }, [cleanupParentListener, cleanupUserListener, cleanupChatsListener]);

  const skeletonOpacity = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  const ProfileSkeleton = () => (
    <Animated.View
      style={[
        styles.skeleton,
        styles.profileSkeleton,
        {
          opacity: skeletonOpacity,
        },
      ]}
    />
  );

  const MessageIconSkeleton = () => (
    <View style={styles.messageContainer}>
      <Animated.View
        style={[
          styles.skeleton,
          styles.messageSkeleton,
          {
            opacity: skeletonOpacity,
          },
        ]}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <StatusBar style="dark" backgroundColor="#ffffff" translucent={false} />

      <Tabs
        screenOptions={{
          headerShown: true,
          headerStyle: {
            backgroundColor: "#fff",
            shadowColor: "transparent",
            borderBottomWidth: 0,
          },
          headerTitleAlign: "left",
          tabBarActiveTintColor: "#1e90ff",
          tabBarInactiveTintColor: "gray",
          tabBarStyle: {
            height: 56,
            paddingBottom: 6,
            backgroundColor: "#fff",
          },
          tabBarItemStyle: {
            flex: 1,
            justifyContent: "center",
          },
          tabBarLabelStyle: {
            display: "none",
          },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: "Home",
            headerLeft: () => null,
            headerTitle: () => <Text style={styles.brandTitle}>Gojo Study</Text>,
            headerRight: () => (
              <View style={styles.headerRightGroup}>
                <TouchableOpacity style={styles.headerRightButton} onPress={() => router.push("/messages")}>
                  {loading ? (
                    <MessageIconSkeleton />
                  ) : (
                    <View style={styles.messageContainer}>
                      <Ionicons name="paper-plane-outline" size={24} color="#000" />
                      {totalUnread > 0 && (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadText}>{totalUnread > 99 ? "99+" : totalUnread}</Text>
                        </View>
                      )}
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.profileRightButton} onPress={() => router.push("/profile")}>
                  {loading ? (
                    <ProfileSkeleton />
                  ) : (
                    <Image
                      source={{ uri: profileImage || DEFAULT_AVATAR }}
                      style={styles.profileImage}
                    />
                  )}
                </TouchableOpacity>
              </View>
            ),
            tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
          }}
        />

        <Tabs.Screen
          name="classMark"
          options={{
            title: "Class Mark",
            tabBarIcon: ({ color, size }) => <Ionicons name="create-outline" size={size} color={color} />,
          }}
        />

        <Tabs.Screen
          name="attendance"
          options={{
            title: "Attendance",
            tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} />,
          }}
        />

        <Tabs.Screen name="school/payments" options={{ href: null }} />
        <Tabs.Screen name="school/history" options={{ href: null }} />
        <Tabs.Screen name="school/calendar" options={{ href: null }} />

        <Tabs.Screen
          name="school"
          options={{
            title: "Parent Services",
            headerTitle: () => (
              <Text style={styles.schoolTitle} numberOfLines={1} ellipsizeMode="tail">
                {schoolName || "Parent Services"}
              </Text>
            ),
            tabBarIcon: ({ color, size }) => (
              <FontAwesome6 name="building-columns" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#fff",
  },

  headerRightGroup: {
    marginRight: 15,
    flexDirection: "row",
    alignItems: "center",
  },
  headerRightButton: {
    marginRight: 0,
  },
  profileRightButton: {
    marginLeft: 10,
  },

  profileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },

  unreadBadge: {
    position: "absolute",
    right: -2,
    top: -4,
    backgroundColor: "#1e90ff",
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  unreadText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold",
  },

  skeleton: {
    backgroundColor: "#e1e1e1",
  },
  profileSkeleton: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  messageSkeleton: {
    width: 24,
    height: 24,
    borderRadius: 4,
  },

  brandTitle: {
    fontSize: 24,
    fontWeight: "bold",
    fontFamily: "System",
    letterSpacing: -0.5,
    marginLeft: 10,
    color: "#111",
  },

  schoolTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#222",
    marginLeft: 8,
  },

  messageContainer: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
});