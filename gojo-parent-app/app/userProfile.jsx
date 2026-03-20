import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Linking,
  Platform,
  Pressable,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { child, get, push, ref, set } from "firebase/database";
import { database } from "../constants/firebaseConfig";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/* ---------------- THEME ---------------- */
const PRIMARY = "#1E90FF";
const BG = "#F4F7FB";
const CARD = "#FFFFFF";
const TEXT = "#0F172A";
const MUTED = "#64748B";
const BORDER = "#E5EDF5";
const ACCENT_SOFT = "#EAF5FF";

const { width } = Dimensions.get("window");
const HEADER_MAX_HEIGHT = Math.max(220, Math.min(280, width * 0.68));
const HEADER_MIN_HEIGHT = 96;
const defaultProfile = "https://cdn-icons-png.flaticon.com/512/847/847969.png";

export default function UserProfile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();

  const { recordId: paramRecordId, userId: paramUserId, roleName: paramRoleName } = params ?? {};

  const [schoolKey, setSchoolKey] = useState(null);
  const [loading, setLoading] = useState(true);

  const [user, setUser] = useState(null);
  const [roleName, setRoleName] = useState(paramRoleName ?? null);
  const [resolvedUserId, setResolvedUserId] = useState(paramUserId ?? null);

  const [parentUserId, setParentUserId] = useState(null);
  const [parentRecordId, setParentRecordId] = useState(null);

  const [children, setChildren] = useState([]);
  const [parents, setParents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [teacherCourses, setTeacherCourses] = useState([]);

  const [menuVisible, setMenuVisible] = useState(false);

  const scrollY = useRef(new Animated.Value(0)).current;
  const [showHero, setShowHero] = useState(true);

  const schoolAwarePath = useCallback(
    (subPath) => (schoolKey ? `Platform1/Schools/${schoolKey}/${subPath}` : subPath),
    [schoolKey]
  );

  useEffect(() => {
    (async () => {
      const [sk, parentId] = await Promise.all([
        AsyncStorage.getItem("schoolKey"),
        AsyncStorage.getItem("parentId"),
      ]);
      setSchoolKey(sk || null);

      if (parentId) {
        setParentRecordId(parentId);
        const parentSnap = await get(child(ref(database), `${sk ? `Platform1/Schools/${sk}/` : ""}Parents/${parentId}`));
        if (parentSnap.exists()) {
          setParentUserId(parentSnap.val()?.userId || null);
        }
      }
    })();
  }, []);

  useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      if (value > 2 && showHero) setShowHero(false);
      if (value <= 2 && !showHero) setShowHero(true);
    });
    return () => scrollY.removeListener(id);
  }, [showHero, scrollY]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      try {
        let localResolvedUserId = paramUserId ?? null;
        const rId = paramRecordId ?? null;
        let detectedRole = roleName;

        if (!localResolvedUserId && rId) {
          const roleNodes = ["Students", "Teachers", "School_Admins", "Parents"];
          for (const node of roleNodes) {
            const snap = await get(child(ref(database), `${schoolAwarePath(node)}/${rId}`));
            if (snap.exists()) {
              const row = snap.val() || {};
              localResolvedUserId = row.userId || null;
              detectedRole =
                node === "Students"
                  ? "Student"
                  : node === "Teachers"
                  ? "Teacher"
                  : node === "Parents"
                  ? "Parent"
                  : "Admin";
              setRoleName(detectedRole);
              break;
            }
          }
        }

        if (mounted) setResolvedUserId(localResolvedUserId || null);

        if (localResolvedUserId) {
          const userSnap = await get(child(ref(database), `${schoolAwarePath("Users")}/${localResolvedUserId}`));
          if (mounted) setUser(userSnap.exists() ? userSnap.val() : null);
        }

        const usersSnap = await get(child(ref(database), schoolAwarePath("Users")));
        const usersData = usersSnap.exists() ? usersSnap.val() : {};

        if (rId && detectedRole === "Parent") {
          const parentSnap = await get(child(ref(database), `${schoolAwarePath("Parents")}/${rId}`));
          if (parentSnap.exists()) {
            const p = parentSnap.val();
            const studentsSnap = await get(child(ref(database), schoolAwarePath("Students")));
            const studentsData = studentsSnap.exists() ? studentsSnap.val() : {};

            const rows = p.children
              ? Object.values(p.children).map((link) => {
                  const st = studentsData[link.studentId];
                  const stUser = usersData[st?.userId] || {};
                  return {
                    studentId: link.studentId,
                    relationship: link.relationship || "Child",
                    name: stUser.name || "Student",
                    profileImage: stUser.profileImage || defaultProfile,
                    grade: st?.grade || "--",
                    section: st?.section || "--",
                  };
                })
              : [];

            if (mounted) setChildren(rows);
          }
        }

        if (rId && detectedRole === "Student") {
          const [studentSnap, teachersSnap, coursesSnap, assignmentsSnap] = await Promise.all([
            get(child(ref(database), `${schoolAwarePath("Students")}/${rId}`)),
            get(child(ref(database), schoolAwarePath("Teachers"))),
            get(child(ref(database), schoolAwarePath("Courses"))),
            get(child(ref(database), schoolAwarePath("TeacherAssignments"))),
          ]);

          const student = studentSnap.exists() ? studentSnap.val() : null;
          const teachersData = teachersSnap.exists() ? teachersSnap.val() : {};
          const coursesData = coursesSnap.exists() ? coursesSnap.val() : {};
          const assignmentData = assignmentsSnap.exists() ? assignmentsSnap.val() : {};

          if (student) {
            let parentRows = [];
            const parentMap = student.parents || {};
            for (const pid of Object.keys(parentMap)) {
              const pSnap = await get(child(ref(database), `${schoolAwarePath("Parents")}/${pid}`));
              if (pSnap.exists()) {
                const pNode = pSnap.val();
                const pUser = usersData[pNode.userId] || {};
                parentRows.push({
                  parentId: pid,
                  userId: pNode.userId,
                  name: pUser.name || pUser.username || "Parent",
                  profileImage: pUser.profileImage || defaultProfile,
                  relationship: parentMap[pid]?.relationship || "Parent",
                });
              }
            }

            if (!parentRows.length) {
              const parentsSnap = await get(child(ref(database), schoolAwarePath("Parents")));
              const parentsData = parentsSnap.exists() ? parentsSnap.val() : {};
              parentRows = Object.keys(parentsData).reduce((acc, pid) => {
                const pNode = parentsData[pid];
                const links = pNode?.children ? Object.values(pNode.children) : [];
                const match = links.find((link) => link?.studentId === rId);
                if (match) {
                  const pUser = usersData[pNode.userId] || {};
                  acc.push({
                    parentId: pid,
                    userId: pNode.userId,
                    name: pUser.name || pUser.username || "Parent",
                    profileImage: pUser.profileImage || defaultProfile,
                    relationship: match.relationship || "Parent",
                  });
                }
                return acc;
              }, []);
            }

            const grade = student?.grade;
            const section = student?.section;
            const matchingCourseIds = Object.keys(coursesData).filter((cid) => {
              const c = coursesData[cid];
              return String(c?.grade) === String(grade) && String(c?.section || "") === String(section || "");
            });

            const teacherMap = {};
            Object.keys(assignmentData).forEach((aid) => {
              const row = assignmentData[aid];
              if (!row?.teacherId || !row?.courseId) return;
              if (!matchingCourseIds.includes(row.courseId)) return;

              if (!teacherMap[row.teacherId]) teacherMap[row.teacherId] = new Set();
              const c = coursesData[row.courseId] || {};
              teacherMap[row.teacherId].add(c.subject || c.name || "Course");
            });

            const teacherRows = Object.keys(teacherMap).map((tid) => {
              const t = teachersData[tid] || {};
              const tUser = usersData[t.userId] || {};
              return {
                teacherId: tid,
                userId: t.userId,
                name: tUser.name || tUser.username || "Teacher",
                profileImage: tUser.profileImage || defaultProfile,
                subjects: Array.from(teacherMap[tid]),
              };
            });

            if (mounted) {
              setParents(parentRows);
              setTeachers(teacherRows);
            }
          }
        }

        if (rId && detectedRole === "Teacher") {
          const [coursesSnap, assignSnap] = await Promise.all([
            get(child(ref(database), schoolAwarePath("Courses"))),
            get(child(ref(database), schoolAwarePath("TeacherAssignments"))),
          ]);

          const coursesData = coursesSnap.exists() ? coursesSnap.val() : {};
          const assignmentData = assignSnap.exists() ? assignSnap.val() : {};

          const assignedCourseIds = Object.keys(assignmentData)
            .filter((aid) => assignmentData[aid]?.teacherId === rId)
            .map((aid) => assignmentData[aid].courseId);

          const uniqueCourseIds = Array.from(new Set(assignedCourseIds));

          const rows = uniqueCourseIds.map((cid) => {
            const c = coursesData[cid] || {};
            return {
              courseId: cid,
              subject: c.subject || c.name || "Subject",
              grade: c.grade || "--",
              section: c.section || "--",
            };
          });

          if (mounted) setTeacherCourses(rows);
        }
      } catch (e) {
        console.warn("userProfile load error:", e);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (schoolKey !== undefined) load();
    return () => {
      mounted = false;
    };
  }, [paramRecordId, paramUserId, roleName, schoolKey, schoolAwarePath]);

  const isSelfProfile =
    !!parentUserId && !!resolvedUserId && String(parentUserId) === String(resolvedUserId);

  const canMessageMain = !!resolvedUserId && !isSelfProfile;

  const profileSubtitle = useMemo(() => {
    if (isSelfProfile) return "This is your profile";
    if (roleName === "Teacher" && teacherCourses.length) return `${teacherCourses[0].subject} Teacher`;
    if (roleName === "Student") return "Student Profile";
    if (roleName === "Parent") return "Parent Profile";
    if (roleName === "Admin") return "School Management";
    return "School Profile";
  }, [isSelfProfile, roleName, teacherCourses]);

  const smallNameOpacity = scrollY.interpolate({
    inputRange: [0, HEADER_MAX_HEIGHT - HEADER_MIN_HEIGHT - 20, HEADER_MAX_HEIGHT - HEADER_MIN_HEIGHT],
    outputRange: [0, 0, 1],
    extrapolate: "clamp",
  });

  const headerHeight = scrollY.interpolate({
    inputRange: [0, HEADER_MAX_HEIGHT - HEADER_MIN_HEIGHT],
    outputRange: [HEADER_MAX_HEIGHT + insets.top, HEADER_MIN_HEIGHT + insets.top],
    extrapolate: "clamp",
  });

  const handleBack = useCallback(() => {
    if (router?.canGoBack && router.canGoBack()) router.back();
    else router.replace("/");
  }, [router]);

  const openChat = () => {
    if (!canMessageMain) return Alert.alert("Not allowed", "You cannot message yourself.");
    router.push({ pathname: "/chat", params: { userId: resolvedUserId } });
  };

  const openChatWith = useCallback(
    (targetUserId, displayName) => {
      if (!targetUserId) {
        return Alert.alert("Chat unavailable", `No chat available for ${displayName || "this user"}.`);
      }
      if (parentUserId && String(targetUserId) === String(parentUserId)) {
        return Alert.alert("Not allowed", "You cannot message yourself.");
      }
      router.push({ pathname: "/chat", params: { userId: targetUserId } });
    },
    [router, parentUserId]
  );

  const handleCall = () => {
    const phone = user?.phone || "";
    if (!phone) return Alert.alert("No phone number", "No phone number available.");
    Linking.openURL(`tel:${String(phone).trim()}`);
  };

  const handleShare = async () => {
    try {
      const name = user?.name || "User";
      const link = `https://gojo.app/userProfile?recordId=${paramRecordId ?? ""}&userId=${paramUserId ?? ""}`;
      await Share.share({ message: `View ${name}'s profile\n${link}` });
    } catch {
      Alert.alert("Sharing failed", "Unable to share this profile.");
    }
  };

  const handleReport = async () => {
    try {
      const reportRef = push(ref(database, schoolAwarePath("Reports")));
      await set(reportRef, {
        targetUserId: resolvedUserId || null,
        targetRecordId: paramRecordId || null,
        targetName: user?.name || null,
        targetRole: roleName || null,
        reporterUserId: parentUserId || null,
        createdAt: Date.now(),
        status: "open",
      });
      const msg = "Reported. We will review this user.";
      if (Platform.OS === "android") ToastAndroid.show(msg, ToastAndroid.SHORT);
      else Alert.alert("Reported", msg);
    } catch {
      const msg = "Could not submit the report.";
      if (Platform.OS === "android") ToastAndroid.show(msg, ToastAndroid.SHORT);
      else Alert.alert("Error", msg);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <View style={[styles.topBar, { top: insets.top + 8 }]}>
        <TouchableOpacity style={styles.topIcon} onPress={handleBack}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>

        <View style={styles.topTitleStack}>
          <Animated.Text style={[styles.topName, { opacity: smallNameOpacity }]} numberOfLines={1}>
            {user?.name}
          </Animated.Text>
          <Animated.Text style={[styles.topSub, { opacity: smallNameOpacity }]} numberOfLines={1}>
            {profileSubtitle}
          </Animated.Text>
        </View>

        <TouchableOpacity style={styles.topIcon} onPress={() => setMenuVisible((v) => !v)}>
          <Ionicons name="ellipsis-vertical" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {menuVisible && (
        <>
          <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)} />
          <View style={[styles.dropdownMenu, { top: insets.top + 52 }]}>
            <Pressable
              style={styles.menuItem}
              onPress={async () => {
                setMenuVisible(false);
                await handleShare();
              }}
            >
              <Ionicons name="share-outline" size={18} color={PRIMARY} style={{ marginRight: 8 }} />
              <Text style={styles.menuText}>Share</Text>
            </Pressable>
            {!isSelfProfile && (
              <Pressable
                style={styles.menuItem}
                onPress={async () => {
                  setMenuVisible(false);
                  await handleReport();
                }}
              >
                <Ionicons name="warning-outline" size={18} color="#F59E0B" style={{ marginRight: 8 }} />
                <Text style={styles.menuText}>Report User</Text>
              </Pressable>
            )}
          </View>
        </>
      )}

      <Animated.ScrollView
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: false,
          listener: (e) => {
            const y = e.nativeEvent.contentOffset.y;
            if (y > 2 && showHero) setShowHero(false);
            if (y <= 2 && !showHero) setShowHero(true);
          },
        })}
        contentContainerStyle={{
          paddingTop: HEADER_MAX_HEIGHT + insets.top + 10,
          paddingBottom: 24 + insets.bottom,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentWrap}>
          <View style={styles.card}>
            <View style={styles.identityRow}>
              <Image source={{ uri: user?.profileImage || defaultProfile }} style={styles.identityAvatar} />
              <View style={{ flex: 1 }}>
                <Text style={styles.identityName}>{user?.name || "User"}</Text>
                <Text style={styles.identitySub}>{profileSubtitle}</Text>
                <View style={styles.rolePill}>
                  <Text style={styles.rolePillText}>{roleName || "User"}</Text>
                </View>
              </View>
            </View>

            <View style={styles.actionRow}>
              {canMessageMain && (
                <TouchableOpacity style={styles.actionBtn} onPress={openChat}>
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color={PRIMARY} />
                  <Text style={styles.actionText}>Message</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.actionBtn} onPress={handleCall}>
                <Ionicons name="call-outline" size={18} color={PRIMARY} />
                <Text style={styles.actionText}>Call</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
                <Ionicons name="share-social-outline" size={18} color={PRIMARY} />
                <Text style={styles.actionText}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.card}>
            <SectionHeader title="Info" icon="person-circle-outline" />
            <InfoRow label="Name" value={user?.name} />
            <InfoRow label="Username" value={user?.username} />
            <InfoRow label="Phone" value={user?.phone} />
            <InfoRow label="Email" value={user?.email} />
            <InfoRow label="Role" value={roleName} />
          </View>

          {children.length > 0 && (
            <View style={styles.card}>
              <SectionHeader title="Children" icon="people-outline" />
              {children.map((c) => (
                <PersonRow
                  key={c.studentId}
                  name={c.name}
                  subtitle={`Grade ${c.grade} • Section ${c.section}`}
                  extra={`Relation: ${c.relationship}`}
                  image={c.profileImage}
                  onPress={() => router.push(`/userProfile?recordId=${c.studentId}`)}
                />
              ))}
            </View>
          )}

          {parents.length > 0 && (
            <View style={styles.card}>
              <SectionHeader title="Parents" icon="home-outline" />
              {parents.map((p) => (
                <PersonRow
                  key={p.parentId}
                  name={p.name}
                  subtitle={`Relation: ${p.relationship}`}
                  image={p.profileImage}
                  onPress={() => {
                    if (parentRecordId && p.parentId === parentRecordId) router.push("/profile");
                    else router.push(`/userProfile?recordId=${p.parentId}`);
                  }}
                  onMessage={
                    p.userId && (!parentUserId || String(p.userId) !== String(parentUserId))
                      ? () => openChatWith(p.userId, p.name)
                      : null
                  }
                />
              ))}
            </View>
          )}

          {teachers.length > 0 && (
            <View style={styles.card}>
              <SectionHeader title="Teachers" icon="school-outline" />
              {teachers.map((t) => (
                <PersonRow
                  key={t.teacherId}
                  name={t.name}
                  subtitle={t.subjects?.length ? t.subjects.join(", ") : "Teacher"}
                  image={t.profileImage}
                  onPress={() => router.push(`/userProfile?recordId=${t.teacherId}`)}
                  onMessage={
                    t.userId && (!parentUserId || String(t.userId) !== String(parentUserId))
                      ? () => openChatWith(t.userId, t.name)
                      : null
                  }
                />
              ))}
            </View>
          )}

          {roleName === "Teacher" && teacherCourses.length > 0 && (
            <View style={styles.card}>
              <SectionHeader title="Subjects" icon="book-outline" />
              {teacherCourses.map((c) => (
                <View key={c.courseId} style={styles.subjectRow}>
                  <Text style={styles.subjectName}>{c.subject}</Text>
                  <Text style={styles.subjectMeta}>Grade {c.grade} • Section {c.section}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </Animated.ScrollView>

      <Animated.View style={[styles.header, { height: headerHeight }]}>
        <Image source={{ uri: user?.profileImage || defaultProfile }} style={styles.headerBgImage} />
        <View style={styles.headerBgOverlay} />

        {showHero && (
          <View style={[styles.heroWrap, { bottom: 12 }]}>
            <View style={styles.photoCard}>
              <Image source={{ uri: user?.profileImage || defaultProfile }} style={styles.photoCardImage} />
            </View>

            <View style={styles.identityCardHero}>
              <Text style={styles.heroName} numberOfLines={1}>
                {user?.name}
              </Text>
              <Text style={styles.heroSub} numberOfLines={1}>
                {profileSubtitle}
              </Text>
            </View>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

function SectionHeader({ title, icon }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIconWrap}>
        <Ionicons name={icon} size={16} color="#0B72C7" />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
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

function PersonRow({ name, subtitle, extra, image, onPress, onMessage }) {
  return (
    <TouchableOpacity style={styles.personCard} onPress={onPress} activeOpacity={0.86}>
      <Image source={{ uri: image || defaultProfile }} style={styles.personAvatar} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.personName}>{name}</Text>
        {!!subtitle && <Text style={styles.personMeta}>{subtitle}</Text>}
        {!!extra && <Text style={styles.personMeta}>{extra}</Text>}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {onMessage && (
          <TouchableOpacity style={styles.msgBtn} onPress={onMessage}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={PRIMARY} />
          </TouchableOpacity>
        )}
        <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: BG },

  topBar: {
    position: "absolute",
    left: 12,
    right: 12,
    height: 40,
    zIndex: 120,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  topIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(15, 23, 42, 0.28)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
  },
  topTitleStack: { alignItems: "center", justifyContent: "center", maxWidth: "62%" },
  topName: { color: "#fff", fontSize: 15, fontWeight: "700" },
  topSub: { color: "#DBEAFE", fontSize: 11, marginTop: 1 },

  header: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    overflow: "hidden",
    backgroundColor: PRIMARY,
    zIndex: 10,
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
    flexDirection: "row",
    alignItems: "stretch",
  },
  photoCard: {
    width: 120,
    height: 144,
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
  identityCardHero: {
    flex: 1,
    marginLeft: 12,
    backgroundColor: "rgba(15,23,42,0.36)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    paddingVertical: 12,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  heroName: { color: "#fff", fontSize: 20, fontWeight: "800", letterSpacing: 0.2 },
  heroSub: { color: "#DDEAFE", fontSize: 13, marginTop: 3 },

  contentWrap: { paddingHorizontal: 14, gap: 12 },

  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
  },

  identityRow: { flexDirection: "row", alignItems: "center" },
  identityAvatar: { width: 64, height: 64, borderRadius: 16, backgroundColor: "#E5E7EB", marginRight: 12 },
  identityName: { fontSize: 18, fontWeight: "800", color: TEXT },
  identitySub: { fontSize: 12, color: MUTED, marginTop: 2 },

  rolePill: {
    marginTop: 7,
    alignSelf: "flex-start",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EEF4FF",
  },
  rolePillText: { fontSize: 12, fontWeight: "700", color: "#1E3A8A" },

  actionRow: { marginTop: 14, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionBtn: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    flexDirection: "row",
    gap: 6,
  },
  actionText: { fontSize: 12, fontWeight: "700", color: "#334155" },

  sectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  sectionIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: ACCENT_SOFT,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: TEXT },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#EFF4FA",
  },
  infoLabel: { color: MUTED, fontSize: 13, fontWeight: "600" },
  infoValue: { color: TEXT, fontSize: 13, fontWeight: "700", maxWidth: "62%", textAlign: "right" },

  personCard: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    padding: 12,
    backgroundColor: "#FAFCFF",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: BORDER,
  },
  personAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: "#E5E7EB" },
  personName: { fontSize: 15, fontWeight: "700", color: TEXT },
  personMeta: { fontSize: 12.5, color: MUTED, marginTop: 2 },

  msgBtn: {
    marginRight: 10,
    padding: 7,
    borderRadius: 999,
    backgroundColor: "#E0F2FE",
  },

  subjectRow: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: BORDER,
    marginTop: 8,
  },
  subjectName: { fontSize: 14, color: TEXT, fontWeight: "700" },
  subjectMeta: { fontSize: 12.5, color: MUTED, marginTop: 3 },

  dropdownMenu: {
    position: "absolute",
    right: 10,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    zIndex: 1000,
    minWidth: 180,
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
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    flexDirection: "row",
    alignItems: "center",
  },
  menuText: { fontSize: 15, color: TEXT, fontWeight: "600" },
});