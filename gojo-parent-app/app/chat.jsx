import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ref, push, update, onValue, get, child, off } from "firebase/database";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { useEffect, useState, useMemo, useRef } from "react";
import {
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
  Alert,
  Dimensions,
  Modal,
  TouchableWithoutFeedback,
  ActivityIndicator,
  InteractionManager,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import EmojiSelector from "react-native-emoji-selector";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { database, storage } from "../constants/firebaseConfig";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

// --- Helpers ---
const WINDOW_WIDTH = Dimensions.get("window").width;
const BUBBLE_MAX_WIDTH = WINDOW_WIDTH * 0.75;

const formatTime = (timestamp) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  if (
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  ) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else {
    return date.toLocaleString([], { month: "short", day: "numeric" });
  }
};

const formatDateHeader = (timestamp) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  if (sameDay) return "Today";
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  if (
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  )
    return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
};

// escape regex for safe splitting
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// --- Message Bubble (Telegram style) ---
const MessageBubble = ({
  item,
  isSender,
  onLongPress,
  repliedMsg,
  onPressReplyPreview,
  showTail,
  highlightQuery,
  isCurrentMatch,
}) => {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (isCurrentMatch) {
      pulse.setValue(0);
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 140, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]).start();
    }
  }, [isCurrentMatch, pulse]);
  const bubbleStyle = isSender ? styles.tgSenderBubble : styles.tgReceiverBubble;
  const textColor = isSender ? "#fff" : "#000";
  const timeColor = isSender ? "#dfefff" : "#6b6b6b";

  const q = (highlightQuery || "").trim();
  const hasQuery = !!q && !item.deleted && item.type === "text" && (item.text || "").toLowerCase().includes(q.toLowerCase());

  const renderHighlightedText = () => {
    if (!hasQuery) {
      return (
        <Text style={[styles.tgMessageText, { color: textColor }]}>
          {item.text} {item.edited && <Text style={styles.editedHint}>(edited)</Text>}
        </Text>
      );
    }
    const regex = new RegExp(`(${escapeRegExp(q)})`, "ig");
    const segments = (item.text || "").split(regex);
    return (
      <Text style={[styles.tgMessageText, { color: textColor }]}
       >
        {segments.map((seg, idx) => {
          const match = seg.toLowerCase() === q.toLowerCase();
          return (
            <Text key={`seg-${idx}`} style={match ? styles.highlightText : null}>
              {seg}
            </Text>
          );
        })}
        {item.edited && <Text style={styles.editedHint}>(edited)</Text>}
      </Text>
    );
  };

  return (
    <View style={[styles.tgRow, isSender ? { justifyContent: "flex-end" } : { justifyContent: "flex-start" }]}>
      {!isSender && <View style={styles.tgAvatarSpacer} />}
      <TouchableOpacity
        activeOpacity={0.85}
        onLongPress={() => onLongPress(item)}
        style={{ maxWidth: BUBBLE_MAX_WIDTH }}
      >
        <View style={[bubbleStyle, showTail ? (isSender ? styles.tgSenderTail : styles.tgReceiverTail) : null, isCurrentMatch ? styles.currentMatchOutline : null]}>
          {isCurrentMatch && (
            <Animated.View
              pointerEvents="none"
              style={[styles.currentMatchPulse, { opacity: pulse }]}
            />
          )}
          {repliedMsg && (
            <TouchableOpacity onPress={() => onPressReplyPreview(repliedMsg)} activeOpacity={0.8}>
              <View style={styles.replyPreview}>
                <View style={styles.replyBar} />
                <Text style={[styles.replyText, isSender ? { color: "#dfefff" } : { color: "#666" }]} numberOfLines={1}>
                  {repliedMsg.deleted ? "This message was deleted" : repliedMsg.type === "text" ? repliedMsg.text : "📷 Photo"}
                </Text>
              </View>
            </TouchableOpacity>
          )}

          {item.deleted ? (
            <Text style={[styles.deletedText, { color: textColor }]}>This message was deleted</Text>
          ) : item.type === "text" ? (
            renderHighlightedText()
          ) : (
            <Image source={{ uri: item.imageUrl }} style={styles.tgImage} />
          )}

          {/* time + ticks */}
          {!item.deleted && (
            <View style={styles.tgMetaRow}>
              <Text style={[styles.tgTime, { color: timeColor }]}>{formatTime(item.timeStamp)}</Text>
              {isSender && (
                <Ionicons
                  name={item.seen ? "checkmark-done" : "checkmark"}
                  size={14}
                  color={item.seen ? "#fff" : "#e6f2ff"}
                  style={{ marginLeft: 6 }}
                />
              )}
            </View>
          )}
        </View>
      </TouchableOpacity>
      {isSender && <View style={styles.tgAvatarSpacer} />}
    </View>
  );
};

// --- Main Chat component ---
export default function Chat() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const receiverParamId = params.userId;
  const receiverName = params.name;
  const receiverEmail = params.email;
  const receiverPhone = params.phone;
  const receiverProfileImage = params.profileImage;
  const receiverTitle = params.title;
  const insets = useSafeAreaInsets();

  // ids
  const [parentRecordId, setParentRecordId] = useState(null);
  const [parentUserId, setParentUserId] = useState(null);
  const [receiverUserId, setReceiverUserId] = useState(null);
  const [receiverRole, setReceiverRole] = useState(null);

  // profile
  const [receiverProfile, setReceiverProfile] = useState(null);

  // messages
  const [messages, setMessages] = useState([]);
  const [groupedMessages, setGroupedMessages] = useState([]); // includes date separators
  const [messagesLoading, setMessagesLoading] = useState(true);

  // input & UI
  const [newMessage, setNewMessage] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  // in-chat search
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [matched, setMatched] = useState([]);
  const [currentMatchId, setCurrentMatchId] = useState(null);

  // modal / actions
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [actionMsg, setActionMsg] = useState(null);

  const flatListRef = useRef();
  const messagesListenerRef = useRef(null);

  // Skeleton shimmer for initial messages load
  const chatSkeletonAnim = useRef(new Animated.Value(0)).current;

  // composer height to offset FlatList padding so messages aren't hidden by floating composer
  const [composerHeight, setComposerHeight] = useState(64);

  // animated translateY for floating composer (negative keyboard height)
  const animatedTranslateY = useRef(new Animated.Value(0)).current;

  // load parent ids
  useEffect(() => {
    (async () => {
      try {
        const parentRecId = await AsyncStorage.getItem("parentId");
        if (!parentRecId) return;
        setParentRecordId(parentRecId);
        const snap = await get(ref(database, `Parents/${parentRecId}`));
        if (snap.exists()) setParentUserId(snap.val().userId);
      } catch (e) {
        console.warn("loadParentId error", e);
      }
    })();
  }, []);

  // fetch receiver profile & role -> resolve userId
  useEffect(() => {
    if (!receiverParamId) return;
    let mounted = true;
    (async () => {
      try {
        const roles = ["Students", "Teachers", "School_Admins", "Parents"];
        let userId = null;
        let foundRole = null;
        for (let role of roles) {
          const snap = await get(child(ref(database), `${role}/${receiverParamId}`));
          if (snap.exists()) {
            userId = snap.val().userId;
            foundRole = role;
            break;
          }
        }

        // If no role record matched, assume receiverParamId is already a Users.userId
        if (!userId) {
          const userSnap = await get(child(ref(database), `Users/${receiverParamId}`));
          if (userSnap.exists()) {
            userId = receiverParamId;
            foundRole = null;
          }
        }

        if (!userId) return;
        if (!mounted) return;
        setReceiverUserId(userId);
        setReceiverRole(foundRole);
        const profileSnap = await get(child(ref(database), `Users/${userId}`));
        setReceiverProfile(profileSnap.exists() ? profileSnap.val() : { name: "User" });
      } catch (err) {
        console.warn("fetchReceiver", err);
      }
    })();
    return () => { mounted = false; };
  }, [receiverParamId]);

  const chatId = useMemo(() => {
    if (!parentUserId || !receiverUserId) return null;
    return [parentUserId, receiverUserId].sort().join("_");
  }, [parentUserId, receiverUserId]);

  // listen messages
  useEffect(() => {
    if (!chatId) return;
    const messagesRef = ref(database, `Chats/${chatId}/messages`);

    // detach previous if any
    if (messagesListenerRef.current) messagesListenerRef.current();

    const unsubscribe = onValue(messagesRef, async (snap) => {
      const data = snap.val() || {};
      const arr = Object.entries(data)
        .map(([k, v]) => ({ ...v, messageId: k }))
        .sort((a, b) => a.timeStamp - b.timeStamp);
      setMessages(arr);
      setMessagesLoading(false);
    });

    messagesListenerRef.current = () => off(messagesRef, "value", unsubscribe);
    return () => {
      if (messagesListenerRef.current) {
        messagesListenerRef.current();
        messagesListenerRef.current = null;
      }
    };
  }, [chatId]);

  // group messages with date separators for UI
  useEffect(() => {
    const grouped = [];
    let lastDateHeader = null;
    messages.forEach((m) => {
      const header = formatDateHeader(m.timeStamp);
      if (header !== lastDateHeader) {
        grouped.push({ type: "date", id: `date-${m.timeStamp}`, label: header, timeStamp: m.timeStamp });
        lastDateHeader = header;
      }
      grouped.push({ type: "message", ...m });
    });
    setGroupedMessages(grouped);
  }, [messages]);

  // Approximate layout maps for stable index jumps on Android
  const APPROX_MSG_HEIGHT = 90;
  const APPROX_DATE_HEIGHT = 28;
  const reversedData = useMemo(() => groupedMessages.slice().reverse(), [groupedMessages]);
  const approxLayout = useMemo(() => {
    const heights = reversedData.map((it) => (it.type === "date" ? APPROX_DATE_HEIGHT : APPROX_MSG_HEIGHT));
    const offsets = new Array(heights.length);
    let acc = 0;
    for (let i = 0; i < heights.length; i++) {
      offsets[i] = acc;
      acc += heights[i];
    }
    return { heights, offsets };
  }, [reversedData]);

  // mark as seen + clear unread when messages loaded and chat is open
  useEffect(() => {
    const markSeenAndClearUnread = async () => {
      if (!chatId || !parentUserId) return;
      try {
        const lastRef = ref(database, `Chats/${chatId}/lastMessage`);
        const lastSnap = await get(lastRef);
        const last = lastSnap.exists() ? lastSnap.val() : null;

        // Mark last message as seen if needed
        if (last && last.senderId === receiverUserId && !last.seen) {
          await update(lastRef, { seen: true });
          try {
            const mu = {};
            mu[`UserChats/${parentUserId}/${chatId}/lastMessage/seen`] = true;
            mu[`UserChats/${receiverUserId}/${chatId}/lastMessage/seen`] = true;
            await update(ref(database), mu);
          } catch (e) {}
        }

        // Mark all messages from receiver as seen
        const messagesRef = ref(database, `Chats/${chatId}/messages`);
        const messagesSnap = await get(messagesRef);
        if (messagesSnap.exists()) {
          const updates = {};
          const messagesData = messagesSnap.val();
          Object.entries(messagesData).forEach(([msgId, msg]) => {
            if (msg.senderId === receiverUserId && !msg.seen) {
              updates[`Chats/${chatId}/messages/${msgId}/seen`] = true;
            }
          });
          if (Object.keys(updates).length > 0) {
            await update(ref(database), updates);
          }
        }

        await update(ref(database, `Chats/${chatId}/unread`), { [parentUserId]: 0 });
        try {
          await update(ref(database), { [`UserChats/${parentUserId}/${chatId}/unread`]: 0 });
        } catch (e) {}
      } catch (err) {
        console.warn("markSeen error", err);
      }
    };

    markSeenAndClearUnread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, chatId, parentUserId, receiverUserId]);

  // auto-scroll to bottom on new messages
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      } catch (e) {}
    }, 100);
    return () => clearTimeout(t);
  }, [groupedMessages]);

  // compute matches for in-chat search
  useEffect(() => {
    const q = (searchQuery || "").trim().toLowerCase();
    if (!q) {
      setMatched([]);
      setMatchIndex(0);
      setCurrentMatchId(null);
      return;
    }
    const arr = messages.filter((m) => !m.deleted && m.type === "text" && (m.text || "").toLowerCase().includes(q));
    setMatched(arr);
    setMatchIndex(0);
    if (arr.length) requestAnimationFrame(() => jumpToIndex(0));
  }, [searchQuery, messages]);

  // shimmer loop for chat skeleton
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(chatSkeletonAnim, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(chatSkeletonAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [chatSkeletonAnim]);
  // Keep current match id in sync when matchIndex changes
  useEffect(() => {
    if (!matched.length) return;
    const m = matched[matchIndex];
    if (m && m.messageId !== currentMatchId) {
      setCurrentMatchId(m.messageId);
      requestAnimationFrame(() => scrollToMessage(m));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchIndex]);

  const jumpToIndex = (idx) => {
    if (!matched.length) return;
    const m = matched[idx];
    if (!m) return;
    setCurrentMatchId(m.messageId);
    requestAnimationFrame(() => scrollToMessage(m));
  };
  const jumpNext = () => {
    if (!matched.length) return;
    setMatchIndex((i) => {
      const ni = (i + 1) % matched.length;
      setTimeout(() => jumpToIndex(ni), 0);
      return ni;
    });
  };
  const jumpPrev = () => {
    if (!matched.length) return;
    setMatchIndex((i) => {
      const ni = (i - 1 + matched.length) % matched.length;
      setTimeout(() => jumpToIndex(ni), 0);
      return ni;
    });
  };

  // keyboard listeners to animate floating composer using translateY (keyboard height minus safe area)
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (e) => {
      // Android already resizes the view height with the keyboard, so skip manual lift there to avoid double shifting
      if (Platform.OS === "android") {
        Animated.timing(animatedTranslateY, {
          toValue: 0,
          duration: e?.duration ?? 200,
          useNativeDriver: true,
        }).start();
        setKeyboardVisible(true);
        if (showEmoji) setShowEmoji(false);
        return;
      }

      const kbHeight = e?.endCoordinates?.height ?? 300;
      const pad = 6;
      const lift = Math.max(0, kbHeight - (insets.bottom || 0) - pad);
      Animated.timing(animatedTranslateY, {
        toValue: -lift,
        duration: e?.duration ?? 250,
        useNativeDriver: true,
      }).start();
      setKeyboardVisible(true);
      if (showEmoji) setShowEmoji(false);
    };
    const onHide = (e) => {
      Animated.timing(animatedTranslateY, {
        toValue: 0,
        duration: e?.duration ?? 200,
        useNativeDriver: true,
      }).start();
      setKeyboardVisible(false);
    };

    const subShow = Keyboard.addListener(showEvent, onShow);
    const subHide = Keyboard.addListener(hideEvent, onHide);

    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [animatedTranslateY, insets.bottom, showEmoji]);

  // action modal handlers
  const openActionModal = (msg) => {
    setActionMsg(msg);
    setActionModalVisible(true);
  };
  const closeActionModal = () => {
    setActionModalVisible(false);
    setActionMsg(null);
  };

  const handleCopy = async () => {
    if (!actionMsg || actionMsg.type !== "text") return;
    try {
      const ClipboardModule = await import("expo-clipboard");
      if (ClipboardModule?.setStringAsync) {
        await ClipboardModule.setStringAsync(actionMsg.text || "");
        Alert.alert("Copied", "Message copied to clipboard.");
      }
    } catch (e) {
      Alert.alert("Copy failed", "Install expo-clipboard.");
    } finally {
      closeActionModal();
    }
  };

  const handleStartEdit = () => {
    if (!actionMsg) return;
    if (actionMsg.senderId !== parentUserId) {
      Alert.alert("Cannot edit", "You can only edit your own messages.");
      closeActionModal();
      return;
    }
    if (actionMsg.deleted) {
      Alert.alert("Cannot edit", "Message is deleted.");
      closeActionModal();
      return;
    }
    setEditingMessageId(actionMsg.messageId);
    setNewMessage(actionMsg.text || "");
    closeActionModal();
  };

  const handleConfirmDelete = () => {
    if (!actionMsg) return;
    if (actionMsg.senderId !== parentUserId) {
      Alert.alert("Cannot delete", "You can only delete your own messages.");
      closeActionModal();
      return;
    }
    Alert.alert("Delete", "Delete this message?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => handleDelete(actionMsg) },
    ]);
    closeActionModal();
  };

  const handleDelete = async (msg) => {
    if (!chatId || !msg || !msg.messageId) {
      Alert.alert("Error", "Missing data");
      return;
    }
    try {
      await update(ref(database, `Chats/${chatId}/messages/${msg.messageId}`), { deleted: true, text: "", imageUrl: null });
      const lastRef = ref(database, `Chats/${chatId}/lastMessage`);
      const lastSnap = await get(lastRef);
      if (lastSnap.exists() && Number(lastSnap.val().timeStamp || 0) === Number(msg.timeStamp || 0)) {
        await update(lastRef, { text: "This message was deleted" });
        try {
          const mu = {};
          mu[`UserChats/${parentUserId}/${chatId}/lastMessage/text`] = "This message was deleted";
          if (receiverUserId) mu[`UserChats/${receiverUserId}/${chatId}/lastMessage/text`] = "This message was deleted";
          await update(ref(database), mu);
        } catch (e) {}
      }
    } catch (err) {
      console.error("delete error", err);
      Alert.alert("Delete failed", err.message || "See console");
    }
  };

  // send or edit message
  const handleSend = async () => {
    if (!chatId || !parentUserId || !receiverUserId) return;
    const textTrim = newMessage.trim();

    if (editingMessageId) {
      try {
        const msgRef = ref(database, `Chats/${chatId}/messages/${editingMessageId}`);
        await update(msgRef, { text: textTrim, edited: true });
        const lastRef = ref(database, `Chats/${chatId}/lastMessage`);
        const lastSnap = await get(lastRef);
        const msgSnap = await get(msgRef);
        if (lastSnap.exists() && msgSnap.exists() && Number(lastSnap.val().timeStamp) === Number(msgSnap.val().timeStamp)) {
          await update(lastRef, { text: textTrim });
          try {
            await update(ref(database), {
              [`UserChats/${parentUserId}/${chatId}/lastMessage/text`]: textTrim,
              [`UserChats/${receiverUserId}/${chatId}/lastMessage/text`]: textTrim,
            });
          } catch (e) {}
        }
        setEditingMessageId(null);
        setNewMessage("");
        return;
      } catch (err) {
        console.error("edit failed", err);
        Alert.alert("Edit failed", "See console");
        return;
      }
    }

    if (!textTrim) return;
    try {
      const rootRef = ref(database, `Chats/${chatId}`);
      const newRef = push(ref(database, `Chats/${chatId}/messages`));
      const now = Date.now();
      const payload = {
        messageId: newRef.key,
        senderId: parentUserId,
        receiverId: receiverUserId,
        text: textTrim,
        imageUrl: null,
        replyTo: replyingTo?.messageId || null,
        seen: false,
        edited: false,
        deleted: false,
        timeStamp: now,
        type: "text",
      };
      await update(newRef, payload);

      const existingUnreadSnap = await get(ref(database, `Chats/${chatId}/unread/${receiverUserId}`));
      const receiverUnread = existingUnreadSnap.exists() ? existingUnreadSnap.val() + 1 : 1;

      await update(rootRef, {
        lastMessage: {
          text: textTrim,
          senderId: parentUserId,
          seen: false,
          timeStamp: now,
          type: "text",
        },
        unread: {
          [receiverUserId]: receiverUnread,
          [parentUserId]: 0,
        },
        participants: {
          [parentUserId]: true,
          [receiverUserId]: true,
        },
      });

      try {
        const lastMsgMirror = { text: textTrim, senderId: parentUserId, seen: false, timeStamp: now, type: "text" };
        const mu = {};
        mu[`UserChats/${parentUserId}/${chatId}`] = {
          otherUserId: receiverUserId,
          otherRecordId: receiverParamId,
          otherRole: receiverRole || "teacher",
          lastMessage: lastMsgMirror,
          unread: 0,
          timeStamp: now,
        };
        mu[`UserChats/${receiverUserId}/${chatId}`] = {
          otherUserId: parentUserId,
          otherRecordId: parentRecordId,
          otherRole: "parent",
          lastMessage: lastMsgMirror,
          unread: receiverUnread,
          timeStamp: now,
        };
        await update(ref(database), mu);
      } catch (e) {}

      setNewMessage("");
      setReplyingTo(null);
    } catch (err) {
      console.error("send failed", err);
      Alert.alert("Send failed", "See console");
    }
  };

  // pick image
  const handlePickImage = async () => {
    if (!chatId || !parentUserId || !receiverUserId) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission required", "We need access to your photos to send images.");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
      if (res.canceled) return;
      const uri = res.assets[0].uri;
      const blob = await (await fetch(uri)).blob();
      const storageReference = storageRef(storage, `chatImages/${Date.now()}.jpg`);
      await uploadBytes(storageReference, blob);
      const downloadURL = await getDownloadURL(storageReference);

      const rootRef = ref(database, `Chats/${chatId}`);
      const newRef = push(ref(database, `Chats/${chatId}/messages`));
      const now = Date.now();
      const payload = {
        messageId: newRef.key,
        senderId: parentUserId,
        receiverId: receiverUserId,
        text: "",
        imageUrl: downloadURL,
        replyTo: replyingTo?.messageId || null,
        seen: false,
        edited: false,
        deleted: false,
        timeStamp: now,
        type: "image",
      };
      await update(newRef, payload);

      const existingUnreadSnap = await get(ref(database, `Chats/${chatId}/unread/${receiverUserId}`));
      const receiverUnread = existingUnreadSnap.exists() ? existingUnreadSnap.val() + 1 : 1;

      await update(rootRef, {
        lastMessage: {
          text: "📷 Image",
          senderId: parentUserId,
          seen: false,
          timeStamp: now,
          type: "image",
        },
        unread: {
          [receiverUserId]: receiverUnread,
          [parentUserId]: 0,
        },
        participants: {
          [parentUserId]: true,
          [receiverUserId]: true,
        },
      });

      try {
        const lastMsgMirror = { text: "📷 Image", senderId: parentUserId, seen: false, timeStamp: now, type: "image" };
        const mu = {};
        mu[`UserChats/${parentUserId}/${chatId}`] = {
          otherUserId: receiverUserId,
          otherRecordId: receiverParamId,
          otherRole: receiverRole || "teacher",
          lastMessage: lastMsgMirror,
          unread: 0,
          timeStamp: now,
        };
        mu[`UserChats/${receiverUserId}/${chatId}`] = {
          otherUserId: parentUserId,
          otherRecordId: parentRecordId,
          otherRole: "parent",
          lastMessage: lastMsgMirror,
          unread: receiverUnread,
          timeStamp: now,
        };
        await update(ref(database), mu);
      } catch (e) {}

      setReplyingTo(null);
    } catch (err) {
      console.error("pick image failed", err);
      Alert.alert("Image send failed", "See console");
    }
  };

  // UI helpers: compute scroll index for a message (grouped list)
  const scrollToMessage = (msg) => {
    if (!msg || !groupedMessages?.length) return;
    const idx = groupedMessages.findIndex((g) => g.type === "message" && g.messageId === msg.messageId);
    if (idx === -1) return;
    // Data is reversed for the inverted FlatList; map to rendered index
    const targetIndex = groupedMessages.length - 1 - idx;
    InteractionManager.runAfterInteractions(() => {
      try {
        flatListRef.current?.scrollToIndex({ index: targetIndex, animated: true, viewPosition: 0.5 });
      } catch (e) {
        const estimate = approxLayout?.offsets?.[targetIndex] ?? Math.max(0, targetIndex * 90);
        flatListRef.current?.scrollToOffset({ offset: estimate, animated: true });
      }
    });
  };

  const renderGroupedItem = ({ item }) => {
    if (item.type === "date") {
      return (
        <View style={styles.dateSeparator}>
          <View style={styles.dateLine} />
          <View style={styles.dateBubble}>
            <Text style={styles.dateText}>{item.label}</Text>
          </View>
          <View style={styles.dateLine} />
        </View>
      );
    }
    const isSender = item.senderId === parentUserId;
    const index = messages.findIndex((m) => m.messageId === item.messageId);
    const prev = messages[index - 1];
    const showTail = !prev || prev.senderId !== item.senderId;
    const repliedMsg = item.replyTo ? messages.find((m) => m.messageId === item.replyTo) : null;

    return (
      <MessageBubble
        item={item}
        isSender={isSender}
        onLongPress={(m) => {
          setActionMsg(m);
          openActionModal(m);
        }}
        repliedMsg={repliedMsg}
        onPressReplyPreview={(m) => {
          scrollToMessage(m);
        }}
        showTail={showTail}
        highlightQuery={searchQuery}
        isCurrentMatch={currentMatchId === item.messageId}
      />
    );
  };

  const renderChatSkeletons = () => {
    const shimmerX = chatSkeletonAnim.interpolate({ inputRange: [0, 1], outputRange: [-120, 240] });
    const items = Array.from({ length: 8 }).map((_, i) => (
      <View key={`cs-${i}`} style={styles.chatSkeletonRow}>
        <View style={[styles.chatSkeletonBubble, i % 2 === 0 ? styles.chatSkeletonLeft : styles.chatSkeletonRight]}>
          <View style={styles.chatSkeletonLineWide} />
          <View style={styles.chatSkeletonLine} />
          <Animated.View style={[styles.chatSkeletonShimmer, { transform: [{ translateX: shimmerX }] }]} />
        </View>
      </View>
    ));
    return <View style={{ paddingHorizontal: 4, paddingTop: 16, paddingBottom: listBottomPadding }}>{items}</View>;
  };

  const headerSubtitle = () => {
    if (receiverTitle) return receiverTitle;
    if (receiverProfile?.status) return receiverProfile.status;
    return "last seen recently";
  };

  // Base bottom offset: keep composer position while trimming excess scroll padding
  // Always use the latest insets.bottom for safe area protection
  const safeBottom = insets.bottom;
  // Place composer directly above the safe area (no negative offset)
  // Move composer down a little (10px below safe area)
  const baseBottom = Math.max(safeBottom - 50, 0);
  // Reduce bottom padding to make message scroll area longer
  // Let messages scroll under the safe area and composer (like Telegram)
  // Add a small bottom padding so messages don't go fully behind the navigation bar
  // Ensure last message is always visible above the composer and navigation bar
  // Move up the message list: reduce bottom padding so last message sits closer to composer
  // Ensure last message is never overlapped by the composer: add extra bottom padding
  // Move the message list area up more by increasing extra bottom padding
  // Move up the bottom of the message list: only pad by composerHeight
  // Make the last message touch the composer exactly
  // Add extra gap between last message and composer
  const EXTRA_GAP = 40; // Adjust this value for a longer gap
  const listBottomPadding = composerHeight + (showEmoji ? 240 : 0) + EXTRA_GAP;

  return (
    <SafeAreaView style={styles.container} edges={["top", "right", "left", "bottom"]}>
      {/* Header */}
      {messagesLoading ? (
        <View style={styles.header}>
          <Animated.View style={[styles.headerSkeleton, { overflow: "hidden" }]}> 
            <Animated.View 
              style={[styles.headerSkeletonShimmer, { 
                transform: [{ translateX: chatSkeletonAnim.interpolate({ inputRange: [0, 1], outputRange: [-120, 240] }) }],
              }]} 
            />
          </Animated.View>
        </View>
      ) : (
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerLeft}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            {searchMode ? (
              <View style={styles.headerSearchWrap}>
                <Ionicons name="search" size={16} color="#64748b" style={{ marginRight: 6 }} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search"
                  placeholderTextColor="#94a3b8"
                  style={styles.headerSearchInput}
                  returnKeyType="search"
                  onSubmitEditing={jumpNext}
                  autoFocus
                />
                {!!matched.length && (
                  <Text style={styles.chatSearchCount}>{matchIndex + 1}/{matched.length}</Text>
                )}
              </View>
            ) : (
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.headerAvatarRow}
                onPress={() => {
                  const roleName = receiverRole === "Students"
                    ? "Student"
                    : receiverRole === "Teachers"
                    ? "Teacher"
                    : receiverRole === "Parents"
                    ? "Parent"
                    : receiverRole === "School_Admins"
                    ? "Admin"
                    : undefined;
                  router.push({
                    pathname: "/userProfile",
                    params: {
                      recordId: receiverParamId,
                      userId: receiverUserId,
                      roleName,
                    },
                  });
                }}
              >
                <Image
                  source={{ uri: receiverProfileImage || receiverProfile?.profileImage || "https://cdn-icons-png.flaticon.com/512/847/847969.png" }}
                  style={styles.headerAvatar}
                />
                <View style={{ marginLeft: 10 }}>
                  <Text style={styles.headerTitle}>{receiverName || receiverProfile?.name || "User"}</Text>
                  <Text style={styles.headerSubtitle}>{headerSubtitle()}</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.headerRight}>
            {searchMode ? (
              <>
                <TouchableOpacity style={styles.iconBtn} onPress={jumpPrev} disabled={!matched.length}>
                  <Ionicons name="chevron-up" size={18} color={matched.length ? "#0f172a" : "#cbd5e1"} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={jumpNext} disabled={!matched.length}>
                  <Ionicons name="chevron-down" size={18} color={matched.length ? "#0f172a" : "#cbd5e1"} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={() => { setSearchMode(false); setSearchQuery(""); setMatched([]); setMatchIndex(0); }}>
                  <Ionicons name="close" size={20} color="#222" />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={styles.iconBtn} onPress={() => {
                  setSearchMode(true);
                }}>
                  <Ionicons name="search" size={20} color="#222" />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 72 : 0}
      >
        <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
          <View style={{ flex: 1 }}>
            {/* Messages list */}
            {messagesLoading ? (
              renderChatSkeletons()
            ) : (
              <FlatList
                ref={flatListRef}
                data={reversedData}
                inverted
                keyExtractor={(item) => item.id ?? item.messageId}
                renderItem={renderGroupedItem}
                style={{ paddingTop: 32 }}
                contentContainerStyle={{ paddingHorizontal: -10, paddingTop: 32, paddingBottom: listBottomPadding }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                getItemLayout={(data, index) => {
                  const length = approxLayout.heights[index] ?? 90;
                  const offset = approxLayout.offsets[index] ?? index * 90;
                  return { length, offset, index };
                }}
                onScrollToIndexFailed={(info) => {
                  // Retry jump when virtualization has not measured the target row yet
                  const estimate = approxLayout.offsets[info.index] ?? Math.max(0, (info.averageItemLength || 90) * info.index);
                  flatListRef.current?.scrollToOffset({ offset: estimate, animated: true });
                  setTimeout(() => {
                    flatListRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
                  }, 60);
                }}
              />
            )}

            {/* Reply preview (above floating composer) */}
            {replyingTo && (
              <View style={[styles.replyingRow, { marginBottom: 8, marginHorizontal: 12, marginTop: 0 }]}>
                <View style={styles.replyingBar} />
                <View style={styles.replyingContent}>
                  <Text style={styles.replyingLabel}>Replying to</Text>
                  <Text style={styles.replyingPreview} numberOfLines={1}>
                    {replyingTo.deleted ? "This message was deleted" : replyingTo.type === "text" ? replyingTo.text : "📷 Photo"}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setReplyingTo(null)} style={styles.cancelReplyBtn}>
                  <Ionicons name="close" size={18} color="#333" />
                </TouchableOpacity>
              </View>
            )}

            {/* Floating composer: anchored at baseBottom and translated up by keyboard height */}
            <Animated.View
              style={[
                styles.floatingComposer,
                {
                  bottom: baseBottom,
                  transform: [{ translateY: animatedTranslateY }],
                },
              ]}
              onLayout={(e) => {
                const h = e.nativeEvent.layout.height;
                if (h && h !== composerHeight) setComposerHeight(h);
              }}
            >
              <View style={styles.floatingInner}>
                <TouchableOpacity onPress={handlePickImage} style={styles.composerLeft}>
                  <Ionicons name="attach" size={22} color="#666" />
                </TouchableOpacity>

                <View style={styles.inputWrapFloating}>
                  <TextInput
                    value={newMessage}
                    onChangeText={setNewMessage}
                    placeholder={editingMessageId ? "Edit message..." : "Message"}
                    style={styles.textInput}
                    multiline
                    returnKeyType="send"
                    onSubmitEditing={() => {
                      if (Platform.OS === "ios") handleSend();
                    }}
                  />
                </View>

                <View style={styles.composerRight}>
                  <TouchableOpacity onPress={() => setShowEmoji((s) => !s)} style={styles.iconBtn}>
                    <Ionicons name="happy-outline" size={22} color="#666" />
                  </TouchableOpacity>

                  <TouchableOpacity onPress={handleSend} style={[styles.sendButton, !newMessage.trim() && { opacity: 0.5 }]} disabled={!newMessage.trim()}>
                    <Ionicons name="send" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            </Animated.View>

            {/* Emoji picker */}
            {showEmoji && (
              <View style={{ height: 250 }}>
                <EmojiSelector onEmojiSelected={(emoji) => setNewMessage((prev) => prev + emoji)} showSearchBar={false} columns={8} />
              </View>
            )}
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {/* Action modal */}
      <Modal visible={actionModalVisible} animationType="fade" transparent onRequestClose={closeActionModal}>
        <TouchableWithoutFeedback onPress={closeActionModal}>
          <View style={modalStyles.backdrop}>
            <View style={modalStyles.sheet}>
              {actionMsg?.type === "text" && (
                <TouchableOpacity style={modalStyles.row} onPress={handleCopy}>
                  <Text style={modalStyles.rowText}>Copy</Text>
                </TouchableOpacity>
              )}

              {actionMsg?.senderId === parentUserId && actionMsg?.type === "text" && !actionMsg?.deleted && (
                <TouchableOpacity style={modalStyles.row} onPress={handleStartEdit}>
                  <Text style={modalStyles.rowText}>Edit</Text>
                </TouchableOpacity>
              )}

              {actionMsg?.senderId === parentUserId && !actionMsg?.deleted && (
                <TouchableOpacity style={modalStyles.row} onPress={handleConfirmDelete}>
                  <Text style={[modalStyles.rowText, { color: "red" }]}>Delete</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={modalStyles.row} onPress={closeActionModal}>
                <Text style={modalStyles.rowText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

// --- Styles (Telegram-inspired) ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#e6eef7" },

  header: {
    height: 72,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e6e6e6",
  },
  headerLeft: { width: 40 },
  headerCenter: { flex: 1, justifyContent: "center" },
  headerAvatarRow: { flexDirection: "row", alignItems: "center" },
  headerAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#ddd" },
  headerTitle: { fontSize: 16, fontWeight: "600", color: "#111" },
  headerSubtitle: { fontSize: 12, color: "#777" },
  headerRight: { flexDirection: "row", alignItems: "center" },
  iconBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  headerSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  headerSearchInput: { flex: 1, fontSize: 14, color: "#0f172a", paddingVertical: 0 },

  // Telegram-style bubbles
  tgRow: { marginVertical: 6, flexDirection: "row", alignItems: "flex-end" },
  tgAvatarSpacer: { width: 40 },

  tgReceiverBubble: {
    backgroundColor: "#fff",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderTopLeftRadius: 6,
    borderBottomRightRadius: 6,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  tgSenderBubble: {
    backgroundColor: "#1f8ef1",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 6,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 2,
  },
  tgSenderTail: {},
  tgReceiverTail: {},

  tgMessageText: { fontSize: 16, lineHeight: 20 },
  tgImage: { width: 200, height: 160, borderRadius: 12, marginBottom: 6 },

  tgMetaRow: { flexDirection: "row", alignSelf: "flex-end", alignItems: "center", marginTop: 6 },
  tgTime: { fontSize: 11, color: "#888" },
  editedHint: { fontSize: 10, color: "#dfefff" },

  replyPreview: { flexDirection: "row", alignItems: "center", paddingVertical: 6, paddingHorizontal: 8, borderRadius: 10, marginBottom: 6, backgroundColor: "rgba(0,0,0,0.03)" },
  replyBar: { width: 3, backgroundColor: "#a8c9ff", height: 36, borderRadius: 2, marginRight: 8 },
  replyText: { fontSize: 13, color: "#666" },

  deletedText: { fontStyle: "italic", color: "#888", fontSize: 15 },

  // date separator
  dateSeparator: { flexDirection: "row", alignItems: "center", marginVertical: 8 },
  dateLine: { flex: 1, height: 1, backgroundColor: "#ddd" },
  dateBubble: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#fff", borderRadius: 16, marginHorizontal: 8 },
  dateText: { color: "#666", fontSize: 12 },

  // replying preview above input
  replyingRow: { flexDirection: "row", alignItems: "center", padding: 8, backgroundColor: "#f1f6fb", borderLeftWidth: 4, borderLeftColor: "#1f8ef1", borderRadius: 10 },
  replyingBar: { width: 4, height: "100%", backgroundColor: "#1f8ef1", marginRight: 8 },
  replyingContent: { flex: 1 },
  replyingLabel: { fontSize: 12, color: "#777" },
  replyingPreview: { fontSize: 13, color: "#333" },
  cancelReplyBtn: { padding: 8 },

  // floating composer
  floatingComposer: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 50,
  },
  // highlight of matched text
  highlightText: {
    backgroundColor: "#ffec99",
    color: "#111",
    borderRadius: 3,
    paddingHorizontal: 2,
  },
  currentMatchOutline: {
    borderWidth: 1,
    borderColor: "#f59e0b",
  },
  currentMatchPulse: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderRadius: 14,
  },
  chatSkeletonRow: { flexDirection: "row", marginBottom: 14, paddingHorizontal: 8 },
  chatSkeletonBubble: {
    flex: 1,
    minHeight: 72,
    borderRadius: 18,
    backgroundColor: "#f1f5f9",
    padding: 14,
    position: "relative",
    overflow: "hidden",
  },
  chatSkeletonLeft: { marginRight: 30 },
  chatSkeletonRight: { marginLeft: 30 },
  chatSkeletonLineWide: { height: 12, borderRadius: 8, backgroundColor: "#e5e7eb", width: "70%", marginBottom: 10 },
  chatSkeletonLine: { height: 10, borderRadius: 8, backgroundColor: "#e5e7eb", width: "46%" },
  chatSkeletonShimmer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: -120,
    width: 160,
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  floatingInner: {
    backgroundColor: "#fff",
    borderRadius: 28,
    paddingHorizontal: 12,
    paddingVertical: 4, // decreased from 8
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 8,
  },
  composerLeft: { padding: 6 },
  inputWrapFloating: { flex: 1, marginHorizontal: 6, backgroundColor: "#f2f6fb", borderRadius: 20, paddingHorizontal: 12, paddingVertical: Platform.OS === "ios" ? 4 : 3, maxHeight: 140 },
  textInput: { fontSize: 16, padding: 0, color: "#111", minHeight: 28, maxHeight: 80 },
  composerRight: { flexDirection: "row", alignItems: "center" },
  sendButton: { backgroundColor: "#1f8ef1", borderRadius: 20, padding: 10, marginLeft: 8 },

  inputContainer: { flexDirection: "row", alignItems: "center" },
  // in-chat search bar
  chatSearchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  chatSearchInput: { flex: 1, color: "#0f172a", paddingVertical: 0, fontSize: 14 },
  chatSearchBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  chatSearchCount: { color: "#475569", fontSize: 12, marginHorizontal: 6 },
});

// modal styles
const modalStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", paddingBottom: Platform.OS === "ios" ? 34 : 12, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  row: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#eee" },
  rowText: { fontSize: 16 },
});