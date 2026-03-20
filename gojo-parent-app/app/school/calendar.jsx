import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  FlatList,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ref, get } from "firebase/database";
import { database } from "../../constants/firebaseConfig";
import { Ionicons } from "@expo/vector-icons";

const PRIMARY = "#1E90FF";
const TEXT = "#0F172A";
const MUTED = "#64748B";
const BORDER = "#E2E8F0";

const CAT_COLORS = {
  academic: "#2563EB",
  event: "#0EA5E9",
  exam: "#DC2626",
  general: "#64748B",
};

const DAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_AM = ["እሁድ", "ሰኞ", "ማክ", "ረቡዕ", "ሐሙስ", "አርብ", "ቅዳሜ"];

function toYMD(d) {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthLabel(date, amharic) {
  return date.toLocaleDateString(amharic ? "am-ET" : undefined, {
    month: "long",
    year: "numeric",
  });
}

function buildMonthGrid(baseDate) {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

function normalizeCategory(e) {
  const raw = String(e?.category || e?.type || "general").toLowerCase();
  if (raw.includes("exam")) return "exam";
  if (raw.includes("academic")) return "academic";
  if (raw.includes("event")) return "event";
  return "general";
}

function formatEthDate(ethiopianDate) {
  if (!ethiopianDate) return "N/A";
  const d = ethiopianDate?.day ?? "--";
  const m = ethiopianDate?.month ?? "--";
  const y = ethiopianDate?.year ?? "--";
  return `${d}/${m}/${y}`;
}

function getLabelMap(am) {
  return {
    title: am ? "የትምህርት ቤት የዘመን ሰሌዳ" : "School Calendar",
    sub: am ? "ቀን በመጫን የዝግጅት ዝርዝር ይመልከቱ" : "Tap a date to see full event details and description",
    today: am ? "ዛሬ" : "Today",
    selectedDayTitle: am ? "የቀኑ ዝርዝር" : "Event Details",
    todayEvents: am ? "የዛሬ ዝግጅቶች" : "Today's Event Details",
    noEventsDay: am ? "በዚህ ቀን ዝግጅት የለም።" : "No events for this date.",
    upcoming: am ? "የሚመጡ ዝግጅቶች" : "Upcoming Events",
    noUpcoming: am ? "የሚመጡ ዝግጅቶች የሉም።" : "No upcoming events.",
    gregorian: am ? "ግሪጎሪያን" : "Gregorian",
    ethiopian: am ? "ኢትዮጵያዊ" : "Ethiopian",
    description: am ? "ማብራሪያ" : "Description",
    noDescription: am ? "ማብራሪያ አልተገለጸም።" : "No description provided.",
    lang: am ? "AM" : "EN",
    category: {
      academic: am ? "አካዳሚክ" : "Academic",
      event: am ? "ክስተት" : "Event",
      exam: am ? "ፈተና" : "Exam",
      general: am ? "አጠቃላይ" : "General",
    },
  };
}

export default function CalendarTab() {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);

  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => toYMD(new Date()));
  const [todayOnly, setTodayOnly] = useState(false);
  const [amharic, setAmharic] = useState(false);

  const labels = getLabelMap(amharic);
  const scrollRef = useRef(null);
  const detailsYRef = useRef(0);

  const getPathPrefix = async () => {
    const sk = (await AsyncStorage.getItem("schoolKey")) || null;
    return sk ? `Platform1/Schools/${sk}/` : "";
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const prefix = await getPathPrefix();
        const snap = await get(ref(database, `${prefix}CalendarEvents`));
        if (!mounted) return;

        if (!snap.exists()) {
          setEvents([]);
        } else {
          const arr = [];
          snap.forEach((child) => {
            const val = child.val() || {};
            arr.push({
              id: child.key,
              ...val,
              _category: normalizeCategory(val),
            });
          });
          arr.sort((a, b) => new Date(a.gregorianDate || 0) - new Date(b.gregorianDate || 0));
          setEvents(arr);
        }
      } catch (e) {
        console.warn("Calendar events load error:", e);
        setEvents([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const eventsByDate = useMemo(() => {
    const map = {};
    events.forEach((e) => {
      const key = e.gregorianDate;
      if (!key) return;
      if (!map[key]) map[key] = [];
      map[key].push(e);
    });
    return map;
  }, [events]);

  const monthCells = useMemo(() => buildMonthGrid(currentMonth), [currentMonth]);

  const realSelectedDate = todayOnly ? toYMD(new Date()) : selectedDate;
  const selectedEvents = useMemo(
    () => eventsByDate[realSelectedDate] || [],
    [eventsByDate, realSelectedDate]
  );

  const upcoming = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const list = events.filter((e) => {
      const d = new Date(e.gregorianDate || 0);
      d.setHours(0, 0, 0, 0);
      return d >= today;
    });
    return todayOnly ? list.filter((e) => e.gregorianDate === toYMD(new Date())) : list;
  }, [events, todayOnly]);

  const prevMonth = () =>
    setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () =>
    setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const dayDotColor = (dateKey) => {
    const dayEvents = eventsByDate[dateKey] || [];
    if (!dayEvents.length) return null;

    const hasExam = dayEvents.some((e) => e._category === "exam");
    if (hasExam) return CAT_COLORS.exam;
    const hasAcademic = dayEvents.some((e) => e._category === "academic");
    if (hasAcademic) return CAT_COLORS.academic;
    const hasEvent = dayEvents.some((e) => e._category === "event");
    if (hasEvent) return CAT_COLORS.event;
    return CAT_COLORS.general;
  };

  const scrollToDetails = () => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          y: Math.max(0, detailsYRef.current - 12),
          animated: true,
        });
      }, 40);
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </View>
    );
  }

  return (
    <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
      <View style={styles.card}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{labels.title}</Text>
            <Text style={styles.cardSub}>{labels.sub}</Text>
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              onPress={() => setAmharic((v) => !v)}
              style={[styles.langBtn, amharic && styles.langBtnActive]}
              activeOpacity={0.85}
            >
              <Text style={[styles.langBtnText, amharic && styles.langBtnTextActive]}>
                {labels.lang}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setTodayOnly((s) => !s);
                if (!todayOnly) setSelectedDate(toYMD(new Date()));
                scrollToDetails();
              }}
              style={[styles.todayBtn, todayOnly && styles.todayBtnActive]}
              activeOpacity={0.85}
            >
              <Ionicons
                name="today-outline"
                size={14}
                color={todayOnly ? "#fff" : PRIMARY}
                style={{ marginRight: 5 }}
              />
              <Text style={[styles.todayBtnText, todayOnly && styles.todayBtnTextActive]}>
                {labels.today}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.calHeader}>
        <TouchableOpacity onPress={prevMonth} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={18} color={PRIMARY} />
        </TouchableOpacity>
        <Text style={styles.monthTitle}>{monthLabel(currentMonth, amharic)}</Text>
        <TouchableOpacity onPress={nextMonth} style={styles.navBtn}>
          <Ionicons name="chevron-forward" size={18} color={PRIMARY} />
        </TouchableOpacity>
      </View>

      <View style={styles.legendWrap}>
        {["academic", "event", "exam"].map((key) => (
          <View key={key} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: CAT_COLORS[key] }]} />
            <Text style={styles.legendText}>{labels.category[key]}</Text>
          </View>
        ))}
      </View>

      <View style={styles.weekRow}>
        {(amharic ? DAYS_AM : DAYS_EN).map((d) => (
          <Text key={d} style={styles.weekText}>
            {d}
          </Text>
        ))}
      </View>

      <View style={styles.gridWrap}>
        {monthCells.map((cell, idx) => {
          if (!cell) return <View key={`empty-${idx}`} style={styles.dayCell} />;

          const key = toYMD(cell);
          const isSelected = key === realSelectedDate;
          const isToday = key === toYMD(new Date());
          const dotColor = dayDotColor(key);

          return (
            <TouchableOpacity
              key={key}
              style={[styles.dayCell, isSelected && styles.daySelected]}
              onPress={() => {
                setTodayOnly(false);
                setSelectedDate(key);
                scrollToDetails(); // ✅ auto-scroll to details when day clicked
              }}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.dayText,
                  isSelected && styles.dayTextSelected,
                  isToday && !isSelected && styles.dayTodayText,
                ]}
              >
                {cell.getDate()}
              </Text>
              {dotColor ? (
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: isSelected ? "#fff" : dotColor },
                  ]}
                />
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* anchor marker for scroll target */}
      <View
        onLayout={(e) => {
          detailsYRef.current = e.nativeEvent.layout.y;
        }}
      />

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          {todayOnly ? labels.todayEvents : `${labels.selectedDayTitle} • ${realSelectedDate}`}
        </Text>

        {selectedEvents.length === 0 ? (
          <Text style={styles.emptyText}>{labels.noEventsDay}</Text>
        ) : (
          selectedEvents.map((item) => {
            const cat = item._category || "general";
            const c = CAT_COLORS[cat] || CAT_COLORS.general;

            return (
              <View key={item.id} style={styles.eventCard}>
                <View style={styles.eventTop}>
                  <Text style={styles.eventTitle}>{item.title || "Event"}</Text>
                  <View style={[styles.catBadge, { backgroundColor: `${c}20`, borderColor: `${c}55` }]}>
                    <Text style={[styles.catBadgeText, { color: c }]}>
                      {(labels.category[cat] || cat).toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.dateRow}>
                  <Text style={styles.dateLabel}>{labels.gregorian}:</Text>
                  <Text style={styles.dateValue}>
                    {item.gregorianDate
                      ? new Date(item.gregorianDate).toLocaleDateString(amharic ? "am-ET" : undefined)
                      : "N/A"}
                  </Text>
                </View>

                <View style={styles.dateRow}>
                  <Text style={styles.dateLabel}>{labels.ethiopian}:</Text>
                  <Text style={styles.dateValue}>{formatEthDate(item.ethiopianDate)}</Text>
                </View>

                <Text style={styles.descTitle}>{labels.description}</Text>
                <Text style={styles.eventNote}>
                  {item.notes?.trim() ? item.notes : labels.noDescription}
                </Text>
              </View>
            );
          })
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{todayOnly ? labels.today : labels.upcoming}</Text>
        {upcoming.length === 0 ? (
          <Text style={styles.emptyText}>{labels.noUpcoming}</Text>
        ) : (
          <FlatList
            data={upcoming.slice(0, 8)}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => {
              const cat = item._category || "general";
              const c = CAT_COLORS[cat] || CAT_COLORS.general;
              const dateLabel = item.gregorianDate
                ? new Date(item.gregorianDate).toLocaleDateString(amharic ? "am-ET" : undefined)
                : "No date";

              return (
                <View style={styles.upcomingRow}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.upcomingDate}>{dateLabel}</Text>
                    <Text style={styles.upcomingTitle}>{item.title || "Event"}</Text>
                    <Text style={styles.upcomingEth}>
                      {labels.ethiopian}: {formatEthDate(item.ethiopianDate)}
                    </Text>
                  </View>
                  <Text style={[styles.upcomingType, { color: c }]}>
                    {labels.category[cat] || cat}
                  </Text>
                </View>
              );
            }}
          />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 40 },
  card: { backgroundColor: "#fff", borderWidth: 1, borderColor: BORDER, borderRadius: 14, padding: 14, marginBottom: 12 },
  titleRow: { flexDirection: "row", alignItems: "center" },
  cardTitle: { fontSize: 16, fontWeight: "800", color: TEXT },
  cardSub: { fontSize: 13, color: MUTED, marginTop: 4 },

  langBtn: { borderWidth: 1, borderColor: "#BFDBFE", backgroundColor: "#F8FBFF", borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" },
  langBtnActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  langBtnText: { color: PRIMARY, fontWeight: "700", fontSize: 12 },
  langBtnTextActive: { color: "#fff" },

  todayBtn: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#BFDBFE", backgroundColor: "#F8FBFF", borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10 },
  todayBtnActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  todayBtnText: { color: PRIMARY, fontWeight: "700", fontSize: 12 },
  todayBtnTextActive: { color: "#fff" },

  calHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, paddingHorizontal: 4 },
  navBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#EEF4FF", alignItems: "center", justifyContent: "center" },
  monthTitle: { fontSize: 16, fontWeight: "800", color: TEXT },

  legendWrap: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8, gap: 10, paddingHorizontal: 2 },
  legendItem: { flexDirection: "row", alignItems: "center" },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  legendText: { fontSize: 12, color: MUTED, fontWeight: "600" },

  weekRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6, paddingHorizontal: 2 },
  weekText: { width: `${100 / 7}%`, textAlign: "center", fontSize: 12, color: MUTED, fontWeight: "700" },

  gridWrap: { backgroundColor: "#fff", borderWidth: 1, borderColor: BORDER, borderRadius: 14, padding: 8, flexDirection: "row", flexWrap: "wrap", marginBottom: 12 },
  dayCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 10, marginBottom: 2 },
  daySelected: { backgroundColor: PRIMARY },
  dayText: { color: TEXT, fontWeight: "700", fontSize: 13 },
  dayTextSelected: { color: "#fff" },
  dayTodayText: { color: PRIMARY, textDecorationLine: "underline" },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 4 },

  sectionTitle: { fontSize: 14, fontWeight: "800", color: TEXT, marginBottom: 8 },
  emptyText: { color: MUTED, fontSize: 13 },

  eventCard: { borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 10, marginBottom: 8, backgroundColor: "#FAFCFF" },
  eventTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eventTitle: { fontSize: 14, fontWeight: "700", color: TEXT, flex: 1, paddingRight: 8 },

  catBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  catBadgeText: { fontSize: 10, fontWeight: "800" },

  dateRow: { flexDirection: "row", marginTop: 6 },
  dateLabel: { width: 90, fontSize: 12, color: MUTED, fontWeight: "700" },
  dateValue: { fontSize: 12, color: TEXT, fontWeight: "600", flex: 1 },

  descTitle: { marginTop: 8, fontSize: 12, color: MUTED, fontWeight: "700" },
  eventNote: { fontSize: 13, color: TEXT, marginTop: 3, lineHeight: 18 },

  upcomingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#F1F5F9", paddingVertical: 8 },
  upcomingDate: { fontSize: 12, color: MUTED },
  upcomingTitle: { fontSize: 13, fontWeight: "700", color: TEXT, marginTop: 2 },
  upcomingEth: { fontSize: 11, color: "#475569", marginTop: 2 },
  upcomingType: { fontSize: 11, fontWeight: "700" },
  upcomingTypeAcademic: { color: CAT_COLORS.academic },
  upcomingTypeEvent: { color: CAT_COLORS.event },
  upcomingTypeExam: { color: CAT_COLORS.exam },
});