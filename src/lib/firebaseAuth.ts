import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";

// 初始化 Firebase 應用程式
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// 設定 Google OAuth 登入 Provider 與需要的 Google 雲端硬碟權限
export const provider = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/drive.file");
provider.addScope("https://www.googleapis.com/auth/userinfo.profile");
provider.addScope("https://www.googleapis.com/auth/userinfo.email");

// 登入狀態旗標
let isSigningIn = false;
// 快取於 LocalStorage 中的 Access Token 以便在重新整理網頁或切換分頁時維持 Google Drive 連線
let cachedAccessToken: string | null = (() => {
  try {
    return localStorage.getItem("google_drive_access_token");
  } catch (e) {
    return null;
  }
})();

/**
 * 初始化認證狀態監聽器，當頁面載入時調用。
 */
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        try {
          localStorage.removeItem("google_drive_access_token");
        } catch (e) {}
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      try {
        localStorage.removeItem("google_drive_access_token");
      } catch (e) {}
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * 點選登入按鈕觸發 Firebase signInWithPopup 流程，並抓取 OAuth Access Token
 */
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    
    if (!credential?.accessToken) {
      throw new Error("認證伺服器未回傳 Google 雲端硬碟 Access Token");
    }

    cachedAccessToken = credential.accessToken;
    try {
      localStorage.setItem("google_drive_access_token", cachedAccessToken);
    } catch (e) {}
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error("Google 帳號登入失敗:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * 取得當前已受權的 Google Access Token (記憶體保護)
 */
export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

/**
 * 登出並清除記憶體中的 Access Token 
 */
export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  try {
    localStorage.removeItem("google_drive_access_token");
  } catch (e) {}
};
export default app;
