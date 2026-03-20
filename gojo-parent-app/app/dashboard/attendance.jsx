import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  RefreshControl,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ref, get } from "firebase/database";
import { Ionicons } from "@expo/vector-icons";
import moment from "moment";
import { database } from "../../constants/firebaseConfig";

const PRIMARY = "#2563EB";
const PRIMARY_DARK = "#1D4ED8";
const PRIMARY_SOFT = "#EFF6FF";
const BG = "#FFFFFF";
const CARD = "#FFFFFF";
const TEXT = "#0F172A";
const MUTED = "#64748B";
const BORDER = "#E2E8F0";

const PRESENT = "#2563EB";
const LATE = "#F59E0B";
const ABSENT = "#94A3B8";

const defaultProfile = "https://cdn-icons-png.flaticon.com/512/847/847969.png";
const CACHE_KEY = "attendance_cache_v6";

const getPathPrefix = async () => {
  const sk = (await AsyncStorage.getItem("schoolKey")) || null;
  return sk ? `Platform1/Schools/${sk}/` : "";
};

const normalizeKey = (value) => String(value || "").trim().toLowerCase();

const statusColor = (status) => {
  switch (String(status || "").toLowerCase()) {
    case "present":
      return PRESENT;
    case "late":
      return LATE;
    case "absent":
      return ABSENT;
    default:
      return MUTED;
  }
};

const statusIcon = (status) => {
  switch (String(status || "").toLowerCase()) {
    case "present":
      return "checkmark-circle";
    case "late":
      return "time";
    case "absent":
      return "remove-circle";
    default:
      return "ellipse";
  }
};

const percentColor = (p) => {
  if (p >= 75) return PRIMARY_DARK;
  if (p >= 50) return PRIMARY;
  return ABSENT;
};

export default function Attendance() {
  const { width } = useWindowDimensions();
  const scale = width < 360 ? 0.92 : width >= 768 ? 1.08 : 1;
  const fontScale = width < 360 ? 0.92 : width >= 768 ? 1.08 : 1;
  const avatarSize = Math.round(72 * scale);

  const [parentId, setParentId] = useState(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);

  const [children, setChildren] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showChildPicker, setShowChildPicker] = useState(false);

  const [childUser, setChildUser] = useState(null);
  const [courses, setCourses] = useState([]);
  const [attendanceByCourse, setAttendanceByCourse] = useState({});
  const [expandedCourses, setExpandedCourses] = useState({});

  const [tab, setTab] = useState("daily");
  const tabOptions = ["daily", "weekly", "monthly"];
  const tabAnim = useRef(new Animated.Value(0)).current;
  const [tabWidthState, setTabWidthState] = useState(0);

  const [selectedDate, setSelectedDate] = useState(moment().format("YYYY-MM-DD"));

  const shimmerAnim = useRef(new Animated.Value(-140)).current;

  useEffect(() => {
    (async () => {
      const id = await AsyncStorage.getItem("parentId");
      setParentId(id || null);
    })();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 240,
          duration: 1100,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: -140,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmerAnim]);

  useEffect(() => {
    const target = tabOptions.indexOf(tab);
    Animated.spring(tabAnim, {
      toValue: target,
      useNativeDriver: true,
      stiffness: 140,
      damping: 18,
      mass: 0.6,
    }).start();
  }, [tab]);

  const saveCache = async (payload) => {
    try {
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch {}
  };

  const loadCache = async () => {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const fetchChildBundle = useCallback(async ({ prefix, studentId, childInfo }) => {
    try {
      const studentSnap = await get(ref(database, `${prefix}Students/${studentId}`));
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
        name:
          user?.name ||
          student?.name ||
          student?.basicStudentInformation?.name ||
          childInfo?.name ||
          "Student",
        profileImage: user?.profileImage || student?.profileImage || defaultProfile,
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

      const attendanceMap = {};

      await Promise.all(
        courseList.map(async (course) => {
          try {
            const attendanceSnap = await get(ref(database, `${prefix}Attendance/${course.courseId}`));
            const byDate = attendanceSnap.exists() ? attendanceSnap.val() : {};
            const studentOnly = {};

            Object.entries(byDate).forEach(([date, studentsMap]) => {
              const record = studentsMap?.[studentId];
              if (record) studentOnly[date] = record;
            });

            attendanceMap[course.courseId] = studentOnly;
          } catch {
            attendanceMap[course.courseId] = {};
          }
        })
      );

      return {
        childUser: childUserObj,
        courses: courseList,
        attendanceByCourse: attendanceMap,
      };
    } catch (e) {
      console.warn("fetchChildBundle error:", e);
      return null;
    }
  }, []);

  const applyBundleToState = useCallback(
    async (bundle, index, kids) => {
      setCurrentIndex(index);
      setChildUser(bundle?.childUser || null);
      setCourses(bundle?.courses || []);
      setAttendanceByCourse(bundle?.attendanceByCourse || {});

      await saveCache({
        children: kids || [],
        currentIndex: index || 0,
        childUser: bundle?.childUser || null,
        courses: bundle?.courses || [],
        attendanceByCourse: bundle?.attendanceByCourse || {},
        tab,
        selectedDate,
        ts: Date.now(),
      });
    },
    [tab, selectedDate]
  );

  const loadFreshData = useCallback(
    async ({ background = false, forcedIndex = null } = {}) => {
      if (!parentId) {
        setLoading(false);
        return;
      }

      if (background) setBackgroundRefreshing(true);
      else setRefreshing(true);

      try {
        const prefix = await getPathPrefix();

        const parentSnap = await get(ref(database, `${prefix}Parents/${parentId}`));
        const parent = parentSnap.exists() ? parentSnap.val() : null;
        const kids = parent?.children ? Object.values(parent.children) : [];

        setChildren(kids);

        if (!kids.length) {
          setChildUser(null);
          setCourses([]);
          setAttendanceByCourse({});
          setLoading(false);
          return;
        }

        let idx = 0;
        if (typeof forcedIndex === "number" && kids[forcedIndex]) idx = forcedIndex;
        else if (kids[currentIndex]) idx = currentIndex;

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
        console.warn("Attendance load error:", e);
        setLoading(false);
      } finally {
        setRefreshing(false);
        setBackgroundRefreshing(false);
      }
    },
    [parentId, currentIndex, fetchChildBundle, applyBundleToState]
  );

  useEffect(() => {
    if (parentId === null) return;

    let mounted = true;

    (async () => {
      const cached = await loadCache();

      if (cached && mounted) {
        setChildren(cached.children || []);
        setCurrentIndex(cached.currentIndex || 0);
        setChildUser(cached.childUser || null);
        setCourses(cached.courses || []);
        setAttendanceByCourse(cached.attendanceByCourse || {});
        setTab(cached.tab || "daily");
        setSelectedDate(cached.selectedDate || moment().format("YYYY-MM-DD"));
        setLoading(false);
      }

      if (mounted) {
        await loadFreshData({ background: true });
      }
    })();

    return () => {
      mounted = false;
    };
  }, [parentId]);

  const switchChild = async (child, index) => {
    try {
      setLoading(true);
      setExpandedCourses({});
      setShowChildPicker(false);

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
    await loadFreshData({ background: false });
  };

  const goPrevDate = () => {
    setSelectedDate((prev) => moment(prev).subtract(1, "day").format("YYYY-MM-DD"));
  };

  const goNextDate = () => {
    const next = moment(selectedDate).add(1, "day");
    const today = moment();
    if (next.isAfter(today, "day")) return;
    setSelectedDate(next.format("YYYY-MM-DD"));
  };

  const resetToday = () => {
    setSelectedDate(moment().format("YYYY-MM-DD"));
  };

  const filteredAttendance = useMemo(() => {
    if (!childUser?.studentId) return {};

    const now = moment();

    return courses.reduce((acc, course) => {
      const courseAttendance = attendanceByCourse?.[course.courseId] || {};
      const filtered = {};

      if (tab === "daily") {
        if (courseAttendance[selectedDate]) filtered[selectedDate] = courseAttendance[selectedDate];
      } else {
        Object.entries(courseAttendance).forEach(([date, status]) => {
          const m = moment(date, "YYYY-MM-DD");
          if (
            (tab === "weekly" && m.isSame(now, "week")) ||
            (tab === "monthly" && m.isSame(now, "month"))
          ) {
            filtered[date] = status;
          }
        });
      }

      acc[course.courseId] = filtered;
      return acc;
    }, {});
  }, [attendanceByCourse, courses, tab, childUser?.studentId, selectedDate]);

  const attendanceTotalsAll = useMemo(() => {
    const totals = { present: 0, late: 0, absent: 0 };

    Object.values(attendanceByCourse).forEach((courseAttendance) => {
      Object.values(courseAttendance).forEach((status) => {
        const s = String(status || "").toLowerCase();
        if (s === "present") totals.present += 1;
        else if (s === "late") totals.late += 1;
        else if (s === "absent") totals.absent += 1;
      });
    });

    return totals;
  }, [attendanceByCourse]);

  if (loading && !childUser && !children.length) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={PRIMARY} />
        <Text style={styles.loadingText}>Loading attendance...</Text>
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

  const selectedDateMoment = moment(selectedDate, "YYYY-MM-DD");
  const isToday = selectedDateMoment.isSame(moment(), "day");

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[PRIMARY]}
            tintColor={PRIMARY}
          />
        }
        stickyHeaderIndices={[1]}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <Image
              source={{ uri: childUser?.profileImage || defaultProfile }}
              style={[styles.avatar, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]}
            />

            <View style={styles.heroInfo}>
              <Text style={[styles.name, { fontSize: Math.round(20 * fontScale) }]} numberOfLines={1}>
                {childUser?.name || "Student"}
              </Text>
              <Text style={styles.subText}>
                Grade {childUser?.grade ?? "--"} • Section {childUser?.section ?? "--"}
              </Text>

              <View style={styles.statusChip}>
                <Ionicons name="calendar-outline" size={14} color={PRIMARY} />
                <Text style={styles.statusText}>Attendance Overview</Text>
              </View>
            </View>

            {children.length > 1 && (
              <TouchableOpacity onPress={() => setShowChildPicker((s) => !s)} style={styles.switchBtn}>
                <Ionicons name={showChildPicker ? "chevron-up" : "chevron-down"} size={20} color={PRIMARY} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.metricGrid}>
            <MetricCard label="Present" value={attendanceTotalsAll.present} valueColor={PRESENT} />
            <MetricCard label="Late" value={attendanceTotalsAll.late} valueColor={LATE} />
            <MetricCard label="Absent" value={attendanceTotalsAll.absent} valueColor={ABSENT} />
          </View>
        </View>

        <View style={styles.stickyTabsWrap}>
          <View
            style={styles.filterTabs}
            onLayout={(e) => setTabWidthState(e.nativeEvent.layout.width)}
          >
            {tabWidthState > 0 && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.filterIndicator,
                  {
                    width: tabWidthState / tabOptions.length,
                    transform: [
                      {
                        translateX: Animated.multiply(tabAnim, tabWidthState / tabOptions.length),
                      },
                    ],
                  },
                ]}
              />
            )}

            {tabOptions.map((t) => {
              const active = tab === t;
              return (
                <TouchableOpacity
                  key={t}
                  style={styles.filterTab}
                  onPress={() => setTab(t)}
                  activeOpacity={0.86}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {tab === "daily" && (
          <View style={styles.dateCard}>
            <View style={styles.dateTopRow}>
              <Text style={styles.cardTitle}>Choose Date</Text>
              {!isToday && (
                <TouchableOpacity onPress={resetToday} activeOpacity={0.85} style={styles.todayBtn}>
                  <Ionicons name="refresh-outline" size={14} color={PRIMARY} />
                  <Text style={styles.todayBtnText}>Today</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.dateNavRow}>
              <TouchableOpacity style={styles.dateNavBtn} onPress={goPrevDate} activeOpacity={0.86}>
                <Ionicons name="chevron-back" size={18} color={PRIMARY} />
              </TouchableOpacity>

              <View style={styles.dateCenter}>
                <Text style={styles.dateMain}>{selectedDateMoment.format("DD MMMM YYYY")}</Text>
                <Text style={styles.dateSub}>{isToday ? "Showing today" : selectedDateMoment.format("dddd")}</Text>
              </View>

              <TouchableOpacity
                style={[styles.dateNavBtn, isToday && styles.dateNavBtnDisabled]}
                onPress={goNextDate}
                activeOpacity={0.86}
                disabled={isToday}
              >
                <Ionicons name="chevron-forward" size={18} color={isToday ? "#CBD5E1" : PRIMARY} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {showChildPicker && children.length > 1 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Choose Child</Text>
            <View style={styles.childList}>
              {children.map((c, i) => {
                const active = i === currentIndex;
                return (
                  <TouchableOpacity
                    key={c.studentId}
                    style={[styles.childRow, active && styles.childRowActive]}
                    onPress={() => switchChild(c, i)}
                    activeOpacity={0.86}
                  >
                    <Text style={[styles.childName, active && styles.childNameActive]}>
                      {c.name || `Child ${i + 1}`}
                    </Text>
                    {active && <Ionicons name="checkmark-circle" size={18} color={PRIMARY} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        <View style={{ marginTop: 12 }}>
          {courses.map((course) => {
            const courseAttendance = filteredAttendance[course.courseId] || {};
            const entries = Object.entries(courseAttendance).sort(
              (a, b) => moment(b[0]).valueOf() - moment(a[0]).valueOf()
            );

            let attendancePercent = 0;
            if (tab !== "daily") {
              const total = entries.length;
              const attended = entries.filter(([, s]) => {
                const st = String(s || "").toLowerCase();
                return st === "present" || st === "late";
              }).length;
              attendancePercent = total > 0 ? Math.round((attended / total) * 100) : 0;
            }

            const isExpanded = !!expandedCourses[course.courseId];

            return (
              <View key={course.courseId} style={styles.courseCard}>
                <TouchableOpacity
                  onPress={() =>
                    setExpandedCourses((prev) => ({ ...prev, [course.courseId]: !prev[course.courseId] }))
                  }
                  activeOpacity={0.86}
                >
                  <View style={styles.courseHead}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={styles.courseName}>{course.name}</Text>
                      <Text style={styles.teacher}>Teacher: {course.teacherName}</Text>
                      <Text style={styles.courseMeta}>
                        {tab === "daily"
                          ? "Attendance for selected date"
                          : `${entries.length} record${entries.length === 1 ? "" : "s"} in this period`}
                      </Text>
                    </View>

                    <View style={styles.percentChip}>
                      <Text style={[styles.percentText, { color: tab === "daily" ? PRIMARY : percentColor(attendancePercent) }]}>
                        {tab === "daily" ? "View" : `${attendancePercent}%`}
                      </Text>
                      <Ionicons
                        name={isExpanded ? "chevron-up" : "chevron-down"}
                        size={16}
                        color={PRIMARY}
                        style={{ marginLeft: 6 }}
                      />
                    </View>
                  </View>

                  {tab !== "daily" && (
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${attendancePercent}%`,
                            backgroundColor: percentColor(attendancePercent),
                          },
                        ]}
                      />
                    </View>
                  )}
                </TouchableOpacity>

                {(tab === "daily" || isExpanded) && (
                  <View style={styles.entriesWrap}>
                    {entries.length === 0 ? (
                      <Text style={styles.noRecords}>No attendance recorded</Text>
                    ) : (
                      entries.map(([date, status]) => {
                        const sc = statusColor(status);
                        const icon = statusIcon(status);
                        return (
                          <View key={date} style={styles.attRow}>
                            <View style={[styles.statusDotMini, { backgroundColor: sc }]} />
                            <Text style={styles.attDate}>{moment(date).format("DD MMM, ddd")}</Text>
                            <View style={styles.statusWrap}>
                              <Ionicons name={icon} size={16} color={sc} style={{ marginRight: 6 }} />
                              <Text style={[styles.attStatus, { color: sc }]}>
                                {String(status || "").toUpperCase()}
                              </Text>
                            </View>
                          </View>
                        );
                      })
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {!courses.length && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Attendance</Text>
            <Text style={styles.emptyQuarterText}>No courses found for this student yet.</Text>
          </View>
        )}

        {backgroundRefreshing && !refreshing && (
          <View style={styles.refreshingBgWrap}>
            <Text style={styles.refreshingBgText}>Refreshing latest attendance…</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function MetricCard({ label, value, valueColor = TEXT }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  content: { padding: 14, paddingBottom: 24 },

  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: BG,
  },
  loadingText: {
    marginTop: 10,
    color: MUTED,
    fontSize: 14,
    fontWeight: "600",
  },

  heroCard: {
    backgroundColor: CARD,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    shadowColor: "rgba(15,23,42,0.06)",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    marginRight: 12,
    backgroundColor: "#E5E7EB",
  },
  heroInfo: {
    flex: 1,
  },
  name: {
    color: TEXT,
    fontWeight: "800",
    fontSize: 21,
  },
  subText: {
    color: MUTED,
    fontSize: 13,
    marginTop: 3,
    fontWeight: "500",
  },
  statusChip: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: PRIMARY_SOFT,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "800",
    color: PRIMARY,
    marginLeft: 6,
  },
  switchBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: PRIMARY_SOFT,
    alignItems: "center",
    justifyContent: "center",
  },

  metricGrid: {
    flexDirection: "row",
    marginTop: 16,
    gap: 8,
  },
  metricCard: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  metricLabel: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
  },
  metricValue: {
    marginTop: 4,
    fontSize: 17,
    fontWeight: "900",
  },

  stickyTabsWrap: {
    backgroundColor: BG,
    paddingTop: 10,
    paddingBottom: 6,
    zIndex: 5,
  },
  filterTabs: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8EEF9",
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
  },
  filterTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  filterText: {
    fontWeight: "700",
    fontSize: 13,
    color: "#475569",
    letterSpacing: 0.2,
  },
  filterTextActive: {
    color: TEXT,
  },
  filterIndicator: {
    position: "absolute",
    top: 4,
    bottom: 4,
    left: 0,
    backgroundColor: PRIMARY_SOFT,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },

  dateCard: {
    marginTop: 12,
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
  },
  dateTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  todayBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: PRIMARY_SOFT,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  todayBtnText: {
    color: PRIMARY,
    fontSize: 12,
    fontWeight: "800",
    marginLeft: 5,
  },
  dateNavRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  dateNavBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: PRIMARY_SOFT,
    alignItems: "center",
    justifyContent: "center",
  },
  dateNavBtnDisabled: {
    backgroundColor: "#F1F5F9",
  },
  dateCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dateMain: {
    color: TEXT,
    fontSize: 15,
    fontWeight: "900",
  },
  dateSub: {
    color: MUTED,
    fontSize: 12,
    marginTop: 2,
    fontWeight: "600",
  },

  card: {
    marginTop: 12,
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    shadowColor: "rgba(15,23,42,0.04)",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  cardTitle: {
    color: TEXT,
    fontSize: 15,
    fontWeight: "800",
  },

  childList: {
    marginTop: 8,
  },
  childRow: {
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  childRowActive: {
    backgroundColor: PRIMARY_SOFT,
    borderColor: "#BFDBFE",
  },
  childName: {
    fontSize: 14,
    color: TEXT,
    fontWeight: "700",
  },
  childNameActive: {
    color: PRIMARY,
  },

  courseCard: {
    marginBottom: 12,
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    shadowColor: "rgba(15,23,42,0.04)",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  courseHead: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  courseName: {
    fontSize: 16,
    color: TEXT,
    fontWeight: "900",
    textTransform: "capitalize",
  },
  teacher: {
    marginTop: 4,
    fontSize: 13,
    color: MUTED,
    fontWeight: "600",
  },
  courseMeta: {
    marginTop: 3,
    fontSize: 12.5,
    color: MUTED,
    fontWeight: "500",
  },

  percentChip: {
    backgroundColor: PRIMARY_SOFT,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
  },
  percentText: {
    fontSize: 14,
    fontWeight: "900",
  },

  progressTrack: {
    marginTop: 12,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },

  entriesWrap: {
    marginTop: 10,
  },
  noRecords: {
    fontSize: 13,
    color: MUTED,
    paddingVertical: 4,
  },

  attRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    flexDirection: "row",
    alignItems: "center",
  },
  statusDotMini: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    marginRight: 8,
  },
  attDate: {
    flex: 1,
    fontSize: 13,
    color: TEXT,
    fontWeight: "500",
  },
  statusWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  attStatus: {
    fontSize: 12,
    fontWeight: "800",
  },

  emptyTitle: {
    fontSize: 19,
    color: TEXT,
    fontWeight: "900",
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    color: MUTED,
    textAlign: "center",
    marginTop: 6,
  },
  emptyQuarterText: {
    color: MUTED,
    fontSize: 13,
    marginTop: 8,
    fontWeight: "500",
  },

  refreshingBgWrap: {
    marginTop: 12,
    alignItems: "center",
  },
  refreshingBgText: {
    fontSize: 12,
    color: MUTED,
    fontWeight: "600",
  },
});