import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ref, get } from "firebase/database";
import { Ionicons } from "@expo/vector-icons";
import { database } from "../../constants/firebaseConfig";

const PRIMARY = "#1E90FF";
const BG = "#FFFFFF";
const CARD = "#FFFFFF";
const TEXT = "#0F172A";
const MUTED = "#64748B";
const BORDER = "#E5EAF2";
const SUCCESS = "#16A34A";
const WARNING = "#EA580C";

const defaultProfile = "https://cdn-icons-png.flaticon.com/512/847/847969.png";
const CACHE_KEY = "classMark_cache_v2";

const getPathPrefix = async () => {
  const sk = (await AsyncStorage.getItem("schoolKey")) || null;
  return sk ? `Platform1/Schools/${sk}/` : "";
};

const chipColorByPercent = (p) => {
  if (p >= 75) return SUCCESS;
  if (p >= 50) return PRIMARY;
  return WARNING;
};

export default function ClassMark() {
  const { width } = useWindowDimensions();

  const [parentId, setParentId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshingBg, setRefreshingBg] = useState(false);

  const [children, setChildren] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [childUser, setChildUser] = useState(null);
  const [rank, setRank] = useState(null);

  const [courses, setCourses] = useState([]);
  const [marksByCourse, setMarksByCourse] = useState({});
  const [showList, setShowList] = useState(false);

  const [selectedSemester, setSelectedSemester] = useState("semester2");
  const [selectedQuarter, setSelectedQuarter] = useState(null);
  const [expanded, setExpanded] = useState({});

  const shimmerAnim = useRef(new Animated.Value(-120)).current;

  const scale = width < 360 ? 0.92 : width >= 768 ? 1.1 : 1.0;
  const fontScale = width < 360 ? 0.92 : width >= 768 ? 1.08 : 1.0;
  const avatarSize = Math.round(72 * scale);

  useEffect(() => {
    AsyncStorage.getItem("parentId").then((id) => {
      if (id) setParentId(id);
    });

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 220,
          duration: 1100,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: -120,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmerAnim]);

  const saveCache = async (payload) => {
    try {
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch {}
  };

  const loadCache = async () => {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const fetchChildBundle = async ({ prefix, studentId, childInfo }) => {
    const [studentSnap, rankSnap] = await Promise.all([
      get(ref(database, `${prefix}Students/${studentId}`)),
      get(ref(database, `${prefix}Ranks/${studentId}`)),
    ]);

    const student = studentSnap.exists() ? studentSnap.val() : null;
    if (!student) return null;

    const userSnap = await get(ref(database, `${prefix}Users/${student.userId}`));
    const user = userSnap.exists() ? userSnap.val() : {};

    const childUserObj = {
      ...user,
      studentId,
      grade: student.grade,
      section: student.section,
      _childInfo: childInfo,
    };

    const [coursesSnap, assignSnap, teachersSnap] = await Promise.all([
      get(ref(database, `${prefix}Courses`)),
      get(ref(database, `${prefix}TeacherAssignments`)),
      get(ref(database, `${prefix}Teachers`)),
    ]);

    const allCourses = coursesSnap.exists() ? coursesSnap.val() : {};
    const allAssignments = assignSnap.exists() ? assignSnap.val() : {};
    const allTeachers = teachersSnap.exists() ? teachersSnap.val() : {};

    const relevantCourses = Object.keys(allCourses)
      .map((id) => ({ courseId: id, ...allCourses[id] }))
      .filter((c) => String(c.grade) === String(student.grade) && String(c.section) === String(student.section));

    const teacherUserIds = new Set();
    const courseList = relevantCourses.map((course) => {
      const assign = Object.values(allAssignments).find((a) => a.courseId === course.courseId);
      const teacherId = assign?.teacherId || null;
      const teacherUserId = teacherId ? allTeachers?.[teacherId]?.userId : null;
      if (teacherUserId) teacherUserIds.add(teacherUserId);

      return {
        ...course,
        teacherId,
        teacherUserId,
        teacherName: "Teacher",
      };
    });

    if (teacherUserIds.size > 0) {
      const users = await Promise.all(
        Array.from(teacherUserIds).map(async (uid) => {
          const s = await get(ref(database, `${prefix}Users/${uid}`));
          return [uid, s.exists() ? s.val() : null];
        })
      );
      const tUserMap = Object.fromEntries(users);

      courseList.forEach((c) => {
        c.teacherName = c.teacherUserId ? tUserMap?.[c.teacherUserId]?.name || "Teacher" : "Teacher";
      });
    }

    const courseIds = courseList.map((c) => c.courseId);
    const markSnaps = await Promise.all(
      courseIds.map(async (courseId) => {
        const s = await get(ref(database, `${prefix}ClassMarks/${courseId}/${studentId}`));
        return [courseId, s.exists() ? s.val() : {}];
      })
    );
    const marksMap = Object.fromEntries(markSnaps);

    return {
      childUser: childUserObj,
      rank: rankSnap.exists() ? rankSnap.val() : null,
      courses: courseList,
      marksByCourse: marksMap,
    };
  };

  useEffect(() => {
    if (!parentId) return;

    let mounted = true;

    (async () => {
      const cached = await loadCache();
      if (cached && mounted) {
        setChildren(cached.children || []);
        setCurrentIndex(cached.currentIndex || 0);
        setChildUser(cached.childUser || null);
        setRank(cached.rank ?? null);
        setCourses(cached.courses || []);
        setMarksByCourse(cached.marksByCourse || {});
        setSelectedSemester(cached.selectedSemester || "semester2");
        setSelectedQuarter(cached.selectedQuarter || null);
        setLoading(false);
      }

      setRefreshingBg(true);
      try {
        const prefix = await getPathPrefix();

        const parentSnap = await get(ref(database, `${prefix}Parents/${parentId}`));
        const parent = parentSnap.exists() ? parentSnap.val() : null;
        const kids = parent?.children ? Object.values(parent.children) : [];

        if (!mounted) return;
        setChildren(kids);

        if (kids.length === 0) {
          setLoading(false);
          setRefreshingBg(false);
          return;
        }

        const idx = cached?.currentIndex && kids[cached.currentIndex] ? cached.currentIndex : 0;
        const chosen = kids[idx];
        const studentId = chosen.studentId;

        const bundle = await fetchChildBundle({ prefix, studentId, childInfo: chosen });
        if (!bundle || !mounted) return;

        setCurrentIndex(idx);
        setChildUser(bundle.childUser);
        setRank(bundle.rank);
        setCourses(bundle.courses);
        setMarksByCourse(bundle.marksByCourse);

        setLoading(false);

        saveCache({
          children: kids,
          currentIndex: idx,
          childUser: bundle.childUser,
          rank: bundle.rank,
          courses: bundle.courses,
          marksByCourse: bundle.marksByCourse,
          selectedSemester,
          selectedQuarter,
          ts: Date.now(),
        });
      } catch (e) {
        console.warn("ClassMark load error:", e);
        setLoading(false);
      } finally {
        if (mounted) setRefreshingBg(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [parentId]);

  const switchChild = async (child, index) => {
    try {
      setLoading(true);
      const prefix = await getPathPrefix();
      const bundle = await fetchChildBundle({
        prefix,
        studentId: child.studentId,
        childInfo: child,
      });
      if (!bundle) {
        setLoading(false);
        return;
      }

      setCurrentIndex(index);
      setChildUser(bundle.childUser);
      setRank(bundle.rank);
      setCourses(bundle.courses);
      setMarksByCourse(bundle.marksByCourse);
      setExpanded({});
      setShowList(false);

      saveCache({
        children,
        currentIndex: index,
        childUser: bundle.childUser,
        rank: bundle.rank,
        courses: bundle.courses,
        marksByCourse: bundle.marksByCourse,
        selectedSemester,
        selectedQuarter,
        ts: Date.now(),
      });
    } catch (e) {
      console.warn("switchChild error:", e);
    } finally {
      setLoading(false);
    }
  };

  const availableQuarterKeys = useMemo(() => {
    if (!childUser?.studentId) return [];
    const qSet = new Set();

    courses.forEach((course) => {
      const semNode = marksByCourse?.[course.courseId]?.[selectedSemester];
      if (!semNode || typeof semNode !== "object") return;
      Object.keys(semNode).forEach((k) => {
        const val = semNode[k];
        if (val && typeof val === "object" && val.assessments) qSet.add(k);
      });
    });

    return Array.from(qSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [courses, marksByCourse, selectedSemester, childUser?.studentId]);

  useEffect(() => {
    if (availableQuarterKeys.length === 0) {
      setSelectedQuarter(null);
      return;
    }
    if (!selectedQuarter || !availableQuarterKeys.includes(selectedQuarter)) {
      setSelectedQuarter(availableQuarterKeys[0]);
    }
  }, [availableQuarterKeys, selectedQuarter]);

  const stats = useMemo(() => {
    let overallScore = 0;
    let overallMax = 0;
    let assessmentsCount = 0;

    courses.forEach((course) => {
      const quarterMarks = selectedQuarter
        ? marksByCourse?.[course.courseId]?.[selectedSemester]?.[selectedQuarter]
        : null;
      if (!quarterMarks?.assessments) return;

      Object.values(quarterMarks.assessments).forEach((a) => {
        overallScore += a.score || 0;
        overallMax += a.max || 0;
        assessmentsCount += 1;
      });
    });

    const overallPercent = overallMax > 0 ? Math.round((overallScore / overallMax) * 100) : 0;
    const averagePoint = assessmentsCount > 0 ? Math.round(overallScore / assessmentsCount) : 0;

    return { overallScore, overallMax, assessmentsCount, overallPercent, averagePoint };
  }, [courses, marksByCourse, selectedSemester, selectedQuarter]);

  if (loading && !childUser) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </View>
    );
  }

  if (!children.length) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.emptyTitle}>No child is linked yet</Text>
        <Text style={styles.emptySubtitle}>Please contact school admin to link child profile.</Text>
      </View>
    );
  }

  const overallStatusColor = chipColorByPercent(stats.overallPercent);
  const overallStatus =
    stats.overallPercent >= 75
      ? "Great progress"
      : stats.overallPercent >= 50
      ? "On track"
      : "Needs support";

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 20 }}>
        {/* Header summary */}
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <Image
              source={{ uri: childUser?.profileImage || defaultProfile }}
              style={[styles.avatar, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { fontSize: Math.round(20 * fontScale) }]} numberOfLines={1}>
                {childUser?.name || "Student"}
              </Text>
              <Text style={styles.subText}>
                Grade {childUser?.grade ?? "--"} • Section {childUser?.section ?? "--"}
              </Text>

              <View style={{ flexDirection: "row", marginTop: 8, alignItems: "center" }}>
                <View style={[styles.statusDot, { backgroundColor: overallStatusColor }]} />
                <Text style={[styles.statusText, { color: overallStatusColor }]}>{overallStatus}</Text>
              </View>
            </View>

            {children.length > 1 && (
              <TouchableOpacity onPress={() => setShowList((s) => !s)} style={styles.switchBtn}>
                <Ionicons name={showList ? "chevron-up" : "chevron-down"} size={20} color={PRIMARY} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.metricRow}>
            <View style={styles.metricPill}>
              <Text style={styles.metricLabel}>Rank</Text>
              <Text style={styles.metricValue}>{rank ?? "--"}</Text>
            </View>
            <View style={styles.metricPill}>
              <Text style={styles.metricLabel}>Average</Text>
              <Text style={styles.metricValue}>{stats.averagePoint || 0}</Text>
            </View>
            <View style={styles.metricPill}>
              <Text style={styles.metricLabel}>Percent</Text>
              <Text style={[styles.metricValue, { color: overallStatusColor }]}>{stats.overallPercent}%</Text>
            </View>
          </View>
        </View>

        {/* Child list */}
        {showList && children.length > 1 && (
          <View style={[styles.card, { marginTop: 12 }]}>
            <Text style={styles.sectionTitle}>Choose Child</Text>
            <View style={{ marginTop: 8 }}>
              {children.map((c, i) => {
                const active = i === currentIndex;
                return (
                  <TouchableOpacity
                    key={c.studentId}
                    style={[styles.childRow, active && styles.childRowActive]}
                    onPress={() => switchChild(c, i)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.childName, active && { color: PRIMARY }]}>
                      {c.name || `Child ${i + 1}`}
                    </Text>
                    {active && <Ionicons name="checkmark-circle" size={18} color={PRIMARY} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Term selectors */}
        <View style={[styles.card, { marginTop: 12 }]}>
          <Text style={styles.sectionTitle}>Term</Text>
          <View style={styles.pillWrap}>
            {["semester1", "semester2"].map((sem) => {
              const active = selectedSemester === sem;
              return (
                <TouchableOpacity
                  key={sem}
                  style={[styles.pill, active && styles.pillActive]}
                  onPress={() => setSelectedSemester(sem)}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>
                    {sem === "semester1" ? "Semester 1" : "Semester 2"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Quarter</Text>
          <View style={styles.pillWrap}>
            {availableQuarterKeys.length === 0 ? (
              <Text style={styles.subText}>No quarter data for selected semester</Text>
            ) : (
              availableQuarterKeys.map((q) => {
                const active = selectedQuarter === q;
                return (
                  <TouchableOpacity
                    key={q}
                    style={[styles.pill, active && styles.pillActive]}
                    onPress={() => setSelectedQuarter(q)}
                  >
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>{String(q).toUpperCase()}</Text>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </View>

        {/* Courses */}
        {courses.map((course) => {
          const quarterMarks = selectedQuarter
            ? marksByCourse?.[course.courseId]?.[selectedSemester]?.[selectedQuarter]
            : null;

          if (!quarterMarks?.assessments) return null;

          let totalScore = 0;
          let totalMax = 0;
          let totalCount = 0;
          Object.values(quarterMarks.assessments).forEach((a) => {
            totalScore += a.score || 0;
            totalMax += a.max || 0;
            totalCount += 1;
          });

          const percent = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
          const isOpen = !!expanded[course.courseId];
          const pcColor = chipColorByPercent(percent);

          return (
            <View key={course.courseId} style={[styles.card, { marginTop: 12 }]}>
              <TouchableOpacity
                onPress={() =>
                  setExpanded((prev) => ({ ...prev, [course.courseId]: !prev[course.courseId] }))
                }
                activeOpacity={0.85}
              >
                <View style={styles.courseHead}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.courseName}>{course.name}</Text>
                    <Text style={styles.teacher}>Teacher: {course.teacherName}</Text>
                    <Text style={styles.subText}>{totalCount} assessments • {totalScore}/{totalMax}</Text>
                  </View>

                  <View style={[styles.percentChip, { borderColor: pcColor }]}>
                    <Text style={[styles.percentText, { color: pcColor }]}>{percent}%</Text>
                    <Ionicons
                      name={isOpen ? "chevron-up" : "chevron-down"}
                      size={16}
                      color={pcColor}
                      style={{ marginLeft: 6 }}
                    />
                  </View>
                </View>

                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${percent}%`, backgroundColor: pcColor }]} />
                </View>
              </TouchableOpacity>

              {isOpen && (
                <View style={{ marginTop: 10 }}>
                  {Object.entries(quarterMarks.assessments).map(([k, a]) => (
                    <View key={k} style={styles.assessRow}>
                      <Text style={styles.assessName}>{a.name}</Text>
                      <Text style={styles.assessScore}>{a.score}/{a.max}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        {refreshingBg && (
          <View style={{ marginTop: 10, alignItems: "center" }}>
            <Text style={{ fontSize: 12, color: MUTED }}>Refreshing latest marks…</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },

  headerCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
  },
  headerTop: { flexDirection: "row", alignItems: "center" },
  avatar: { marginRight: 12, backgroundColor: "#E5E7EB" },
  name: { color: TEXT, fontWeight: "800" },
  subText: { color: MUTED, fontSize: 13, marginTop: 2 },
  switchBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#EEF4FF",
    alignItems: "center",
    justifyContent: "center",
  },

  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusText: { fontSize: 12, fontWeight: "700" },

  metricRow: { flexDirection: "row", marginTop: 14, gap: 8 },
  metricPill: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  metricLabel: { fontSize: 12, color: MUTED, fontWeight: "600" },
  metricValue: { marginTop: 3, fontSize: 16, color: TEXT, fontWeight: "800" },

  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
  },
  sectionTitle: { fontSize: 14, color: TEXT, fontWeight: "800" },

  pillWrap: { flexDirection: "row", flexWrap: "wrap", marginTop: 8, gap: 8 },
  pill: {
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#EEF2FF",
  },
  pillActive: { backgroundColor: PRIMARY },
  pillText: { fontSize: 12, color: "#1E293B", fontWeight: "700" },
  pillTextActive: { color: "#fff" },

  childRow: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  childRowActive: { backgroundColor: "#EEF4FF", borderColor: "#BFDBFE" },
  childName: { fontSize: 14, color: TEXT, fontWeight: "700" },

  courseHead: { flexDirection: "row", alignItems: "flex-start" },
  courseName: { fontSize: 16, color: TEXT, fontWeight: "800" },
  teacher: { marginTop: 3, fontSize: 13, color: MUTED, fontWeight: "600" },

  percentChip: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
  },
  percentText: { fontSize: 14, fontWeight: "800" },

  progressTrack: {
    marginTop: 10,
    height: 8,
    borderRadius: 99,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 99 },

  assessRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  assessName: { color: TEXT, fontSize: 13 },
  assessScore: { color: TEXT, fontSize: 13, fontWeight: "700" },

  emptyTitle: { fontSize: 18, color: TEXT, fontWeight: "800", textAlign: "center" },
  emptySubtitle: { fontSize: 14, color: MUTED, textAlign: "center", marginTop: 6 },
});