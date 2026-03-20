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
  ScrollView,
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

const { width } = Dimensions.get("window");

const HEADER_MAX_HEIGHT = Math.max(220, Math.min(280, width * 0.68));
const HEADER_MIN_HEIGHT = 58;
const MINI_AVATAR = 34;

const PALETTE = {
  background: "#FFFFFF",
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

const defaultProfile = "https://cdn-icons-png.flaticon.com/512/847/847969.png";
const WEEK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

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

  const [parents, setParents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [teacherCourses, setTeacherCourses] = useState([]);

  const [studentWeeklySchedule, setStudentWeeklySchedule] = useState({});
  const [studentGradeSection, setStudentGradeSection] = useState(null);
  const [selectedScheduleDay, setSelectedScheduleDay] = useState(null);

  const [showMenu, setShowMenu] = useState(false);

  const scrollY = useRef(new Animated.Value(0)).current;

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
        const parentSnap = await get(
          child(ref(database), `${sk ? `Platform1/Schools/${sk}/` : ""}Parents/${parentId}`)
        );
        if (parentSnap.exists()) {
          setParentUserId(parentSnap.val()?.userId || null);
        }
      }
    })();
  }, []);

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

        const usersSnap = await get(child(ref(database), schoolAwarePath("Users")));
        const usersData = usersSnap.exists() ? usersSnap.val() : {};

        if (localResolvedUserId) {
          const userSnap = await get(child(ref(database), `${schoolAwarePath("Users")}/${localResolvedUserId}`));
          if (mounted) setUser(userSnap.exists() ? userSnap.val() : null);
        }

        if (rId && detectedRole === "Student") {
          const [studentSnap, teachersSnap, schedulesSnap] = await Promise.all([
            get(child(ref(database), `${schoolAwarePath("Students")}/${rId}`)),
            get(child(ref(database), schoolAwarePath("Teachers"))),
            get(child(ref(database), schoolAwarePath("Schedules"))),
          ]);

          const student = studentSnap.exists() ? studentSnap.val() : null;
          const teachersData = teachersSnap.exists() ? teachersSnap.val() : {};
          const schedulesData = schedulesSnap.exists() ? schedulesSnap.val() : {};

          if (student) {
            const grade = student?.grade;
            const section = student?.section;
            const gradeSectionKey = `Grade ${grade}${section || ""}`;
            setStudentGradeSection({ grade, section, key: gradeSectionKey });

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

            const teacherMap = {};

            const teacherIndexByName = {};
            Object.keys(teachersData || {}).forEach((teacherId) => {
              const teacherNode = teachersData[teacherId];
              const teacherUser = usersData?.[teacherNode?.userId] || {};
              const nm = String(teacherUser?.name || "").trim().toLowerCase();
              if (nm) {
                teacherIndexByName[nm] = {
                  teacherId,
                  userId: teacherNode?.userId || null,
                  name: teacherUser?.name || "Teacher",
                  profileImage: teacherUser?.profileImage || defaultProfile,
                };
              }
            });

            const weekly = {};
            WEEK_DAYS.forEach((day) => {
              const dayPeriods = schedulesData?.[day]?.[gradeSectionKey] || {};
              const sorted = Object.entries(dayPeriods)
                .map(([periodName, info]) => ({
                  periodName,
                  subject: info?.subject || "Free Period",
                  teacherName: info?.teacherName || "Unassigned",
                  isFree: (info?.subject || "Free Period") === "Free Period",
                }))
                .sort((a, b) => a.periodName.localeCompare(b.periodName));

              weekly[day] = sorted;

              sorted.forEach((period) => {
                if (!period.teacherName || period.teacherName === "Unassigned") return;
                if (period.subject === "Free Period") return;

                const normalizedTeacherName = String(period.teacherName).trim().toLowerCase();
                const teacherEntry = teacherIndexByName[normalizedTeacherName] || null;

                const mapKey = teacherEntry?.teacherId || normalizedTeacherName;
                if (!teacherMap[mapKey]) {
                  teacherMap[mapKey] = {
                    teacherId: teacherEntry?.teacherId || null,
                    userId: teacherEntry?.userId || null,
                    name: teacherEntry?.name || period.teacherName,
                    profileImage: teacherEntry?.profileImage || defaultProfile,
                    subjects: new Set(),
                  };
                }
                teacherMap[mapKey].subjects.add(period.subject);
              });
            });

            const teacherRows = Object.values(teacherMap).map((t) => ({
              ...t,
              subjects: Array.from(t.subjects),
            }));

            const todayName = new Date().toLocaleDateString("en-US", { weekday: "long" });
            const defaultDay = WEEK_DAYS.includes(todayName) ? todayName : "Monday";

            if (mounted) {
              setParents(parentRows);
              setTeachers(teacherRows);
              setStudentWeeklySchedule(weekly);
              setSelectedScheduleDay(defaultDay);
            }
          }
        }

        if (rId && detectedRole === "Teacher") {
          const gradeSnap = await get(child(ref(database), schoolAwarePath("GradeManagement/grades")));
          const gradesData = gradeSnap.exists() ? gradeSnap.val() : {};

          const courseRows = [];
          Object.keys(gradesData || {}).forEach((gradeKey) => {
            const gradeNode = gradesData[gradeKey] || {};
            const sectionTeacherMap = gradeNode?.sectionSubjectTeachers || {};

            Object.keys(sectionTeacherMap).forEach((sectionKey) => {
              const sectionAssignments = sectionTeacherMap[sectionKey] || {};
              Object.keys(sectionAssignments).forEach((subjectKey) => {
                const assignment = sectionAssignments[subjectKey];
                if (assignment?.teacherId === rId) {
                  courseRows.push({
                    courseId: assignment?.courseId || `${gradeKey}-${sectionKey}-${subjectKey}`,
                    subject: assignment?.subject || subjectKey,
                    grade: gradeKey,
                    section: sectionKey,
                  });
                }
              });
            });
          });

          if (mounted) setTeacherCourses(courseRows);
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

  const selectedDayPeriods = useMemo(() => {
    if (!selectedScheduleDay) return [];
    return studentWeeklySchedule?.[selectedScheduleDay] || [];
  }, [selectedScheduleDay, studentWeeklySchedule]);

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

  const handleBack = useCallback(() => {
    if (router?.canGoBack && router.canGoBack()) router.back();
    else router.replace("/");
  }, [router]);

  const openChat = () => {
    if (!canMessageMain) return Alert.alert("Not allowed", "You cannot message yourself.");
    router.push({ pathname: "/chat", params: { userId: resolvedUserId } });
    console.log("Opening chat with userId:", resolvedUserId);
  };

  const openChatWith = useCallback(
    (targetUserId, displayName) => {
      if (!targetUserId) {
        return Alert.alert("Chat unavailable", `No chat available for ${displayName || "this user"}.`);
      }
      if (parentUserId && String(targetUserId) === String(parentUserId)) {
        return Alert.alert("Not allowed", "You cannot message yourself.");
      }
          console.log("Opening chat with userId:", targetUserId);

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
        <ActivityIndicator size="large" color={PALETTE.accent} />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <View style={[styles.topActionsRow, { top: insets.top + 8 }]}>
        <TouchableOpacity style={styles.topIcon} onPress={handleBack}>
          <Ionicons name="arrow-back" size={21} color="#fff" />
        </TouchableOpacity>

        <Animated.View style={[styles.compactCenter, { opacity: compactBarOpacity }]}>
          <Image source={{ uri: user?.profileImage || defaultProfile }} style={styles.compactAvatar} />
          <View>
            <Text style={styles.compactName} numberOfLines={1}>
              {user?.name}
            </Text>
            <Text style={styles.compactSub}>{profileSubtitle}</Text>
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
            <TouchableOpacity
              style={styles.menuItem}
              onPress={async () => {
                setShowMenu(false);
                await handleShare();
              }}
            >
              <Text style={styles.menuText}>Share</Text>
            </TouchableOpacity>
            {!isSelfProfile && (
              <TouchableOpacity
                style={[styles.menuItem, styles.menuItemNoBorder]}
                onPress={async () => {
                  setShowMenu(false);
                  await handleReport();
                }}
              >
                <Text style={[styles.menuText, { color: "#F59E0B" }]}>Report User</Text>
              </TouchableOpacity>
            )}
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
            {canMessageMain && (
              <QuickAction icon="chatbubble-ellipses-outline" label="Message" onPress={openChat} />
            )}
            <QuickAction icon="call-outline" label="Call" onPress={handleCall} />
            <QuickAction icon="share-social-outline" label="Share" onPress={handleShare} />
          </View>

          <View style={styles.card}>
            <SectionHeader title="Info" icon="person-circle-outline" />
            <InfoRow label="Name" value={user?.name} />
            <InfoRow label="Username" value={user?.username} />
            <InfoRow label="Phone" value={user?.phone} />
            <InfoRow label="Email" value={user?.email} />
            <InfoRow label="Role" value={roleName} />
          </View>

          {roleName === "Student" && (
            <>
              <View style={styles.card}>
                <SectionHeader title="Periods" icon="calendar-outline" />

                {studentGradeSection?.key ? (
                  <Text style={styles.scheduleHeaderText}>{studentGradeSection.key}</Text>
                ) : null}

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.dayChipRow}
                >
                  {WEEK_DAYS.map((day) => {
                    const active = selectedScheduleDay === day;
                    const dayCount = studentWeeklySchedule?.[day]?.length || 0;
                    return (
                      <TouchableOpacity
                        key={day}
                        style={[styles.dayChip, active && styles.dayChipActive]}
                        onPress={() => setSelectedScheduleDay(day)}
                        activeOpacity={0.88}
                      >
                        <Text style={[styles.dayChipTitle, active && styles.dayChipTitleActive]}>
                          {day}
                        </Text>
                        <Text style={[styles.dayChipSub, active && styles.dayChipSubActive]}>
                          {dayCount} period{dayCount === 1 ? "" : "s"}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <View style={styles.selectedDayBanner}>
                  <Ionicons name="time-outline" size={16} color={PALETTE.accentDark} />
                  <Text style={styles.selectedDayBannerText}>
                    {selectedScheduleDay || "Today"}'s periods
                  </Text>
                </View>

                <View style={styles.periodsViewport}>
                  <ScrollView
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={selectedDayPeriods.length > 4}
                    contentContainerStyle={styles.periodsViewportContent}
                  >
                    {selectedDayPeriods.length ? (
                      selectedDayPeriods.map((p, index) => (
                        <View
                          key={`${selectedScheduleDay}-${p.periodName}`}
                          style={[
                            styles.periodCard,
                            p.isFree && styles.periodCardFree,
                            index === 0 && { marginTop: 0 },
                          ]}
                        >
                          <View style={styles.periodTopRow}>
                            <View style={[styles.periodBadge, p.isFree && styles.periodBadgeFree]}>
                              <Text style={[styles.periodBadgeText, p.isFree && styles.periodBadgeTextFree]}>
                                {p.periodName}
                              </Text>
                            </View>

                            <View
                              style={[
                                styles.subjectMiniChip,
                                p.isFree && styles.subjectMiniChipFree,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.subjectMiniChipText,
                                  p.isFree && styles.subjectMiniChipTextFree,
                                ]}
                              >
                                {p.isFree ? "Free" : "Class"}
                              </Text>
                            </View>
                          </View>

                          <Text style={[styles.periodSubject, p.isFree && styles.periodSubjectFree]}>
                            {p.subject}
                          </Text>
                          <Text style={styles.periodTeacher}>{p.teacherName}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.emptyText}>No schedule found for this day.</Text>
                    )}
                  </ScrollView>
                </View>
              </View>

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
                      key={t.teacherId || t.name}
                      name={t.name}
                      subtitle={t.subjects?.length ? t.subjects.join(", ") : "Teacher"}
                      image={t.profileImage}
                      onPress={() => (t.teacherId ? router.push(`/userProfile?recordId=${t.teacherId}`) : null)}
                      onMessage={
                        t.userId && (!parentUserId || String(t.userId) !== String(parentUserId))
                          ? () => openChatWith(t.userId, t.name)
                          : null
                      }
                    />
                  ))}
                </View>
              )}
            </>
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

          {roleName === "Parent" && (
            <View style={styles.card}>
              <SectionHeader title="Account" icon="settings-outline" />

              <TouchableOpacity
                style={styles.accountItem}
                onPress={canMessageMain ? openChat : handleShare}
              >
                <View style={[styles.accountIconWrap, { backgroundColor: "#E9F5FF" }]}>
                  <Ionicons
                    name={canMessageMain ? "chatbubble-ellipses-outline" : "share-social-outline"}
                    size={18}
                    color={PALETTE.accentDark}
                  />
                </View>
                <Text style={styles.accountText}>
                  {canMessageMain ? "Send Message" : "Share Profile"}
                </Text>
                <Ionicons name="chevron-forward-outline" size={18} color="#8EA1B5" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.accountItem} onPress={handleCall}>
                <View style={[styles.accountIconWrap, { backgroundColor: "#ECFDF3" }]}>
                  <Ionicons name="call-outline" size={18} color="#059669" />
                </View>
                <Text style={styles.accountText}>Call User</Text>
                <Ionicons name="chevron-forward-outline" size={18} color="#8EA1B5" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.accountItem, styles.accountItemNoBorder]}
                onPress={handleShare}
              >
                <View style={[styles.accountIconWrap, { backgroundColor: "#F1F5FF" }]}>
                  <Ionicons name="share-social-outline" size={18} color="#4F46E5" />
                </View>
                <Text style={styles.accountText}>Share Profile</Text>
                <Ionicons name="chevron-forward-outline" size={18} color="#8EA1B5" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Animated.ScrollView>

      <Animated.View style={[styles.header, { height: headerHeight }]}>
        <Image source={{ uri: user?.profileImage || defaultProfile }} style={styles.headerBgImage} />
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
            <Image source={{ uri: user?.profileImage || defaultProfile }} style={styles.photoCardImage} />
          </View>

          <View style={styles.identitySide}>
            <View style={styles.identityCard}>
              <Text style={styles.identityName} numberOfLines={1}>
                {user?.name}
              </Text>
              {!!user?.username && <Text style={styles.identityUsername}>@{user.username}</Text>}
              <Text style={styles.identityRole}>{profileSubtitle}</Text>
            </View>
          </View>
        </Animated.View>
      </Animated.View>
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

function PersonRow({ name, subtitle, extra, image, onPress, onMessage }) {
  return (
    <TouchableOpacity style={styles.childCard} onPress={onPress} activeOpacity={0.88}>
      <Image source={{ uri: image || defaultProfile }} style={styles.childImage} />
      <View style={styles.childBody}>
        <Text style={styles.childName}>{name}</Text>
        {!!subtitle && <Text style={styles.childMeta}>{subtitle}</Text>}
        {!!extra && <Text style={styles.childMeta}>{extra}</Text>}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {onMessage && (
          <TouchableOpacity style={styles.msgBtn} onPress={onMessage}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={PALETTE.accent} />
          </TouchableOpacity>
        )}
        <Ionicons name="chevron-forward" size={18} color="#8EA1B5" />
      </View>
    </TouchableOpacity>
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
  identityRole: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 8,
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

  msgBtn: {
    marginRight: 10,
    padding: 7,
    borderRadius: 999,
    backgroundColor: "#E0F2FE",
  },

  subjectRow: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: PALETTE.border,
    marginTop: 8,
  },
  subjectName: { fontSize: 14, color: PALETTE.text, fontWeight: "700" },
  subjectMeta: { fontSize: 12.5, color: PALETTE.muted, marginTop: 3 },

  scheduleHeaderText: {
    fontSize: 12.5,
    color: PALETTE.muted,
    fontWeight: "700",
    marginBottom: 10,
  },

  dayChipRow: {
    gap: 10,
    paddingRight: 6,
    paddingBottom: 8,
  },
  dayChip: {
    minWidth: 122,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: PALETTE.border,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  dayChipActive: {
    backgroundColor: "#EEF6FF",
    borderColor: "#BFDBFE",
  },
  dayChipTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: PALETTE.text,
  },
  dayChipTitleActive: {
    color: PALETTE.accentDark,
  },
  dayChipSub: {
    fontSize: 11,
    color: PALETTE.muted,
    marginTop: 3,
    fontWeight: "600",
  },
  dayChipSubActive: {
    color: PALETTE.accentDark,
  },

  selectedDayBanner: {
    marginTop: 12,
    marginBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: PALETTE.accentSoft,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    alignSelf: "flex-start",
  },
  selectedDayBannerText: {
    marginLeft: 6,
    color: PALETTE.accentDark,
    fontSize: 12,
    fontWeight: "800",
  },

  periodCard: {
    marginTop: 10,
    padding: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PALETTE.border,
    backgroundColor: "#FAFCFF",
  },
  periodCardFree: {
    backgroundColor: "#F8FAFC",
  },
  periodTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  periodBadge: {
    backgroundColor: "#EEF4FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  periodBadgeFree: {
    backgroundColor: "#F1F5F9",
    borderColor: "#E2E8F0",
  },
  periodBadgeText: {
    color: "#1E3A8A",
    fontSize: 11,
    fontWeight: "800",
  },
  periodBadgeTextFree: {
    color: "#64748B",
  },
  subjectMiniChip: {
    backgroundColor: "#DBEAFE",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  subjectMiniChipFree: {
    backgroundColor: "#E2E8F0",
  },
  subjectMiniChipText: {
    color: PALETTE.accentDark,
    fontSize: 10,
    fontWeight: "800",
  },
  subjectMiniChipTextFree: {
    color: "#64748B",
  },
  periodSubject: {
    marginTop: 10,
    fontSize: 16,
    color: PALETTE.text,
    fontWeight: "800",
  },
  periodSubjectFree: {
    color: "#64748B",
  },
  periodTeacher: {
    marginTop: 4,
    fontSize: 12.5,
    color: PALETTE.muted,
    fontWeight: "600",
  },

  emptyText: {
    fontSize: 13,
    color: PALETTE.muted,
    fontWeight: "600",
    marginTop: 8,
  },

  dropdownMenu: {
    position: "absolute",
    right: 10,
    backgroundColor: PALETTE.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PALETTE.border,
    zIndex: 1000,
    minWidth: 190,
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
});
