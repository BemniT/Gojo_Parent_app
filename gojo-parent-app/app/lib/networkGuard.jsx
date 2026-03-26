import { Alert, Platform, ToastAndroid } from "react-native";
import { getNetworkStateAsync } from "expo-network";

export async function isInternetReachableNow() {
  try {
    const state = await getNetworkStateAsync();
    return Boolean(state.isConnected && state.isInternetReachable !== false);
  } catch {
    return false;
  }
}

export function showNoInternetMessage() {
  const msg = "No internet connection. Please check your network and try again.";
  if (Platform.OS === "android") {
    ToastAndroid.show(msg, ToastAndroid.SHORT);
  } else {
    Alert.alert("No Internet", msg);
  }
}

export async function requireInternet() {
  const online = await isInternetReachableNow();
  if (!online) {
    showNoInternetMessage();
    return false;
  }
  return true;
}