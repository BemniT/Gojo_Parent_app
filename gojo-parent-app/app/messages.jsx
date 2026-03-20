import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  StatusBar,
  RefreshControl,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ref, get } from "firebase/database";
import { database } from "../constants/firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { setOpenedChat } from "./lib/chatStore";
import { useFocusEffect } from "@react-navigation/native";
import { getUserVal } from "./lib/userHelpers";

const PRIMARY = "#007AFB";
const MUTED = "#6B78A8";
const AVATAR_PLACEHOLDER = require("../assets/images/avatar_placeholder.png");

const FILTERS = ["Children", "Management", "Teachers"];
const debounceWindowMs = 15 * 1000;

function shortText(s, n = 60) {
  if (!s && s !== 0) return "";
  const t = String(s);
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

function fmtTime12(ts) {
  if (!ts) return "";
  try {
    const d = new Date(Number(ts));
    let h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, "0");
    const ampmProper = d.getHours() >= 12 ? "PM" : "AM";
    h = d.getHours() % 12;
    if (h === 0) h = 12;
    return `${h}:${m} ${ampmProper}`;
  } catch {
    return "";
  }
}

export default function MessagesScreen() {
  const router = useRouter();

  const [loadingInitial, setLoadingInitial] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("Children");
  const [contacts, setContacts] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);

  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef(null);

  const cacheRef = useRef({
    parentId: null,
    studentUserIdsForParent: null,
  });
  const lastFetchedAtRef = useRef(0);

  const makeDeterministicChatId = (a, b) => `${a}_${b}`;

  async function getDbRef(subPath) {
    const sk = (await AsyncStorage.getItem("schoolKey")) || null;
    if (sk) return ref(database, `Platform1/Schools/${sk}/${subPath}`);
    return ref(database, subPath);
  }

  const resolveCurrentUserId = useCallback(async () => {
    let uId = await AsyncStorage.getItem("userId");
    if (uId) return uId;

    const nodeKey =
      (await AsyncStorage.getItem("userNodeKey")) ||
      (await AsyncStorage.getItem("studentNodeKey")) ||
      (await AsyncStorage.getItem("studentId")) ||
      null;

    if (!nodeKey) return null;

    try {
      const u = await getUserVal(nodeKey);
      if (u) return u.userId || nodeKey;
    } catch {}

    return nodeKey;
  }, []);

  const loadCacheAndShow = async () => {
    try {
      const raw = await AsyncStorage.getItem("parentChatsCache");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setContacts(parsed);
          setLoadingInitial(false);
          const fetchedAt = Number((await AsyncStorage.getItem("parentChatsCacheFetchedAt")) || 0);
          lastFetchedAtRef.current = fetchedAt;
          return true;
        }
      }
    } catch {}
    return false;
  };

  const loadData = useCallback(async ({ background = false } = {}) => {
    if (!background) setLoadingInitial(true);

    try {
      const parentId = (await AsyncStorage.getItem("parentId")) || null;
      const resolvedUserId = await resolveCurrentUserId();
      setCurrentUserId(resolvedUserId || null);

      if (!parentId || !resolvedUserId) {
        setContacts([]);
        return;
      }

      if (cacheRef.current.parentId !== parentId || !cacheRef.current.studentUserIdsForParent) {
        const studentUserIds = new Set();

        try {
          const studentsSnap = await get(await getDbRef("Students"));
          if (studentsSnap.exists()) {
            studentsSnap.forEach((childSnap) => {
              const s = childSnap.val() || {};
              const parentsMap = s.parents || {};
              if (parentsMap[parentId] && s.userId) {
                studentUserIds.add(String(s.userId));
              }
            });
          }
        } catch {}

        cacheRef.current.parentId = parentId;
        cacheRef.current.studentUserIdsForParent = studentUserIds;
      }

      const studentUserNodeKeys = new Set(cacheRef.current.studentUserIdsForParent || []);
      const teacherUserNodeKeys = new Set();
      const managementMap = new Map();

      try {
        const teachersSnap = await get(await getDbRef("Teachers"));
        if (teachersSnap.exists()) {
          teachersSnap.forEach((childSnap) => {
            const t = childSnap.val() || {};
            if (t.userId) teacherUserNodeKeys.add(String(t.userId));
          });
        }
      } catch {}

      try {
        const saSnap = await get(await getDbRef("School_Admins"));
        if (saSnap.exists()) {
          saSnap.forEach((childSnap) => {
            const v = childSnap.val();
            if (v?.userId) managementMap.set(String(v.userId), "Management");
          });
        }
      } catch {}

      try {
        const regSnap = await get(await getDbRef("Registerers"));
        if (regSnap.exists()) {
          regSnap.forEach((childSnap) => {
            const v = childSnap.val();
            if (v?.userId) managementMap.set(String(v.userId), "Registerer");
          });
        }
      } catch {}

      try {
        const finSnap = await get(await getDbRef("Finances"));
        if (finSnap.exists()) {
          finSnap.forEach((childSnap) => {
            const v = childSnap.val();
            if (v?.userId) managementMap.set(String(v.userId), "Finance");
          });
        }
      } catch {}

      const userNodeKeysToLoad = new Set([
        ...Array.from(studentUserNodeKeys),
        ...Array.from(teacherUserNodeKeys),
        ...Array.from(managementMap.keys()),
      ]);

      const userProfiles = {};
      await Promise.all(
        Array.from(userNodeKeysToLoad).map(async (k) => {
          try {
            const p = await getUserVal(k);
            if (p) userProfiles[k] = p;
          } catch {}
        })
      );

      const contactsMap = new Map();

      for (const nodeK of Array.from(studentUserNodeKeys)) {
        const p = userProfiles[nodeK] || null;
        if (!p) continue;

        contactsMap.set(nodeK, {
          key: nodeK,
          userId: p?.userId || nodeK,
          name: p?.name || p?.username || "Child",
          role: "Child",
          profileImage: p?.profileImage || null,
          type: "student",
          chatId: "",
          lastMessage: "",
          lastTime: null,
          lastSenderId: null,
          lastSeen: false,
          unread: 0,
        });
      }

      for (const nodeK of Array.from(teacherUserNodeKeys)) {
        const p = userProfiles[nodeK] || null;
        contactsMap.set(nodeK, {
          key: nodeK,
          userId: p?.userId || nodeK,
          name: p?.name || p?.username || "Teacher",
          role: "Teacher",
          profileImage: p?.profileImage || null,
          type: "teacher",
          chatId: "",
          lastMessage: "",
          lastTime: null,
          lastSenderId: null,
          lastSeen: false,
          unread: 0,
        });
      }

      for (const nodeK of Array.from(managementMap.keys())) {
        if (contactsMap.has(nodeK)) continue;

        const p = userProfiles[nodeK] || null;
        const roleLabel = managementMap.get(nodeK) || "Management";

        contactsMap.set(nodeK, {
          key: nodeK,
          userId: p?.userId || nodeK,
          name: p?.name || p?.username || roleLabel,
          role: roleLabel,
          profileImage: p?.profileImage || null,
          type: "management",
          chatId: "",
          lastMessage: "",
          lastTime: null,
          lastSenderId: null,
          lastSeen: false,
          unread: 0,
        });
      }

      try {
        const chatsSnap = await get(await getDbRef("Chats"));
        if (chatsSnap.exists()) {
          chatsSnap.forEach((childSnap) => {
            const chatKey = childSnap.key;
            const val = childSnap.val() || {};
            const participants = val.participants || {};
            const last = val.lastMessage || null;
            const unreadObj = val.unread || {};

            if (!participants[resolvedUserId]) return;

            const otherKeys = Object.keys(participants).filter((k) => String(k) !== String(resolvedUserId));
            if (!otherKeys.length) return;
            const other = otherKeys[0];

            for (const [mapKey, c] of contactsMap.entries()) {
              if (String(c.userId) === String(other) || String(mapKey) === String(other)) {
                const next = { ...c };
                next.chatId = chatKey;
                next.lastMessage = last?.text || next.lastMessage;
                next.lastTime = last?.timeStamp || next.lastTime;
                next.lastSenderId = last?.senderId ?? next.lastSenderId;
                next.lastSeen = typeof last?.seen === "boolean" ? last.seen : next.lastSeen;

                const unreadCount = Number(unreadObj[resolvedUserId] ?? 0);
                const lastSender = last?.senderId ?? null;
                next.unread = lastSender && String(lastSender) === String(resolvedUserId) ? 0 : unreadCount;

                contactsMap.set(mapKey, next);
              }
            }
          });
        }
      } catch {}

      const fresh = Array.from(contactsMap.values()).sort((a, b) => {
        if ((b.unread || 0) !== (a.unread || 0)) return (b.unread || 0) - (a.unread || 0);
        const ta = Number(a.lastTime || 0);
        const tb = Number(b.lastTime || 0);
        if (tb !== ta) return tb - ta;
        return String(a.name || "").localeCompare(String(b.name || ""));
      });

      setContacts(fresh);

      try {
        await AsyncStorage.setItem("parentChatsCache", JSON.stringify(fresh));
        await AsyncStorage.setItem("parentChatsCacheFetchedAt", String(Date.now()));
        lastFetchedAtRef.current = Date.now();
      } catch {}
    } catch (err) {
      console.warn("loadData error", err);
    } finally {
      if (!background) setLoadingInitial(false);
      setRefreshing(false);
    }
  }, [resolveCurrentUserId]);

  useEffect(() => {
    (async () => {
      await loadCacheAndShow();
      try {
        const fetchedAt = Number((await AsyncStorage.getItem("parentChatsCacheFetchedAt")) || 0);
        if (!fetchedAt || Date.now() - fetchedAt > debounceWindowMs) {
          loadData({ background: true });
        } else {
          lastFetchedAtRef.current = fetchedAt;
        }
      } catch {
        loadData({ background: true });
      }
    })();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - (lastFetchedAtRef.current || 0) > debounceWindowMs) {
        loadData({ background: true });
      }
    }, [loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData({ background: false });
  }, [loadData]);

  const onOpenChat = async (contact) => {
    if (!contact) return;

    let contactUserId = contact.userId || "";
    if (!contactUserId) {
      try {
        const p = await getUserVal(contact.key);
        contactUserId = p?.userId || contact.key;
      } catch {
        contactUserId = contact.key;
      }
    }

    let myUserId = await AsyncStorage.getItem("userId");
    if (!myUserId) {
      const nk =
        (await AsyncStorage.getItem("userNodeKey")) ||
        (await AsyncStorage.getItem("studentNodeKey")) ||
        (await AsyncStorage.getItem("studentId")) ||
        null;

      if (nk) {
        try {
          const u = await getUserVal(nk);
          myUserId = u?.userId || nk;
        } catch {
          myUserId = nk;
        }
      }
    }

    let existingChatId = contact.chatId || "";

    if (!existingChatId && myUserId && contactUserId) {
      try {
        const c1 = makeDeterministicChatId(myUserId, contactUserId);
        const c2 = makeDeterministicChatId(contactUserId, myUserId);

        const s1 = await get(await getDbRef(`Chats/${c1}`));
        if (s1.exists()) {
          existingChatId = c1;
        } else {
          const s2 = await get(await getDbRef(`Chats/${c2}`));
          if (s2.exists()) existingChatId = c2;
        }
      } catch {}
    }

    const payload = {
      chatId: existingChatId || "",
      userId: contactUserId || "",
      contactName: contact.name || "",
      contactImage: contact.profileImage || "",
    };

    setOpenedChat({
      chatId: payload.chatId,
      contactUserId: payload.userId,
      contactName: payload.contactName,
      contactImage: payload.contactImage,
      contactKey: contact.key || "",
    });

    router.push({
      pathname: "/chat",
      params: payload,
    });
  };

  const byFilter = useMemo(() => {
    if (filter === "Management") return contacts.filter((c) => c.type === "management");
    if (filter === "Teachers") return contacts.filter((c) => c.type === "teacher");
    if (filter === "Children") return contacts.filter((c) => c.type === "student");
    return contacts;
  }, [contacts, filter]);

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return byFilter;

    return byFilter.filter((c) => {
      const name = (c.name || "").toLowerCase();
      const role = (c.role || "").toLowerCase();
      const last = (c.lastMessage || "").toLowerCase();
      return name.includes(q) || role.includes(q) || last.includes(q);
    });
  }, [byFilter, search]);

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" translucent={false} />
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={22} color="#222" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Messages</Text>

          <TouchableOpacity
            onPress={() => {
              setShowSearch((v) => !v);
              setTimeout(() => searchInputRef.current?.focus(), 80);
            }}
          >
            <Ionicons name={showSearch ? "close-outline" : "search-outline"} size={20} color={MUTED} />
          </TouchableOpacity>
        </View>

        {showSearch && (
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={18} color={MUTED} style={{ marginRight: 8 }} />
            <TextInput
              ref={searchInputRef}
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name, role, or message"
              placeholderTextColor="#98A2B3"
              style={styles.searchInput}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={18} color={MUTED} />
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.filterContainer}>
          <View style={styles.filterRow}>
            {FILTERS.map((f) => (
              <TouchableOpacity
                key={f}
                onPress={() => setFilter(f)}
                activeOpacity={0.85}
                style={[styles.filterPill, filter === f ? styles.filterPillActive : null]}
              >
                <Text style={[styles.filterPillText, filter === f ? styles.filterPillTextActive : null]}>
                  {f}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {loadingInitial && contacts.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={PRIMARY} />
          </View>
        ) : filteredContacts.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No contacts</Text>
            <Text style={styles.emptySubtitle}>
              {search.trim() ? "No results for your search." : `No ${filter.toLowerCase()} contacts found yet.`}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredContacts}
            keyExtractor={(it) => it.key}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            renderItem={({ item }) => {
              const lastWasMine =
                item.lastSenderId && currentUserId && String(item.lastSenderId) === String(currentUserId);
              const seenFlag = !!item.lastSeen;

              return (
                <TouchableOpacity style={styles.itemWrapper} onPress={() => onOpenChat(item)} activeOpacity={0.9}>
                  <View style={styles.row}>
                    <Image
                      source={item.profileImage ? { uri: item.profileImage } : AVATAR_PLACEHOLDER}
                      style={styles.avatar}
                    />

                    <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
                      <View style={styles.rowTop}>
                        <View style={styles.leftTop}>
                          <Text style={styles.name} numberOfLines={1}>
                            {item.name}
                          </Text>
                          {item.role ? (
                            <View style={styles.badge}>
                              <Text style={styles.badgeText}>{item.role}</Text>
                            </View>
                          ) : null}
                        </View>

                        <View style={styles.rightMeta}>
                          <Text style={styles.time} numberOfLines={1}>
                            {fmtTime12(item.lastTime)}
                          </Text>

                          {lastWasMine ? (
                            <Ionicons
                              name={seenFlag ? "checkmark-done" : "checkmark"}
                              size={16}
                              color={seenFlag ? PRIMARY : MUTED}
                              style={{ marginLeft: 6 }}
                            />
                          ) : null}

                          {item.unread ? (
                            <View style={styles.unreadPill}>
                              <Text style={styles.unreadText}>{item.unread}</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>

                      <View style={{ marginTop: 6 }}>
                        <Text style={styles.subtitleText} numberOfLines={1}>
                          {shortText(item.lastMessage || "Start a conversation")}
                        </Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
            ItemSeparatorComponent={() => <View style={styles.separatorLine} />}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  container: { flex: 1, backgroundColor: "#fff" },

  headerRow: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#111" },

  searchWrap: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 8,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E6ECF7",
    backgroundColor: "#FAFCFF",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  searchInput: { flex: 1, color: "#111827", fontSize: 14, paddingVertical: 0 },

  filterContainer: { paddingHorizontal: 16, marginBottom: 8 },
  filterRow: { flexDirection: "row", width: "100%", gap: 8 },
  filterPill: {
    flex: 1,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#F8FAFF",
    justifyContent: "center",
    alignItems: "center",
  },
  filterPillActive: { backgroundColor: PRIMARY },
  filterPillText: { color: MUTED, fontWeight: "700", fontSize: 13 },
  filterPillTextActive: { color: "#fff" },

  itemWrapper: { paddingHorizontal: 0 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, backgroundColor: "#fff" },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#F1F3F8" },

  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  leftTop: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 8,
  },

  name: {
    fontWeight: "700",
    fontSize: 16,
    color: "#111",
    marginRight: 8,
    flexShrink: 1,
  },

  badge: {
    marginLeft: -4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: "#F1F7FF",
    flexShrink: 0,
  },
  badgeText: { color: PRIMARY, fontWeight: "700", fontSize: 11 },
  subtitleText: { color: MUTED, fontSize: 13, flex: 1 },

  rightMeta: {
    minWidth: 88,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },

  time: { color: MUTED, fontSize: 11 },

  unreadPill: {
    marginLeft: 6,
    backgroundColor: PRIMARY,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    minWidth: 24,
    alignItems: "center",
  },
  unreadText: { color: "#fff", fontWeight: "700", fontSize: 12 },

  separatorLine: { height: 1, backgroundColor: "#EEF4FF", marginLeft: 56 + 12 + 8, marginRight: 0 },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 40, paddingHorizontal: 24 },
  emptyTitle: { fontWeight: "700", fontSize: 16, color: "#222", textAlign: "center" },
  emptySubtitle: { color: MUTED, marginTop: 6, textAlign: "center" },
});