import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ref, get } from "firebase/database";
import { database } from "../../constants/firebaseConfig";

const PRIMARY = "#2296F3";
const PRIMARY_DARK = "#0B72C7";
const PRIMARY_SOFT = "#EAF5FF";
const SUCCESS = "#16A34A";
const SUCCESS_SOFT = "#ECFDF3";
const WARNING = "#F59E0B";
const WARNING_SOFT = "#FFF7ED";
const TEXT = "#0F172A";
const MUTED = "#64748B";
const BORDER = "#E5EDF5";
const BG = "#FFFFFF";
const CARD = "#FFFFFF";

function monthLabel(monthKey) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(String(monthKey))) return String(monthKey || "");
  const [year, month] = String(monthKey).split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function getMonthShort(monthKey) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(String(monthKey))) return "--";
  const [year, month] = String(monthKey).split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString(undefined, { month: "short" });
}

function sortMonthKeysDesc(keys) {
  return [...keys].sort((a, b) => {
    const [ay, am] = String(a).split("-").map(Number);
    const [by, bm] = String(b).split("-").map(Number);
    return by - ay || bm - am;
  });
}

export default function HistoryTab() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [schoolKey, setSchoolKey] = useState(null);
  const [parentId, setParentId] = useState(null);

  const [children, setChildren] = useState([]);
  const [paymentRows, setPaymentRows] = useState([]);

  const schoolAwarePath = useCallback((subPath, sk) => {
    return sk ? `Platform1/Schools/${sk}/${subPath}` : subPath;
  }, []);

  const loadData = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (!silent) setLoading(true);

        const [pid, sk] = await Promise.all([
          AsyncStorage.getItem("parentId"),
          AsyncStorage.getItem("schoolKey"),
        ]);

        setParentId(pid || null);
        setSchoolKey(sk || null);

        if (!pid) {
          setChildren([]);
          setPaymentRows([]);
          return;
        }

        const [parentSnap, studentsSnap, usersSnap, paymentsSnap] = await Promise.all([
          get(ref(database, schoolAwarePath(`Parents/${pid}`, sk || null))),
          get(ref(database, schoolAwarePath("Students", sk || null))),
          get(ref(database, schoolAwarePath("Users", sk || null))),
          get(ref(database, schoolAwarePath("Payments/monthlyPaid", sk || null))),
        ]);

        const parentVal = parentSnap.exists() ? parentSnap.val() || {} : {};
        const studentsVal = studentsSnap.exists() ? studentsSnap.val() || {} : {};
        const usersVal = usersSnap.exists() ? usersSnap.val() || {} : {};
        const paymentsVal = paymentsSnap.exists() ? paymentsSnap.val() || {} : {};

        const rawChildren = parentVal?.children ? Object.values(parentVal.children) : [];

        const normalizedChildren = rawChildren
          .map((childLink) => {
            const studentId =
              childLink?.studentId ||
              childLink?.id ||
              childLink?.student_id ||
              childLink?.studentID ||
              null;

            if (!studentId) return null;

            const studentNode = studentsVal?.[studentId] || {};
            const studentUser = usersVal?.[studentNode?.userId] || {};

            return {
              studentId: String(studentId),
              name: studentUser?.name || "Student",
              grade: studentNode?.grade || "--",
              section: studentNode?.section || "--",
              relationship: childLink?.relationship || "Child",
            };
          })
          .filter(Boolean);

        setChildren(normalizedChildren);

        const monthKeys = sortMonthKeysDesc(Object.keys(paymentsVal || {}));
        const rows = [];

        monthKeys.forEach((monthKey) => {
          const monthMap = paymentsVal?.[monthKey] || {};

          normalizedChildren.forEach((child) => {
            const paymentValue = monthMap?.[child.studentId];

            if (typeof paymentValue === "undefined") return;

            rows.push({
              id: `${monthKey}-${child.studentId}`,
              monthKey,
              monthLabel: monthLabel(monthKey),
              monthShort: getMonthShort(monthKey),
              studentId: child.studentId,
              studentName: child.name,
              relationship: child.relationship,
              grade: child.grade,
              section: child.section,
              paid: Boolean(paymentValue),
            });
          });
        });

        setPaymentRows(rows);
      } catch (e) {
        console.warn("Payment history load error:", e);
        setChildren([]);
        setPaymentRows([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [schoolAwarePath]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData({ silent: true });
  };

  const summary = useMemo(() => {
    const total = paymentRows.length;
    const paid = paymentRows.filter((r) => r.paid).length;
    const unpaid = total - paid;
    const latestMonth = paymentRows.length ? paymentRows[0]?.monthLabel : "No records";
    return { total, paid, unpaid, latestMonth };
  }, [paymentRows]);

  const groupedByStudent = useMemo(() => {
    const map = {};

    children.forEach((child) => {
      map[child.studentId] = {
        studentId: child.studentId,
        studentName: child.name,
        relationship: child.relationship,
        grade: child.grade,
        section: child.section,
        items: [],
      };
    });

    paymentRows.forEach((row) => {
      if (!map[row.studentId]) {
        map[row.studentId] = {
          studentId: row.studentId,
          studentName: row.studentName,
          relationship: row.relationship || "Child",
          grade: row.grade,
          section: row.section,
          items: [],
        };
      }
      map[row.studentId].items.push(row);
    });

    Object.values(map).forEach((group) => {
      group.items = sortMonthKeysDesc(group.items.map((i) => i.monthKey)).map((k) =>
        group.items.find((i) => i.monthKey === k)
      );
    });

    return Object.values(map);
  }, [children, paymentRows]);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={PRIMARY} />
        <Text style={styles.loadingText}>Loading payment history...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: 28 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.heroCard}>
        <View style={styles.heroIconWrap}>
          <Ionicons name="wallet-outline" size={28} color={PRIMARY} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>Payment History</Text>
          <Text style={styles.heroSub}>
            View your children’s monthly payment records in one clean place.
          </Text>

          <View style={styles.heroChip}>
            <Ionicons name="shield-checkmark-outline" size={14} color={PRIMARY_DARK} />
            <Text style={styles.heroChipText}>Synced from school payment data</Text>
          </View>
        </View>
      </View>

      <View style={styles.summaryRow}>
        <SummaryCard
          title="Paid"
          value={String(summary.paid)}
          icon="checkmark-circle-outline"
          iconColor={SUCCESS}
          bg={SUCCESS_SOFT}
        />
        <SummaryCard
          title="Pending"
          value={String(summary.unpaid)}
          icon="time-outline"
          iconColor={WARNING}
          bg={WARNING_SOFT}
        />
      </View>

      <View style={styles.summaryWide}>
        <View style={styles.summaryWideLeft}>
          <Text style={styles.summaryWideLabel}>Latest Recorded Month</Text>
          <Text style={styles.summaryWideValue}>{summary.latestMonth}</Text>
        </View>
        <View style={styles.summaryWideRight}>
          <Ionicons name="calendar-outline" size={20} color={PRIMARY_DARK} />
        </View>
      </View>

      {children.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="people-outline" size={28} color={MUTED} />
          <Text style={styles.emptyTitle}>No linked children found</Text>
          <Text style={styles.emptyText}>
            This parent account does not currently show any linked student IDs.
          </Text>
        </View>
      ) : paymentRows.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="receipt-outline" size={28} color={MUTED} />
          <Text style={styles.emptyTitle}>No payment records found</Text>
          <Text style={styles.emptyText}>
            We found your linked children, but there are no matching payment records yet in
            `Payments/monthlyPaid`.
          </Text>
        </View>
      ) : (
        groupedByStudent.map((group) => {
          const paidCount = group.items.filter((i) => i.paid).length;
          const pendingCount = group.items.length - paidCount;

          return (
            <View key={group.studentId} style={styles.studentCard}>
              <View style={styles.studentTop}>
                <View style={styles.studentAvatar}>
                  <Ionicons name="person-outline" size={20} color={PRIMARY_DARK} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.studentName}>{group.studentName}</Text>
                  <Text style={styles.studentMeta}>
                    {group.relationship} • ID: {group.studentId}
                  </Text>
                  <Text style={styles.studentSubMeta}>
                    Grade {group.grade} • Section {group.section}
                  </Text>
                </View>
              </View>

              <View style={styles.studentStatsRow}>
                <View style={styles.studentMiniStat}>
                  <Text style={styles.studentMiniStatValue}>{paidCount}</Text>
                  <Text style={styles.studentMiniStatLabel}>Paid</Text>
                </View>
                <View style={styles.studentMiniDivider} />
                <View style={styles.studentMiniStat}>
                  <Text style={[styles.studentMiniStatValue, { color: pendingCount ? WARNING : TEXT }]}>
                    {pendingCount}
                  </Text>
                  <Text style={styles.studentMiniStatLabel}>Pending</Text>
                </View>
              </View>

              {group.items.length > 0 ? (
                <View style={styles.timelineWrap}>
                  {group.items.map((item, index) => {
                    const statusColor = item.paid ? SUCCESS : WARNING;
                    const statusBg = item.paid ? SUCCESS_SOFT : WARNING_SOFT;
                    const statusText = item.paid ? "Paid" : "Pending";
                    const iconName = item.paid ? "checkmark-circle" : "time";

                    return (
                      <View
                        key={item.id}
                        style={[
                          styles.historyRow,
                          index === group.items.length - 1 && { borderBottomWidth: 0, paddingBottom: 0 },
                        ]}
                      >
                        <View style={styles.monthBadge}>
                          <Text style={styles.monthBadgeText}>{item.monthShort}</Text>
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text style={styles.historyMonth}>{item.monthLabel}</Text>
                          <Text style={styles.historySub}>Student ID: {item.studentId}</Text>
                        </View>

                        <View style={[styles.statusPill, { backgroundColor: statusBg }]}>
                          <Ionicons name={iconName} size={14} color={statusColor} />
                          <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.childNoHistory}>
                  <Ionicons name="document-text-outline" size={18} color={MUTED} />
                  <Text style={styles.childNoHistoryText}>No payment history found for this child yet.</Text>
                </View>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

function SummaryCard({ title, value, icon, iconColor, bg }) {
  return (
    <View style={styles.summaryCard}>
      <View style={[styles.summaryIconWrap, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
  },

  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BG,
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: MUTED,
    fontWeight: "600",
  },

  heroCard: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "rgba(15,23,42,0.03)",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  heroIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: PRIMARY_SOFT,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  heroTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: TEXT,
  },
  heroSub: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: MUTED,
    fontWeight: "500",
  },
  heroChip: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: PRIMARY_SOFT,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
  },
  heroChipText: {
    marginLeft: 6,
    color: PRIMARY_DARK,
    fontSize: 12,
    fontWeight: "800",
  },

  summaryRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    padding: 14,
    shadowColor: "rgba(15,23,42,0.03)",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  summaryIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: "900",
    color: TEXT,
  },
  summaryLabel: {
    marginTop: 2,
    fontSize: 12,
    color: MUTED,
    fontWeight: "700",
  },

  summaryWide: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "rgba(15,23,42,0.03)",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  summaryWideLeft: { flex: 1 },
  summaryWideLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: MUTED,
  },
  summaryWideValue: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: "800",
    color: TEXT,
  },
  summaryWideRight: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: PRIMARY_SOFT,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },

  emptyCard: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    padding: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: "800",
    color: TEXT,
    textAlign: "center",
  },
  emptyText: {
    marginTop: 6,
    fontSize: 13,
    color: MUTED,
    lineHeight: 18,
    textAlign: "center",
  },

  studentCard: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
  },
  studentTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  studentAvatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: PRIMARY_SOFT,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  studentName: {
    fontSize: 16,
    fontWeight: "800",
    color: TEXT,
  },
  studentMeta: {
    marginTop: 3,
    fontSize: 12.5,
    color: MUTED,
    fontWeight: "600",
  },
  studentSubMeta: {
    marginTop: 2,
    fontSize: 12,
    color: MUTED,
    fontWeight: "600",
  },

  studentStatsRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EAF0F8",
    paddingVertical: 10,
  },
  studentMiniStat: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  studentMiniDivider: {
    width: 1,
    height: 24,
    backgroundColor: "#E2E8F0",
  },
  studentMiniStatValue: {
    fontSize: 18,
    fontWeight: "900",
    color: TEXT,
  },
  studentMiniStatLabel: {
    marginTop: 2,
    fontSize: 11.5,
    fontWeight: "700",
    color: MUTED,
  },

  timelineWrap: {
    marginTop: 14,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF4FA",
  },
  monthBadge: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#F8FAFF",
    borderWidth: 1,
    borderColor: "#E6EDF8",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  monthBadgeText: {
    fontSize: 12,
    fontWeight: "900",
    color: PRIMARY_DARK,
  },
  historyMonth: {
    fontSize: 14,
    fontWeight: "800",
    color: TEXT,
  },
  historySub: {
    marginTop: 3,
    fontSize: 12,
    color: MUTED,
    fontWeight: "600",
  },
  statusPill: {
    marginLeft: 12,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
  },
  statusText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "800",
  },

  childNoHistory: {
    marginTop: 14,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  childNoHistoryText: {
    marginLeft: 8,
    color: MUTED,
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
});