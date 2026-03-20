import { Ionicons, FontAwesome6 } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Tabs, useRouter } from "expo-router";
import { ref, onValue, off, get } from "firebase/database";
import { useEffect, useState, useRef } from "react";
import { Image, Text, TouchableOpacity, View, StyleSheet, Animated } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { database } from "../../constants/firebaseConfig";

export default function DashboardLayout() {
  const router = useRouter();
  const [schoolName, setSchoolName] = useState("");
  const [schoolKey, setSchoolKey] = useState(null);

  const [profileImage, setProfileImage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [parentUserId, setParentUserId] = useState(null);
  const [totalUnread, setTotalUnread] = useState(0);

  const shimmerAnim = useRef(new Animated.Value(0)).current;

  const parentListenerRef = useRef(null);
  const userListenerRef = useRef(null);
  const chatsListenerRef = useRef(null);

  const schoolAwarePath = (subPath) => {
    if (schoolKey) return `Platform1/Schools/${schoolKey}/${subPath}`;
    return subPath; // fallback
  };

  useEffect(() => {
    const shimmer = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(shimmerAnim, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    );
    shimmer.start();
    return () => shimmer.stop();
  }, [shimmerAnim]);

  useEffect(() => {
    (async () => {
      try {
        const sk = await AsyncStorage.getItem("schoolKey");
        setSchoolKey(sk || null);

        if (sk) {
          const schoolSnap = await get(ref(database, `Platform1/Schools/${sk}/schoolInfo`));
          if (schoolSnap.exists()) {
            const info = schoolSnap.val() || {};
            setSchoolName( info.name || "School");
          } else {
            setSchoolName("School");
          }
        } else {
          setSchoolName("School");
        }
      } catch {
        setSchoolName("School");
      }
    })();
  }, []);

  useEffect(() => {
    let parentListener;
    let userListener;

    const fetchParentProfileImage = async () => {
      try {
        const parentNodeKey = await AsyncStorage.getItem("parentId");
        if (!parentNodeKey) {
          setLoading(false);
          return;
        }

        const parentRefPath = schoolAwarePath(`Parents/${parentNodeKey}`);
        parentListener = onValue(ref(database, parentRefPath), (parentSnap) => {
          if (!parentSnap.exists()) return;
          const parentData = parentSnap.val() || {};
          const actualUserId = parentData.userId;
          setParentUserId(actualUserId);

          if (!actualUserId) {
            setLoading(false);
            return;
          }

          if (userListener) {
            const oldPath = schoolAwarePath(`Users/${actualUserId}`);
            off(ref(database, oldPath), "value", userListener);
          }

          const userRefPath = schoolAwarePath(`Users/${actualUserId}`);
          userListener = onValue(ref(database, userRefPath), (userSnap) => {
            if (userSnap.exists()) {
              const user = userSnap.val() || {};
              setProfileImage(user.profileImage || "https://cdn-icons-png.flaticon.com/512/847/847969.png");
            } else {
              setProfileImage("https://cdn-icons-png.flaticon.com/512/847/847969.png");
            }
            setLoading(false);
          });

          parentListenerRef.current = () => off(ref(database, parentRefPath), "value", parentListener);
          userListenerRef.current = () => off(ref(database, userRefPath), "value", userListener);
        });
      } catch {
        setProfileImage("https://cdn-icons-png.flaticon.com/512/847/847969.png");
        setLoading(false);
      }
    };

    if (schoolKey !== undefined) {
      fetchParentProfileImage();
    }

    return () => {
      if (parentListenerRef.current) parentListenerRef.current();
      if (userListenerRef.current) userListenerRef.current();
      if (chatsListenerRef.current) chatsListenerRef.current();
    };
  }, [schoolKey]);

  // ✅ migrated unread badge listener to new db
  useEffect(() => {
    if (!parentUserId) {
      setTotalUnread(0);
      return;
    }

    const chatsRefPath = schoolAwarePath("Chats");
    const chatsRef = ref(database, chatsRefPath);

    const chatsListener = onValue(chatsRef, (snap) => {
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
    });

    chatsListenerRef.current = () => off(chatsRef, "value", chatsListener);

    return () => {
      if (chatsListenerRef.current) chatsListenerRef.current();
    };
  }, [parentUserId, schoolKey]);

  const ProfileSkeleton = () => (
    <Animated.View
      style={[
        { width: 40, height: 40, borderRadius: 20 },
        styles.skeleton,
        {
          opacity: shimmerAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.3, 0.7],
          }),
        },
      ]}
    />
  );

  const MessageIconSkeleton = () => (
    <View style={styles.messageContainer}>
      <Animated.View
        style={[
          { width: 24, height: 24, borderRadius: 4 },
          styles.skeleton,
          {
            opacity: shimmerAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.3, 0.7],
            }),
          },
        ]}
      />
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
      <StatusBar style="light" backgroundColor="#000" />
      <Tabs
        screenOptions={{
          headerShown: true,
          headerStyle: { backgroundColor: "#fff", shadowColor: "transparent", borderBottomWidth: 0 },
          headerTitleAlign: "left",
          tabBarActiveTintColor: "#1e90ff",
          tabBarInactiveTintColor: "gray",
          tabBarStyle: { height: 56, paddingBottom: 6, backgroundColor: "#fff" },
          tabBarItemStyle: { flex: 1, justifyContent: "center" },
          tabBarLabelStyle: { display: "none" },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: "Home",
            headerLeft: () => (
              <TouchableOpacity style={{ marginLeft: 15 }} onPress={() => router.push("/profile")}>
                {loading ? (
                  <ProfileSkeleton />
                ) : (
                  <Image
                    source={{ uri: profileImage || "https://cdn-icons-png.flaticon.com/512/847/847969.png" }}
                    style={{ width: 40, height: 40, borderRadius: 20 }}
                  />
                )}
              </TouchableOpacity>
            ),
            headerTitle: () => <Text style={styles.instagramTitle}>Gojo Study</Text>,
            headerRight: () => (
              <TouchableOpacity style={{ marginRight: 15 }} onPress={() => router.push("/messages")}>
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
              <Text style={{ fontSize: 20,fontWeight: "bold", color: "#222", marginLeft: 8 }} numberOfLines={1} ellipsizeMode="tail">
                {schoolName || "Parent Services"}
              </Text>
            ),
            tabBarIcon: ({ color, size }) => (
              <FontAwesome6 name="building-columns" size={size } color={color} />
            )
          }}
        />
      </Tabs>
      
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  unreadText: { color: "#fff", fontSize: 10, fontWeight: "bold" },
  skeleton: { backgroundColor: "#e1e1e1" },
  instagramTitle: {
    fontSize: 24,
    fontWeight: "bold",
    fontFamily: "System",
    letterSpacing: -0.5,
    marginLeft: 10,
  },
  messageContainer: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
});