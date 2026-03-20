import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import PaymentsTab from "../school/payments";
import HistoryTab from "../school/history";
import CalendarTab from "../school/calendar";

const PRIMARY = "#1E90FF";
const BG = "#FFFFFF";
const TEXT = "#0F172A";

const TABS = ["Payments", "History", "Calendar"];

export default function SchoolScreen() {
  const [activeTab, setActiveTab] = useState("Payments");

  const renderTab = () => {
    if (activeTab === "Payments") return <PaymentsTab />;
    if (activeTab === "History") return <HistoryTab />;
    return <CalendarTab />;
  };

  return (
    <View style={styles.container}>
      {/* Whole page scroll with sticky local tab switcher */}
      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 24 }}
        stickyHeaderIndices={[1]}
        showsVerticalScrollIndicator={false}
      >
        {/* top title block (scrolls away) */}
        <View style={styles.headerCard}>
          <Text style={styles.headerTitle}>Parent Services Center</Text>
          <Text style={styles.headerSub}>
            Fees, payment history, and school calendar in one place
          </Text>
        </View>

        {/* sticky local tab switcher */}
        <View style={styles.stickyWrap}>
          <View style={styles.tabRow}>
            {TABS.map((t) => {
              const active = activeTab === t;
              return (
                <TouchableOpacity
                  key={t}
                  onPress={() => setActiveTab(t)}
                  style={[styles.tabBtn, active && styles.tabBtnActive]}
                >
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>{t}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* tab body */}
        <View style={{ marginTop: 4 }}>{renderTab()}</View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  headerCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  headerTitle: { fontSize: 20, fontWeight: "800", color: TEXT },
  headerSub: { fontSize: 13, color: "#64748B", marginTop: 4 },

  stickyWrap: {
    backgroundColor: "#FFFFFF",
    paddingBottom: 8,
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: "#EEF2FF",
    borderRadius: 12,
    padding: 4,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
  },
  tabBtnActive: { backgroundColor: PRIMARY },
  tabText: { color: "#334155", fontWeight: "700", fontSize: 13 },
  tabTextActive: { color: "#fff" },
});