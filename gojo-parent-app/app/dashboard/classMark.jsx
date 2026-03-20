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
  RefreshControl,
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
const CACHE_KEY = "classMark_cache_v5";

const getPathPrefix = async () => {
  const sk = (await AsyncStorage.getItem("schoolKey")) || null;
  return sk ? `Platform1/Schools/${sk}/` : "";
};

const chipColorByPercent = (p) => {
  if (p >= 75) return SUCCESS;
  if (p >= 50) return PRIMARY;
  return WARNING;
};

const normalizeKey = (value) => String(value || "").trim().toLowerCase();

const prettifyQuarterLabel = (q) => {
  const raw = String(q || "").toLowerCase().trim();
  const match = raw.match(/\d+/);
  if (match) return `Quarter ${match[0]}`;
  return String(q || "");
};

export default function ClassMark() {
  const { width } = useWindowDimensions();

  const [parentId, setParentId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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

    const studentUserId = student.userId || student.systemAccountInformation?.userId || null;
    const studentUserSnap = studentUserId
      ? await get(ref(database, `${prefix}Users/${studentUserId}`))
      : null;
    const user = studentUserSnap?.exists() ? studentUserSnap.val() : {};

    const grade = String(student.grade || student.basicStudentInformation?.grade || "");
    const section = String(student.section || student.basicStudentInformation?.section || "");

    const childUserObj = {
      ...user,
      studentId,
      grade: grade || "--",
      section: section || "--",
      _childInfo: childInfo,
    };

    const [gradeNodeSnap, usersSnap] = await Promise.all([
      get(ref(database, `${prefix}GradeManagement/grades/${grade}`)),
      get(ref(database, `${prefix}Users`)),
    ]);

    const usersData = usersSnap.exists() ? usersSnap.val() : {};
    const gradeNode = gradeNodeSnap.exists() ? gradeNodeSnap.val() : {};

    const sectionNode = gradeNode?.sections?.[section] || {};
    const sectionCoursesMap = sectionNode?.courses || {};
    const sectionTeacherMap = gradeNode?.sectionSubjectTeachers?.[section] || {};
    const gradeSubjectsMap = gradeNode?.subjects || {};

    const courseIdSet = new Set();

    Object.keys(sectionCoursesMap || {}).forEach((cid) => {
      if (sectionCoursesMap[cid]) courseIdSet.add(cid);
    });

    Object.values(sectionTeacherMap || {}).forEach((assignment) => {
      if (assignment?.courseId) courseIdSet.add(assignment.courseId);
    });

    const teacherEntries = Object.entries(sectionTeacherMap || {});
    const teacherMapByCourseId = {};
    const teacherMapBySubjectKey = {};

    teacherEntries.forEach(([subjectKey, assignment]) => {
      if (assignment?.courseId) {
        teacherMapByCourseId[assignment.courseId] = {
          subjectKey,
          ...assignment,
        };
      }

      teacherMapBySubjectKey[normalizeKey(subjectKey)] = {
        subjectKey,
        ...assignment,
      };

      if (assignment?.subject) {
        teacherMapBySubjectKey[normalizeKey(assignment.subject)] = {
          subjectKey,
          ...assignment,
        };
      }
    });

    const courseIds = Array.from(courseIdSet);

    const courseList = courseIds.map((courseId) => {
      const directAssignment = teacherMapByCourseId[courseId] || null;

      let inferredSubjectKey = null;
      if (!directAssignment) {
        const parts = String(courseId).split("_");
        if (parts.length >= 2) {
          inferredSubjectKey = normalizeKey(parts[1]);
        }
      }

      const inferredAssignment =
        (!directAssignment && inferredSubjectKey && teacherMapBySubjectKey[inferredSubjectKey]) || null;

      const assignment = directAssignment || inferredAssignment || null;

      const subjectKey = assignment?.subjectKey
        ? normalizeKey(assignment.subjectKey)
        : assignment?.subject
        ? normalizeKey(assignment.subject)
        : inferredSubjectKey;

      const subjectNode = subjectKey ? gradeSubjectsMap?.[subjectKey] || null : null;
      const teacherUser = assignment?.teacherUserId
        ? usersData?.[assignment.teacherUserId] || null
        : null;

      const fallbackNameFromCourseId = String(courseId)
        .replace(/^course_/, "")
        .replace(/_[^_]+$/, "")
        .replace(/_/g, " ");

      const courseDisplayName =
        subjectNode?.name ||
        assignment?.subject ||
        fallbackNameFromCourseId ||
        "Course";

      return {
        courseId,
        name: courseDisplayName,
        subject: subjectNode?.name || assignment?.subject || courseDisplayName,
        grade,
        section,
        teacherId: assignment?.teacherId || null,
        teacherUserId: assignment?.teacherUserId || null,
        teacherName: assignment?.teacherName || teacherUser?.name || "Teacher",
      };
    });

    const markSnaps = await Promise.all(
      courseList.map(async (course) => {
        const s = await get(ref(database, `${prefix}ClassMarks/${course.courseId}/${studentId}`));
        return [course.courseId, s.exists() ? s.val() : {}];
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

  const applyBundleToState = async (bundle, index, kids) => {
    setCurrentIndex(index);
    setChildUser(bundle.childUser);
    setRank(bundle.rank);
    setCourses(bundle.courses);
    setMarksByCourse(bundle.marksByCourse);

    await saveCache({
      children: kids,
      currentIndex: index,
      childUser: bundle.childUser,
      rank: bundle.rank,
      courses: bundle.courses,
      marksByCourse: bundle.marksByCourse,
      selectedSemester,
      selectedQuarter,
      ts: Date.now(),
    });
  };

  const loadFreshData = async ({
    background = false,
    keepCurrent = true,
    forcedIndex = null,
  } = {}) => {
    if (!parentId) return;

    if (background) setRefreshingBg(true);
    else setRefreshing(true);

    try {
      const prefix = await getPathPrefix();

      const parentSnap = await get(ref(database, `${prefix}Parents/${parentId}`));
      const parent = parentSnap.exists() ? parentSnap.val() : null;
      const kids = parent?.children ? Object.values(parent.children) : [];

      setChildren(kids);

      if (!kids.length) {
        setChildUser(null);
        setRank(null);
        setCourses([]);
        setMarksByCourse({});
        setLoading(false);
        return;
      }

      let idx = 0;
      if (typeof forcedIndex === "number" && kids[forcedIndex]) idx = forcedIndex;
      else if (keepCurrent && kids[currentIndex]) idx = currentIndex;

      const chosen = kids[idx];

      const bundle = await fetchChildBundle({
        prefix,
        studentId: chosen.studentId,
        childInfo: chosen,
      });

      if (!bundle) {
        setLoading(false);
        return;
      }

      await applyBundleToState(bundle, idx, kids);
      setLoading(false);
    } catch (e) {
      console.warn("ClassMark load error:", e);
      setLoading(false);
    } finally {
      setRefreshing(false);
      setRefreshingBg(false);
    }
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

      if (mounted) {
        await loadFreshData({ background: true, keepCurrent: true });
      }
    })();

    return () => {
      mounted = false;
    };
    // intentionally only parentId
    // to avoid refresh loop
  }, [parentId]);

  const switchChild = async (child, index) => {
    try {
      setLoading(true);
      setExpanded({});
      setShowList(false);

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

      await applyBundleToState(bundle, index, children);
    } catch (e) {
      console.warn("switchChild error:", e);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    await loadFreshData({ background: false, keepCurrent: true });
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

    return Array.from(qSet).sort((a, b) => {
      const aNum = Number(String(a).match(/\d+/)?.[0] || 0);
      const bNum = Number(String(b).match(/\d+/)?.[0] || 0);
      return aNum - bNum;
    });
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
        overallScore += Number(a.score || 0);
        overallMax += Number(a.max || 0);
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
      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[PRIMARY]}
            tintColor={PRIMARY}
          />
        }
      >
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

        <View style={[styles.card, { marginTop: 12 }]}>
          <Text style={styles.sectionTitle}>Academic Term</Text>

          <View style={styles.segmentWrap}>
            <TouchableOpacity
              style={[styles.segmentBtn, selectedSemester === "semester1" && styles.segmentBtnActive]}
              onPress={() => setSelectedSemester("semester1")}
              activeOpacity={0.88}
            >
              <Text
                style={[
                  styles.segmentText,
                  selectedSemester === "semester1" && styles.segmentTextActive,
                ]}
              >
                Semester 1
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.segmentBtn, selectedSemester === "semester2" && styles.segmentBtnActive]}
              onPress={() => setSelectedSemester("semester2")}
              activeOpacity={0.88}
            >
              <Text
                style={[
                  styles.segmentText,
                  selectedSemester === "semester2" && styles.segmentTextActive,
                ]}
              >
                Semester 2
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 16, marginBottom: 2 }]}>Quarter</Text>

          {availableQuarterKeys.length === 0 ? (
            <View style={styles.emptyQuarterWrap}>
              <Ionicons name="calendar-outline" size={18} color={MUTED} />
              <Text style={styles.subText}>No quarter data for selected semester</Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quarterRow}
            >
              {availableQuarterKeys.map((q) => {
                const active = selectedQuarter === q;
                return (
                  <TouchableOpacity
                    key={q}
                    style={[styles.quarterCard, active && styles.quarterCardActive]}
                    onPress={() => setSelectedQuarter(q)}
                    activeOpacity={0.88}
                  >
                    <Text style={[styles.quarterTitle, active && styles.quarterTitleActive]}>
                      {prettifyQuarterLabel(q)}
                    </Text>
                    <Text style={[styles.quarterSub, active && styles.quarterSubActive]}>
                      View marks
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

        {courses.map((course) => {
          const quarterMarks = selectedQuarter
            ? marksByCourse?.[course.courseId]?.[selectedSemester]?.[selectedQuarter]
            : null;

          if (!quarterMarks?.assessments) return null;

          let totalScore = 0;
          let totalMax = 0;
          let totalCount = 0;

          Object.values(quarterMarks.assessments).forEach((a) => {
            totalScore += Number(a.score || 0);
            totalMax += Number(a.max || 0);
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
                    <Text style={styles.subText}>
                      {totalCount} assessments • {totalScore}/{totalMax}
                    </Text>
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

        {!courses.length && (
          <View style={[styles.card, { marginTop: 12 }]}>
            <Text style={styles.sectionTitle}>Marks</Text>
            <Text style={styles.subText}>No courses or marks found for this child yet.</Text>
          </View>
        )}

        {refreshingBg && !refreshing && (
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

  segmentWrap: {
    marginTop: 10,
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    padding: 4,
    flexDirection: "row",
    borderWidth: 1,
    borderColor: BORDER,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentBtnActive: {
    backgroundColor: PRIMARY,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#334155",
  },
  segmentTextActive: {
    color: "#fff",
  },

  emptyQuarterWrap: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F8FAFC",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },

  quarterRow: {
    marginTop: 10,
    paddingRight: 4,
    gap: 10,
  },
  quarterCard: {
    minWidth: 124,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  quarterCardActive: {
    backgroundColor: "#EEF6FF",
    borderColor: "#BFDBFE",
  },
  quarterTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: TEXT,
  },
  quarterTitleActive: {
    color: PRIMARY,
  },
  quarterSub: {
    fontSize: 11,
    color: MUTED,
    marginTop: 3,
    fontWeight: "600",
  },
  quarterSubActive: {
    color: PRIMARY,
  },

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
  courseName: { fontSize: 16, color: TEXT, fontWeight: "800", textTransform: "capitalize" },
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
  assessName: { color: TEXT, fontSize: 13, flex: 1, paddingRight: 10 },
  assessScore: { color: TEXT, fontSize: 13, fontWeight: "700" },

  emptyTitle: { fontSize: 18, color: TEXT, fontWeight: "800", textAlign: "center" },
  emptySubtitle: { fontSize: 14, color: MUTED, textAlign: "center", marginTop: 6 },
});