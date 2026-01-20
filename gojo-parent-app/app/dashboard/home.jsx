// app/dashboard/home.jsx
import { child, get, ref, update, query, orderByKey, limitToLast, endAt, onValue } from "firebase/database";
import { useEffect, useState, useRef, useCallback } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View, Animated, Modal, Alert, Share, Platform, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { database } from "../../constants/firebaseConfig";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { Image as ExpoImage } from "expo-image";
import * as Linking from "expo-linking";

const { width, height } = Dimensions.get("window");
const STRINGS = {
  copied: "Copied",
  failedCopy: "Failed to copy",
  shared: "Shared",
  shareCancelled: "Share cancelled",
  shareFailed: "Share failed",
  reported: "Reported",
  saved: "Saved to gallery",
  saveFailed: "Failed to save photo",
  loadFailed: "Failed to load posts",
  notReady: "Please wait while we load your profile.",
  likeFailed: "Could not update like",
};
const DEBUG_LOGS = false;
const trackEvent = (name, props = {}) => {
  if (DEBUG_LOGS) {
    console.log(`[analytics] ${name}`, props);
  }
};
const log = (...args) => {
  if (DEBUG_LOGS) console.log(...args);
};

const isValidHttpUrl = (url) => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (_) {
    return false;
  }
};

// 🔹 Double Tap Heart Component (moved outside to prevent recreation)
const DoubleTapHeart = ({ postId, likes, postUrl, likedPosts, handlePostTap, onDoubleTap }) => {
  const heartScale = useRef(new Animated.Value(0)).current;
  const [isAnimating, setIsAnimating] = useState(false);
  
  useEffect(() => {
    if (likedPosts[postId] && !isAnimating) {
      setIsAnimating(true);
      Animated.sequence([
        Animated.timing(heartScale, {
          toValue: 1.2,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(heartScale, {
          toValue: 0.8,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(heartScale, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Reset after animation completes
        setTimeout(() => {
          heartScale.setValue(0);
          setIsAnimating(false);
        }, 800);
      });
    }
  }, [likedPosts[postId]]);

  return (
    <TouchableOpacity 
      activeOpacity={1} 
      onPress={() => handlePostTap(postId, likes)}
      style={styles.imageContainer}
    >
      {postUrl && (
        <ExpoImage 
          source={{ uri: postUrl }} 
          style={styles.postImage} 
          contentFit="cover"
          transition={150}
        />
      )}
      
      {/* Heart Animation */}
      {likedPosts[postId] && (
        <Animated.View 
          style={[
            styles.heartOverlay,
            {
              transform: [{ scale: heartScale }]
            }
          ]}
        >
          <Text style={styles.heartIcon}>❤️</Text>
        </Animated.View>
      )}
    </TouchableOpacity>
  );
};

export default function Home() {
  const [posts, setPosts] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [oldestKey, setOldestKey] = useState(null);
  const [tick, setTick] = useState(0); // used to trigger re-render every minute
  const [loading, setLoading] = useState(true);
  const [likedPosts, setLikedPosts] = useState({}); // Track liked posts for animation
  const [menuVisible, setMenuVisible] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const router = useRouter();
  const [toast, setToast] = useState({ visible: false, message: "" });
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const showToast = useCallback((message) => {
      setToast({ visible: true, message });
      Animated.sequence([Animated.timing(toastOpacity, { toValue: 1, duration: 150, useNativeDriver: true }), Animated.delay(1200), Animated.timing(toastOpacity, { toValue: 0, duration: 200, useNativeDriver: true })]).start(() => setToast({ visible: false, message: "" }));
  }, [toastOpacity]);

  // Shimmer animation
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    const shimmer = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    shimmer.start();
    
    return () => shimmer.stop();
  }, []);

  const [parentUserId, setParentUserId] = useState(null);

  // Load parent user id used for likes
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const parentRecordId = await AsyncStorage.getItem("parentId");
        if (!parentRecordId || !mounted) return;
        const prSnap = await get(child(ref(database), `Parents/${parentRecordId}`));
        if (prSnap.exists()) {
          const uid = prSnap.val()?.userId;
          if (mounted) setParentUserId(uid);
        }
      } catch (e) {
        console.log("Error loading parent user id:", e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const PAGE_SIZE = 10;

  const mapPosts = useCallback((postsData, usersData, schoolAdminData) => {
    if (!postsData) return [];
    return Object.keys(postsData).map((postId) => {
      const post = postsData[postId] || {};

      let adminName = "School Admin";
      let adminImage = "https://cdn-icons-png.flaticon.com/512/847/847969.png";
      let adminRecordId = post.adminId || null;
      let adminUserId = null;

      if (adminRecordId && schoolAdminData[adminRecordId]) {
        const adminInfo = schoolAdminData[adminRecordId];
        adminUserId = adminInfo.userId;
        if (adminUserId && usersData[adminUserId]) {
          const userInfo = usersData[adminUserId];
          adminName = userInfo.name || userInfo.username || adminName;
          adminImage = userInfo.profileImage || adminImage;
        }
      }

      if (!adminUserId && post.userId && usersData[post.userId]) {
        adminUserId = post.userId;
        const userInfo = usersData[adminUserId];
        adminName = userInfo?.name || userInfo?.username || adminName;
        adminImage = userInfo?.profileImage || adminImage;
      }

      return {
        id: postId,
        message: post.message || "",
        postUrl: post.postUrl || null,
        time: post.time || "",
        likes: post.likes || {},
        likeCount: post.likeCount || 0,
        adminName,
        adminImage,
        adminId: adminRecordId,
        userId: adminUserId,
      };
    });
  }, []);

  const fetchPostsBatch = useCallback(async ({ reset = false, olderThanKey = null } = {}) => {
    if (loadingMore && !reset) return;
    if (!reset) setLoadingMore(true);
    else setRefreshing(true);
    if (reset) setHasMore(true);
    try {
      const postsRef = child(ref(database), "Posts");
      let postsQuery = query(postsRef, orderByKey(), limitToLast(PAGE_SIZE + (olderThanKey ? 1 : 0)));
      if (olderThanKey) {
        postsQuery = query(postsRef, orderByKey(), endAt(olderThanKey), limitToLast(PAGE_SIZE + 1));
      }

      const postsSnap = await get(postsQuery);
        if (!postsSnap.exists()) {
          if (reset) setPosts([]);
          setHasMore(false);
          return;
        }
      const postsData = postsSnap.val();
      // Sort keys descending so newest posts come first
      const keys = Object.keys(postsData).sort().reverse();

      let slicedKeys = keys;
      if (olderThanKey) {
        const dupIndex = slicedKeys.indexOf(olderThanKey);
        if (dupIndex !== -1) slicedKeys = slicedKeys.slice(dupIndex + 1); // drop the duplicate newest key
      }

      // take first PAGE_SIZE from the filtered keys (since reversed)
      const pageKeys = slicedKeys.slice(0, PAGE_SIZE);
      const trimmedPosts = pageKeys.reduce((acc, k) => ({ ...acc, [k]: postsData[k] }), {});

      const usersSnap = await get(child(ref(database), "Users"));
      const usersData = usersSnap.exists() ? usersSnap.val() : {};

      const schoolAdminSnap = await get(child(ref(database), "School_Admins"));
      const schoolAdminData = schoolAdminSnap.exists() ? schoolAdminSnap.val() : {};

      const mapped = mapPosts(trimmedPosts, usersData, schoolAdminData).sort((a, b) => (a.time || 0) - (b.time || 0));
      const newOldest = mapped.length ? mapped[0].id : oldestKey;

      setPosts((prev) => {
        const combined = reset ? mapped : [...prev, ...mapped];
        const dedup = combined.reduce((acc, item) => {
          acc.map[item.id] = item;
          acc.list.push(item.id);
          return acc;
        }, { map: {}, list: [] });
        const unique = Object.values(dedup.map).sort((a, b) => (b.time || 0) - (a.time || 0));
        return unique;
      });

      setOldestKey(newOldest || oldestKey);
      setHasMore(mapped.length >= PAGE_SIZE);
    } catch (error) {
      log("Error loading posts:", error);
      showToast(STRINGS.loadFailed);
    } finally {
      if (reset) setRefreshing(false);
      if (!reset) setLoadingMore(false);
      setLoading(false);
    }
  }, [PAGE_SIZE, loadingMore, mapPosts, oldestKey, showToast]);

  useEffect(() => {
    fetchPostsBatch({ reset: true });
  }, [fetchPostsBatch]);

  // Live updates for latest page
  useEffect(() => {
    const postsRef = child(ref(database), "Posts");
    const liveQuery = query(postsRef, orderByKey(), limitToLast(PAGE_SIZE));
    const unsubscribe = onValue(liveQuery, async (snap) => {
      if (!snap.exists()) return;
      try {
        const postsData = snap.val();
        const usersSnap = await get(child(ref(database), "Users"));
        const usersData = usersSnap.exists() ? usersSnap.val() : {};
        const schoolAdminSnap = await get(child(ref(database), "School_Admins"));
        const schoolAdminData = schoolAdminSnap.exists() ? schoolAdminSnap.val() : {};
          const mapped = mapPosts(postsData, usersData, schoolAdminData);
          setPosts((prev) => {
            // Only update posts that have changed, keep order
            const prevMap = prev.reduce((acc, item) => { acc[item.id] = item; return acc; }, {});
            const mappedMap = mapped.reduce((acc, item) => { acc[item.id] = item; return acc; }, {});
            return prev.map((item) => mappedMap[item.id] ? { ...item, ...mappedMap[item.id] } : item);
          });
      } catch (e) {
        log("Live update error:", e);
      }
    });
    return () => unsubscribe();
  }, [PAGE_SIZE, mapPosts]);

  // 🔹 Update tick every 1 minute for live time updates
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  // ❤️ Like / Unlike post
  const handleLike = useCallback(async (postId, likes) => {
    if (!parentUserId) {
      Alert.alert("Not ready", STRINGS.notReady);
      return;
    }
    const updatedLikes = { ...likes };
    const willLike = !updatedLikes[parentUserId];
    if (updatedLikes[parentUserId]) delete updatedLikes[parentUserId];
    else updatedLikes[parentUserId] = true;

    try {
      await update(ref(database, `Posts/${postId}`), {
        likes: updatedLikes,
        likeCount: Object.keys(updatedLikes).length,
      });

      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, likes: updatedLikes, likeCount: Object.keys(updatedLikes).length }
            : p
        )
      );

      trackEvent(willLike ? "post_liked" : "post_unliked", { postId });
    } catch (error) {
      log("Error updating like", error);
      showToast(STRINGS.likeFailed);
    }
  }, [parentUserId, showToast]);

  // 🔹 Handle double tap to like
  const handleDoubleTap = useCallback((postId, likes) => {
    // Trigger heart animation
    setLikedPosts(prev => ({ ...prev, [postId]: true }));
    
    // Remove animation after 1 second
    setTimeout(() => {
      setLikedPosts(prev => ({ ...prev, [postId]: false }));
    }, 1000);

    // Like the post if not already liked
    if (!likes[parentUserId]) {
      handleLike(postId, likes);
    }
    trackEvent("post_double_tap", { postId });
  }, [parentUserId, handleLike]);

  // 🔹 Handle menu actions
  const handleMenuPress = useCallback((post) => {
    setSelectedPost(post);
    setMenuVisible(true);
  }, []);
  const handleReport = useCallback(() => {
    Alert.alert(
      "Report Post",
      "Are you sure you want to report this post?",
      [
        { text: "Cancel", style: "cancel", onPress: () => setMenuVisible(false) },
        { text: "Report", onPress: () => { log("Post reported"); trackEvent("post_reported", { postId: selectedPost?.id }); showToast(STRINGS.reported); setMenuVisible(false); } },
      ]
    );
  }, [selectedPost, showToast]);

  const handleShare = useCallback(async () => {
    try {
      if (!selectedPost?.id) {
        showToast(STRINGS.shareFailed);
        return;
      }
      const deepLink = Linking.createURL(`/post/${selectedPost?.id || ""}`);
      const shareUrl = isValidHttpUrl(selectedPost?.postUrl) ? selectedPost?.postUrl : deepLink;
      const result = await Share.share({
        message: `Check out this post by ${selectedPost?.adminName || "Admin"}: ${selectedPost?.message || ""}\n${shareUrl}`,
        url: shareUrl,
      });
      if (result?.action === Share.sharedAction) {
        showToast(STRINGS.shared);
        trackEvent("post_shared", { postId: selectedPost.id, hasImage: Boolean(selectedPost.postUrl) });
      } else {
        showToast(STRINGS.shareCancelled);
        trackEvent("post_share_cancelled", { postId: selectedPost.id });
      }
    } catch (error) {
      log("Error sharing:", error);
      showToast(STRINGS.shareFailed);
    }
    setMenuVisible(false);
  }, [selectedPost, showToast]);

  const handleDownload = useCallback(async () => {
    try {
      log("Starting save profile photo...");
      const primaryImage = isValidHttpUrl(selectedPost?.postUrl) ? selectedPost.postUrl : null;
      const fallbackImage = isValidHttpUrl(selectedPost?.adminImage) ? selectedPost.adminImage : null;
      const imageUrl = primaryImage || fallbackImage;
      log("Selected image URL:", imageUrl);

      if (!imageUrl) {
        Alert.alert("Error", "No image available to save");
        return;
      }

      log("Requesting media library permissions...");
      // Request media library permissions
      const { status } = await MediaLibrary.requestPermissionsAsync();
      log("Permission status:", status);
      
      if (status === 'denied') {
        Alert.alert("Permission Required", "Please allow access to save photos to your gallery in Settings");
        return;
      }
      
      if (status !== 'granted') {
        // Try requesting again for undetermined status
        const { status: newStatus } = await MediaLibrary.requestPermissionsAsync();
        log("Second permission request status:", newStatus);
        
        if (newStatus !== 'granted') {
          Alert.alert("Permission Required", "Please allow access to save photos to your gallery");
          return;
        }
      }

      log("Creating download...");
      // Download image using the same approach as profile.jsx
      const fileName = `post_image_${selectedPost.id}_${Date.now()}.jpg`;
      log("Filename:", fileName);
      
      const fileUri = FileSystem.cacheDirectory + fileName;
      log("Download path:", fileUri);
      
      const downloadObject = FileSystem.downloadAsync(imageUrl, fileUri);
      log("Download started:", downloadObject);
      
      const { uri } = await downloadObject;
      log("Downloaded to:", uri);
      
      log("Creating asset...");
      // Save to device gallery
      const asset = await MediaLibrary.createAssetAsync(uri);
      log("Asset created:", asset);
      
      log("Creating album...");
      await MediaLibrary.createAlbumAsync('Gojo Profiles', asset, false);
      log("Album created");
      showToast(STRINGS.saved);
      trackEvent("post_image_saved", { postId: selectedPost?.id, hasPostImage: Boolean(primaryImage) });
      setMenuVisible(false);
    } catch (error) {
      log("Error saving photo:", error);
      log("Error details:", JSON.stringify(error, null, 2));
      showToast(STRINGS.saveFailed);
      trackEvent("post_image_save_failed", { postId: selectedPost?.id });
      setMenuVisible(false);
    }
  }, [selectedPost, showToast]);

  const handleCopyLink = useCallback(async () => {
    try {
      // Copy nothing to clipboard
      await Clipboard.setStringAsync("");
      showToast(STRINGS.copied);
      trackEvent("post_link_copied", { postId: selectedPost?.id });
    } catch (e) {
      showToast(STRINGS.failedCopy);
      trackEvent("post_link_copy_failed", { postId: selectedPost?.id });
    } finally {
      setMenuVisible(false);
    }
  }, [selectedPost, showToast]);

  const handleCloseMenu = useCallback(() => {
    setMenuVisible(false);
    setSelectedPost(null);
  }, []);

  // 🔹 Track tap timing for double tap detection
  const [lastTap, setLastTap] = useState({});
  
  const handlePostTap = useCallback((postId, likes) => {
    const now = Date.now();
    const lastTapTime = lastTap[postId] || 0;
    
    // Always update the last tap time first
    setLastTap(prev => ({ ...prev, [postId]: now }));
    
    // Check for double tap (within 300ms)
    if (now - lastTapTime < 300) {
      // Double tap detected
      handleDoubleTap(postId, likes);
    }
  }, [lastTap, handleDoubleTap]);

  // 🔹 Relative time helper
  const getRelativeTime = (postTime) => {
    const date = new Date(postTime);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return `${diff} sec ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)} day${Math.floor(diff / 86400) > 1 ? "s" : ""} ago`;
    if (diff < 31536000) return `${Math.floor(diff / 2592000)} month${Math.floor(diff / 2592000) > 1 ? "s" : ""} ago`;
    return `${Math.floor(diff / 31536000)} year${Math.floor(diff / 31536000) > 1 ? "s" : ""} ago`;
  };

  // 🔹 Render skeleton loading
  const renderSkeleton = useCallback(() => (
    <View style={styles.postCard}>
      {/* Header skeleton */}
      <View style={styles.header}>
        <Animated.View 
          style={[
            styles.avatar, 
            styles.skeleton,
            {
              opacity: shimmerAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.3, 0.7],
              }),
            }
          ]} 
        />
        <View style={styles.textContainer}>
          <Animated.View 
            style={[
              styles.skeletonText,
              styles.skeleton,
              {
                opacity: shimmerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.3, 0.7],
                }),
              }
            ]} 
          />
          <Animated.View 
            style={[
              styles.skeletonTextSmall,
              styles.skeleton,
              {
                opacity: shimmerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.3, 0.7],
                }),
              }
            ]} 
          />
        </View>
      </View>

      {/* Message skeleton */}
      <Animated.View 
        style={[
          styles.skeletonText,
          styles.skeleton,
          {
            opacity: shimmerAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.3, 0.7],
            }),
          }
        ]} 
      />
      
      {/* Image skeleton */}
      <Animated.View 
        style={[
          styles.skeletonImage,
          styles.skeleton,
          {
            opacity: shimmerAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.3, 0.7],
            }),
          }
        ]} 
      />

      {/* Like button skeleton */}
      <View style={styles.likeRow}>
        <Animated.View 
          style={[
            styles.skeletonButton,
            styles.skeleton,
            {
              opacity: shimmerAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.3, 0.7],
              }),
            }
            ]} 
        />
        <Animated.View 
          style={[
            styles.skeletonMessageIcon,
            styles.skeleton,
            {
              opacity: shimmerAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.3, 0.7],
              }),
            }
            ]} 
        />
        <Animated.View 
          style={[
            styles.skeletonTextSmall,
            styles.skeleton,
            {
              opacity: shimmerAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.3, 0.7],
              }),
            }
            ]} 
        />
      </View>
    </View>
  ), [shimmerAnim]);

  // 🔹 Render each post
  const renderPost = useCallback(({ item }) => {
    return (
      <View style={styles.postCard}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            activeOpacity={0.7}
            style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
            accessibilityRole="button"
            accessibilityLabel={`View profile for ${item.adminName}`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={() => {
              if (item.adminId || item.userId) {
                router.push({ pathname: "/userProfile", params: { recordId: item.adminId, userId: item.userId } });
              }
            }}
          >
            <ExpoImage 
              source={{ uri: item.adminImage }} 
              style={styles.avatar} 
              contentFit="cover"
              transition={150}
            />
            <View style={styles.headerInfo}>
              <Text style={styles.adminName}>{item.adminName}</Text>
              <Text style={styles.time}>{getRelativeTime(item.time)}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.menuButton}
            accessibilityRole="button"
            accessibilityLabel="Open post menu"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => handleMenuPress(item)}
          >
            <Ionicons name="ellipsis-vertical" size={20} color="#000" />
          </TouchableOpacity>
        </View>

        {/* Message */}
        {item.message !== "" && <Text style={styles.postText}>{item.message}</Text>}

        {/* Post Image with double tap */}
        <DoubleTapHeart 
          postId={item.id}
          likes={item.likes}
          postUrl={item.postUrl}
          likedPosts={likedPosts}
          handlePostTap={handlePostTap}
          onDoubleTap={() => handleDoubleTap(item.id, item.likes)}
        />

        {/* Like section */}
        <View style={styles.likeRow}>
          <TouchableOpacity 
            onPress={() => handleLike(item.id, item.likes)} 
            disabled={!parentUserId}
            accessibilityRole="button"
            accessibilityLabel={item.likes[parentUserId] ? "Unlike" : "Like"}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.likeBtn}>
              {item.likes[parentUserId] ? "❤️ Liked" : "🤍 Like"}
            </Text>
          </TouchableOpacity>
          <Text style={styles.likeCount}>{item.likeCount} likes</Text>
        </View>
      </View>
    );
  }, [handleLike, handleMenuPress, handlePostTap, handleDoubleTap, likedPosts, parentUserId]);

  return (
    <View style={styles.container}>
      <FlatList
        data={loading ? Array(5).fill({}) : posts}
        keyExtractor={(item, index) => loading ? `skeleton-${index}` : (item?.id || index.toString())}
        renderItem={loading ? renderSkeleton : renderPost}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={!loading && <Text style={styles.emptyText}>No posts available</Text>}
        contentContainerStyle={styles.listContent}
        initialNumToRender={6}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews={true}
        refreshing={refreshing}
        onRefresh={() => fetchPostsBatch({ reset: true })}
        onEndReached={() => {
          if (hasMore && !loadingMore && oldestKey) {
            fetchPostsBatch({ olderThanKey: oldestKey });
          }
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loadingMore ? <Text style={styles.loadingMore}>Loading more...</Text> : null}
      />
      
      {/* Menu Modal */}
      <Modal
        visible={menuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseMenu}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={handleCloseMenu}
        >
          <View style={styles.menuContainer}>
            <TouchableOpacity style={styles.menuItem} onPress={handleReport}>
              <Ionicons name="flag-outline" size={20} color="#000" />
              <Text style={styles.menuText}>Report Post</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleDownload}>
              <Ionicons name="download-outline" size={20} color="#000" />
              <Text style={styles.menuText}>Download</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleCopyLink}>
              <Ionicons name="link-outline" size={20} color="#000" />
              <Text style={styles.menuText}>Copy Link</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleCloseMenu}>
              <Ionicons name="close-outline" size={20} color="#000" />
              <Text style={styles.menuText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
      {toast.visible && (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]}> 
          <Text style={styles.toastText}>{toast.message}</Text>
        </Animated.View>
      )}
    </View>
  );
}

// 🔹 STYLES
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f0f2f5",
  },
  listContent: {
    paddingTop: width * 0.04, // 4% of screen width
    paddingBottom: width * 0.06, // 6% of screen width
    paddingHorizontal: width * 0.025, // 2.5% of screen width
  },
  postCard: {
    backgroundColor: "#fff",
    borderRadius: width * 0.03, // Responsive border radius
    marginBottom: width * 0.035, // Responsive margin
    padding: width * 0.025, // Responsive padding
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: width * 0.025,
  },
  headerInfo: {
    flex: 1,
    marginLeft: width * 0.025,
  },
  menuButton: {
    padding: width * 0.015,
  },
  avatar: {
    width: width * 0.11, // 11% of screen width
    height: width * 0.11, // Square avatar
    borderRadius: width * 0.055, // Half of width for circle
    marginRight: width * 0.025,
    backgroundColor: "#ddd",
  },
  adminName: {
    fontSize: width * 0.045, // Responsive name size
    fontWeight: "bold",
    color: "#050505",
    marginBottom: width * 0.01,
  },
  time: {
    fontSize: width * 0.032, // Responsive time font
    color: "#65676b",
    fontWeight: "400",
    marginBottom: width * 0.01,
  },
  postText: {
    fontSize: width * 0.035, // Responsive post font size
    marginVertical: width * 0.012,
    lineHeight: width * 0.06, // Responsive line height
    color: "#050505",
    fontWeight: "400",
  },
  postImage: {
    width: "100%",
    height: undefined,
    borderRadius: width * 0.02, // Responsive border radius
    resizeMode: "contain",
    backgroundColor: "#f0f0f0",
    minHeight: width * 0.5, // Responsive minimum height
  },
  likeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: width * 0.025,
  },
  likeBtn: {
    fontSize: width * 0.038, // Responsive font size
    fontWeight: "bold",
    color: "#1877f2",
  },
  likeCount: {
    fontSize: width * 0.032, // Responsive font size
    color: "gray",
  },
  emptyText: {
    textAlign: "center",
    marginTop: height * 0.15, // 15% of screen height
    fontSize: width * 0.04, // Responsive font size
    color: "gray",
  },
  loadingMore: {
    textAlign: 'center',
    paddingVertical: width * 0.04,
    color: 'gray',
  },
  // Skeleton loading styles
  skeleton: {
    backgroundColor: "#e1e1e1",
  },
  textContainer: {
    flex: 1,
  },
  skeletonText: {
    height: width * 0.04, // Responsive height
    borderRadius: width * 0.01, // Responsive border radius
    marginBottom: width * 0.015,
    width: "80%",
  },
  skeletonTextSmall: {
    height: width * 0.03, // Responsive height
    borderRadius: width * 0.01,
    width: "40%",
  },
  skeletonImage: {
    width: "100%",
    height: width * 0.5, // Responsive height
    borderRadius: width * 0.025,
    marginVertical: width * 0.015,
  },
  skeletonButton: {
    height: width * 0.05, // Responsive height
    width: width * 0.2,
    borderRadius: width * 0.01,
  },
  skeletonMessageIcon: {
    height: width * 0.05,
    width: width * 0.05,
    borderRadius: width * 0.01,
    marginLeft: width * 0.025,
  },
  imageContainer: {
    position: 'relative',
  },
  heartOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -width * 0.08, // Responsive positioning
    marginLeft: -width * 0.08,
    width: width * 0.16,
    height: width * 0.16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartIcon: {
    fontSize: width * 0.16, // Responsive font size
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  // Menu modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  menuContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: width * 0.05, // Responsive border radius
    borderTopRightRadius: width * 0.05,
    padding: width * 0.025,
    width: '100%',
    paddingBottom: width * 0.075, // Responsive padding
  },
  menuHeader: {
    height: width * 0.01, // Responsive height
    width: width * 0.1, // Responsive width
    backgroundColor: '#000',
    borderRadius: width * 0.005,
    alignSelf: 'center',
    marginBottom: width * 0.05,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: width * 0.04, // Responsive padding
    paddingHorizontal: width * 0.05, // Responsive padding
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  menuText: {
    fontSize: width * 0.04, // Responsive font size
    marginLeft: width * 0.04,
    color: '#000',
    fontWeight: '500',
  },
  menuCancel: {
    borderTopWidth: width * 0.02, // Responsive border width
    borderTopColor: '#f0f0f0',
  },
  toast: {
    position: 'absolute',
    bottom: width * 0.08,
    left: width * 0.05,
    right: width * 0.05,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingVertical: width * 0.03,
    paddingHorizontal: width * 0.04,
    borderRadius: width * 0.03,
    alignItems: 'center',
  },
  toastText: {
    color: '#fff',
    fontSize: width * 0.035,
    fontWeight: '500',
  },
});
