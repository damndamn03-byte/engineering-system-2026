import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Upload, 
  FileSpreadsheet, 
  FileText, 
  Calendar, 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw, 
  Download, 
  Cloud, 
  CloudLightning,
  LogOut, 
  Clock, 
  ArrowRight, 
  Edit3, 
  Plus, 
  Search, 
  Sliders,
  ChevronRight,
  Info,
  CalendarDays,
  FileCheck2,
  Trash2,
  Lock,
  Layers,
  Settings,
  ShieldCheck,
  TrendingUp,
  BarChart2,
  History,
  Workflow,
  X,
  Menu
} from "lucide-react";
import { Task, ProjectState, UserProfile } from "./types";
import { recalculateSchedule, filterTasksByPeriod, getDaysDifference, formatDate, addDays, parseDate } from "./utils/scheduler";
import { initAuth, googleSignIn, logout as firebaseLogout, getAccessToken } from "./lib/firebaseAuth";
import { findStateFile, loadStateFile, saveStateFile, listStateFiles, getFileNameForProject } from "./lib/googleDrive";
import { downloadScheduleCSV } from "./utils/csvGen";

// 內建示範工程排程：大樓營建新建工程
const DEMO_TASKS: Task[] = [
  {
    id: "T1",
    name: "地基與地下室安全支撐及土方開挖工程",
    duration: 15,
    startDate: "2026-06-15",
    endDate: "2026-06-29",
    progress: 100,
    predecessors: [],
    delayDays: 0,
    adjustedDuration: 15
  },
  {
    id: "T2",
    name: "主體結構鋼筋綁紮與混凝土澆置 (RC結構體)",
    duration: 25,
    startDate: "2026-06-30",
    endDate: "2026-07-24",
    progress: 75,
    predecessors: ["T1"],
    delayDays: 0,
    adjustedDuration: 25
  },
  {
    id: "T3",
    name: "外牆防水工程與砌磚粉刷施工",
    duration: 12,
    startDate: "2026-07-25",
    endDate: "2026-08-05",
    progress: 0,
    predecessors: ["T2"],
    delayDays: 0,
    adjustedDuration: 12
  },
  {
    id: "T4",
    name: "機電給排水與強弱電暗管配設工程",
    duration: 20,
    startDate: "2026-07-25",
    endDate: "2026-08-13",
    progress: 10,
    predecessors: ["T2"],
    delayDays: 0,
    adjustedDuration: 20
  },
  {
    id: "T5",
    name: "室內輕隔間與防火板材裝修施工",
    duration: 15,
    startDate: "2026-08-14",
    endDate: "2026-08-28",
    progress: 0,
    predecessors: ["T3", "T4"],
    delayDays: 0,
    adjustedDuration: 15
  },
  {
    id: "T6",
    name: "大樓消防自動警報系統與安全設備測試",
    duration: 8,
    startDate: "2026-08-29",
    endDate: "2026-09-05",
    progress: 0,
    predecessors: ["T5"],
    delayDays: 0,
    adjustedDuration: 8
  },
  {
    id: "T7",
    name: "公共景觀植栽佈置與人行道復舊工程",
    duration: 10,
    startDate: "2026-08-29",
    endDate: "2026-09-07",
    progress: 0,
    predecessors: ["T5"],
    delayDays: 0,
    adjustedDuration: 10
  },
  {
    id: "T8",
    name: "工程使照審查、專案驗收與完工移交作業",
    duration: 5,
    startDate: "2026-09-08",
    endDate: "2026-09-12",
    progress: 0,
    predecessors: ["T6", "T7"],
    delayDays: 0,
    adjustedDuration: 5
  }
];

export default function App() {
  // 當前系統基準時間 (預設日期為現實日期，以台灣時間計算)
  const getTaiwanToday = () => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    return formatter.format(now);
  };

  const cleanProjectName = (fileName: string) => {
    if (fileName === "engineering_schedule_state.json") {
      return "台北市信義區新建工程計畫 (預設)";
    }
    let clean = fileName.replace(/^engineering_schedule_state_/, "");
    clean = clean.replace(/\.json$/, "");
    return clean;
  };

  const [currentDate, setCurrentDate] = useState<string>(getTaiwanToday());

  // 專案主狀態
  const [projectName, setProjectName] = useState<string>("台北市信義區新建工程計畫");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [originalProjectEndDate, setOriginalProjectEndDate] = useState<string>("");
  const [finalProjectEndDate, setFinalProjectEndDate] = useState<string>("");

  // 上傳之來源檔記錄 (Geometric Sidebar 展示)
  const [sourceFileName, setSourceFileName] = useState<string>("台北市信義區新建工程.mpp");
  const [sourceFileSize, setSourceFileSize] = useState<string>("1.5 MB");

  // 登入與 Google 雲端硬碟狀態
  const [user, setUser] = useState<UserProfile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [driveFileId, setDriveFileId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "ready" | "failed">("idle");
  const [driveMessage, setDriveMessage] = useState<string>("");
  const [driveFiles, setDriveFiles] = useState<Array<{ id: string; name: string; modifiedTime?: string }>>([]);

  // UI 分頁與過濾 (Geometric Balance 整合過濾選項)
  const [activeFilter, setActiveFilter] = useState<"all" | "today" | "week_in" | "week_out" | "month_in" | "month_out" | "completed" | "delayed" | "affected" | "critical">("today");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [projectExtensionDays, setProjectExtensionDays] = useState<number>(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  // 不計工期日曆相關狀態
  const [excludedDates, setExcludedDates] = useState<string[]>([]);
  const [calYear, setCalYear] = useState<number>(2026);
  const [calMonth, setCalMonth] = useState<number>(5); // 預設 5 (6月)，因為示範專案是從 2026-06 開始
  const [isCalOpen, setIsCalOpen] = useState<boolean>(false);

  // 拖曳狀態
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // 初始化並載入
  useEffect(() => {
    // 預設讀展示
    const computed = recalculateSchedule(DEMO_TASKS, currentDate, 0, []);
    setTasks(computed.updatedTasks);
    setOriginalProjectEndDate(computed.originalProjectEndDate);
    setFinalProjectEndDate(computed.finalProjectEndDate);
    if (computed.updatedTasks.length > 0) {
      setSelectedTask(computed.updatedTasks[1]); // 預設聚焦結構體綁紮工項
    }

    // 啟動 Firebase
    const unsub = initAuth(
      async (firebaseUser, token) => {
        setAccessToken(token);
        setUser({
          email: firebaseUser.email || "",
          name: firebaseUser.displayName || "張經理",
          photoURL: firebaseUser.photoURL || undefined
        });
        loadFromGoogleDrive(token);
      },
      () => {
        setUser(null);
        setAccessToken(null);
        setDriveFileId(null);
        setSyncStatus("idle");
        setDriveMessage("");
        setDriveFiles([]);
      }
    );

    return () => unsub();
  }, []);

  // 自動將選取的工項在左右兩個獨立滾動容器中滾動到可見視窗，並讓它們上下居中對準，消除視覺位移
  useEffect(() => {
    if (selectedTask?.id) {
      const timer = setTimeout(() => {
        const leftRow = document.getElementById(`task-row-geometric-${selectedTask.id}`);
        if (leftRow) {
          leftRow.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        const rightRow = document.getElementById(`gantt-bar-container-${selectedTask.id}`);
        if (rightRow) {
          rightRow.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [selectedTask?.id]);

  // 重編排程 callback
  const handleTaskUpdate = (updatedTask: Task) => {
    const nextTasks = tasks.map(t => t.id === updatedTask.id ? updatedTask : t);
    const computed = recalculateSchedule(nextTasks, currentDate, projectExtensionDays, excludedDates);
    setTasks(computed.updatedTasks);
    setOriginalProjectEndDate(computed.originalProjectEndDate);
    setFinalProjectEndDate(computed.finalProjectEndDate);

    if (selectedTask && selectedTask.id === updatedTask.id) {
      const live = computed.updatedTasks.find(t => t.id === updatedTask.id);
      if (live) setSelectedTask(live);
    }

    if (accessToken) {
      autoSaveToDrive(accessToken, nextTasks, projectName);
    }
  };

  // 處理不計工期日期的切換
  const toggleExcludedDate = (dateStr: string) => {
    let nextExclusions: string[];
    if (excludedDates.includes(dateStr)) {
      nextExclusions = excludedDates.filter(d => d !== dateStr);
    } else {
      nextExclusions = [...excludedDates, dateStr];
    }
    setExcludedDates(nextExclusions);
    
    const computed = recalculateSchedule(tasks, currentDate, projectExtensionDays, nextExclusions);
    setTasks(computed.updatedTasks);
    setOriginalProjectEndDate(computed.originalProjectEndDate);
    setFinalProjectEndDate(computed.finalProjectEndDate);

    if (selectedTask) {
      const live = computed.updatedTasks.find(t => t.id === selectedTask.id);
      if (live) setSelectedTask(live);
    }

    if (accessToken) {
      autoSaveToDrive(accessToken, tasks, projectName, nextExclusions);
    }
  };

  // 清除所有不計工期日期
  const clearAllExcludedDates = () => {
    setExcludedDates([]);
    const computed = recalculateSchedule(tasks, currentDate, projectExtensionDays, []);
    setTasks(computed.updatedTasks);
    setOriginalProjectEndDate(computed.originalProjectEndDate);
    setFinalProjectEndDate(computed.finalProjectEndDate);

    if (selectedTask) {
      const live = computed.updatedTasks.find(t => t.id === selectedTask.id);
      if (live) setSelectedTask(live);
    }

    if (accessToken) {
      autoSaveToDrive(accessToken, tasks, projectName, []);
    }
  };

  // 生成日曆天數的輔助函式
  const getCalendarDays = (year: number, month: number) => {
    const firstDay = new Date(Date.UTC(year, month, 1));
    const startDayOfWeek = firstDay.getUTCDay();
    
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const prevMonthDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
    
    const days: Array<{ dateStr: string; isCurrentMonth: boolean; label: number }> = [];
    
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const m = month === 0 ? 11 : month - 1;
      const y = month === 0 ? year - 1 : year;
      const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({ dateStr, isCurrentMonth: false, label: d });
    }
    
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({ dateStr, isCurrentMonth: true, label: d });
    }
    
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      const m = month === 11 ? 0 : month + 1;
      const y = month === 11 ? year + 1 : year;
      const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({ dateStr, isCurrentMonth: false, label: d });
    }
    
    return days;
  };

  // 處理基準日變更與實時重算
  const handleCurrentDateChange = (newDate: string) => {
    setCurrentDate(newDate);
    const computed = recalculateSchedule(tasks, newDate, projectExtensionDays, excludedDates);
    setTasks(computed.updatedTasks);
    setOriginalProjectEndDate(computed.originalProjectEndDate);
    setFinalProjectEndDate(computed.finalProjectEndDate);

    if (selectedTask) {
      const live = computed.updatedTasks.find(t => t.id === selectedTask.id);
      if (live) setSelectedTask(live);
    }
  };

  // 處理工期展延天數變更與實時重算
  const handleExtensionChange = (days: number) => {
    setProjectExtensionDays(days);
    const computed = recalculateSchedule(tasks, currentDate, days, excludedDates);
    setTasks(computed.updatedTasks);
    setOriginalProjectEndDate(computed.originalProjectEndDate);
    setFinalProjectEndDate(computed.finalProjectEndDate);

    if (selectedTask) {
      const live = computed.updatedTasks.find(t => t.id === selectedTask.id);
      if (live) setSelectedTask(live);
    }
  };

  // 回復全案原設定 (delayDays、adjustedDuration、progress)，但工期展延天數維持不變
  const handleRestoreAllDefaults = () => {
    const resetTasks = tasks.map(t => ({
      ...t,
      delayDays: 0,
      adjustedDuration: t.duration,
    }));

    const computed = recalculateSchedule(resetTasks, currentDate, projectExtensionDays, excludedDates);
    setTasks(computed.updatedTasks);
    setOriginalProjectEndDate(computed.originalProjectEndDate);
    setFinalProjectEndDate(computed.finalProjectEndDate);

    if (selectedTask) {
      const live = computed.updatedTasks.find(t => t.id === selectedTask.id);
      if (live) setSelectedTask(live);
    }

    if (accessToken) {
      autoSaveToDrive(accessToken, resetTasks, projectName);
    }
  };

  // 回復單一工項原設定
  const handleRestoreSingleTask = (taskId: string) => {
    const nextTasks = tasks.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          delayDays: 0,
          adjustedDuration: t.duration,
        };
      }
      return t;
    });

    const computed = recalculateSchedule(nextTasks, currentDate, projectExtensionDays, excludedDates);
    setTasks(computed.updatedTasks);
    setOriginalProjectEndDate(computed.originalProjectEndDate);
    setFinalProjectEndDate(computed.finalProjectEndDate);

    const live = computed.updatedTasks.find(t => t.id === taskId);
    if (live) setSelectedTask(live);

    if (accessToken) {
      autoSaveToDrive(accessToken, nextTasks, projectName);
    }
  };

  // Google 雲端硬碟檔案列表讀取
  const fetchDriveFiles = async (token: string) => {
    try {
      const files = await listStateFiles(token);
      setDriveFiles(files);
    } catch (err: any) {
      const is401 = err?.message?.includes("401") || String(err).includes("401");
      if (is401) {
        console.warn("無法取得雲端工程案列表 (401 - 授權已過期)");
      } else {
        console.error("無法取得雲端工程案列表:", err);
      }
    }
  };

  // Google 雲端硬碟讀取
  const loadFromGoogleDrive = async (token: string) => {
    setSyncStatus("syncing");
    setDriveMessage("查詢備份進度中...");
    
    try {
      // 尋找當前專案對應的雲端檔名
      const currentFileName = getFileNameForProject(projectName);
      let fileInfo = await findStateFile(token, currentFileName);
      
      // 如果當前專案有自訂名稱但找不到，就嘗試找預設檔名
      if (!fileInfo && currentFileName !== "engineering_schedule_state.json") {
        fileInfo = await findStateFile(token, "engineering_schedule_state.json");
      }

      if (fileInfo) {
        setDriveFileId(fileInfo.id);
        setDriveMessage("正在下載雲端狀態...");
        
        const savedState = await loadStateFile(token, fileInfo.id);
        if (savedState) {
          setProjectName(savedState.projectName);
          if (savedState.sourceFileName) {
            setSourceFileName(savedState.sourceFileName);
          }
          const loadedExclusions = savedState.excludedDates || [];
          setExcludedDates(loadedExclusions);
          const computed = recalculateSchedule(savedState.tasks, currentDate, projectExtensionDays, loadedExclusions);
          setTasks(computed.updatedTasks);
          setOriginalProjectEndDate(computed.originalProjectEndDate);
          setFinalProjectEndDate(computed.finalProjectEndDate);
          
          setSyncStatus("ready");
          setDriveMessage("已同步最新進度");
        } else {
          setSyncStatus("failed");
          setDriveMessage("雲端設定解析失誤");
        }
      } else {
        setSyncStatus("idle");
        setDriveMessage("雲端備份尚未建立");
      }

      // 順便更新雲端的所有工程案檔案列表
      await fetchDriveFiles(token);
    } catch (err: any) {
      const is401 = err?.message?.includes("401") || String(err).includes("401");
      if (is401) {
        console.warn("下載雲端備份 - 授權過期 (401)");
        setSyncStatus("failed");
        setDriveMessage("雲端授權已過期，請重新登入連線");
        setAccessToken(null);
        setUser(null);
        setDriveFileId(null);
        firebaseLogout().catch(console.warn);
      } else {
        console.error("下載雲端備份失敗:", err);
        setSyncStatus("failed");
        setDriveMessage(`讀取失敗: ${err.message || "網路或授權問題"}`);
      }
    }
  };

  // 選擇並載入特定的雲端工程案
  const handleSelectDriveProject = async (fileId: string) => {
    if (!accessToken) return;
    setSyncStatus("syncing");
    setDriveMessage("切換工程案並下載中...");
    
    try {
      const savedState = await loadStateFile(accessToken, fileId);
      if (savedState) {
        setDriveFileId(fileId);
        setProjectName(savedState.projectName);
        if (savedState.sourceFileName) {
          setSourceFileName(savedState.sourceFileName);
        }
        const loadedExclusions = savedState.excludedDates || [];
        setExcludedDates(loadedExclusions);
        const computed = recalculateSchedule(savedState.tasks, currentDate, projectExtensionDays, loadedExclusions);
        setTasks(computed.updatedTasks);
        setOriginalProjectEndDate(computed.originalProjectEndDate);
        setFinalProjectEndDate(computed.finalProjectEndDate);
        
        if (computed.updatedTasks.length > 0) {
          setSelectedTask(computed.updatedTasks[0]);
        }
        
        setSyncStatus("ready");
        setDriveMessage(`已載入工程案「${savedState.projectName}」`);
      } else {
        setSyncStatus("failed");
        setDriveMessage("設定檔解析失敗");
      }
    } catch (err: any) {
      const is401 = err?.message?.includes("401") || String(err).includes("401");
      if (is401) {
        console.warn("切換雲端工程案 - 授權過期 (401)");
        setSyncStatus("failed");
        setDriveMessage("雲端授權已過期，請重新登入連線");
        setAccessToken(null);
        setUser(null);
        setDriveFileId(null);
        firebaseLogout().catch(console.warn);
      } else {
        console.error("切換雲端工程案失敗:", err);
        setSyncStatus("failed");
        setDriveMessage(`載入失敗: ${err.message || "網路問題"}`);
      }
    }
  };

  // Google 雲端手動存
  const handleSaveToDrive = async () => {
    if (!accessToken) return;
    setSyncStatus("syncing");
    setDriveMessage("正在與雲端同步...");

    try {
      const state: ProjectState = {
        projectName,
        tasks,
        lastUpdated: new Date().toISOString(),
        sourceFileName,
        excludedDates
      };
      
      const fileName = getFileNameForProject(projectName);
      const result = await saveStateFile(accessToken, state, driveFileId || undefined, fileName);
      setDriveFileId(result.id);
      setSyncStatus("ready");
      setDriveMessage("專案排程已儲存！");
      await fetchDriveFiles(accessToken);
    } catch (err: any) {
      const is401 = err?.message?.includes("401") || String(err).includes("401");
      if (is401) {
        console.warn("雲端備份 - 授權過期 (401)");
        setSyncStatus("failed");
        setDriveMessage("雲端授權已過期，請重新登入連線");
        setAccessToken(null);
        setUser(null);
        setDriveFileId(null);
        firebaseLogout().catch(console.warn);
      } else {
        console.error("雲端備份出錯:", err);
        setSyncStatus("failed");
        setDriveMessage(`備份失敗: ${err.message || "請授權或稍候重試"}`);
      }
    }
  };

  // 自動存
  const autoSaveToDrive = async (token: string, currentTasks: Task[], name: string, nextExclusions?: string[]) => {
    try {
      const state: ProjectState = {
        projectName: name,
        tasks: currentTasks,
        lastUpdated: new Date().toISOString(),
        sourceFileName,
        excludedDates: nextExclusions || excludedDates
      };
      const fileName = getFileNameForProject(name);
      
      // 在自動存前，先比對是否有該檔名之備份。如果有且 driveFileId 為空，就先嘗試查詢
      let currentFileId = driveFileId;
      if (!currentFileId) {
        const found = await findStateFile(token, fileName);
        if (found) currentFileId = found.id;
      }

      const result = await saveStateFile(token, state, currentFileId || undefined, fileName);
      setDriveFileId(result.id);
      setSyncStatus("ready");
      setDriveMessage("自動儲存成功");
      await fetchDriveFiles(token);
    } catch (e: any) {
      console.warn("背景儲存失敗:", e?.message || e);
      const is401 = e?.message?.includes("401") || String(e).includes("401");
      if (is401) {
        setSyncStatus("failed");
        setDriveMessage("雲端授權已過期，請重新登入連線");
        setAccessToken(null);
        setUser(null);
        setDriveFileId(null);
        firebaseLogout().catch(console.error);
      }
    }
  };

  // 登入
  const handleLogin = async () => {
    setIsLoggingIn(true);
    setUploadError(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setUser({
          email: res.user.email || "",
          name: res.user.displayName || "工務段經理",
          photoURL: res.user.photoURL || undefined
        });
        setAccessToken(res.accessToken);
        await loadFromGoogleDrive(res.accessToken);
      }
    } catch (err: any) {
      console.error(err);
      setUploadError("OAuth 雲端登入授權失敗。");
    } finally {
      setIsLoggingIn(false);
    }
  };

  // 登出
  const handleLogout = async () => {
    const ok = window.confirm("確定要登出並切斷雲端硬碟資料夾同調嗎？");
    if (ok) {
      await firebaseLogout();
    }
  };

  // 上傳解析
  const processFile = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);

    try {
      const reader = new FileReader();
      const fileDataPromise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64Data = result.split(",")[1] || result;
          resolve(base64Data);
        };
        reader.onerror = () => reject(new Error("無法讀取目標排程檔"));
        reader.readAsDataURL(file);
      });

      const base64Data = await fileDataPromise;
      setSourceFileName(file.name);
      
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      setSourceFileSize(`${sizeMb} MB`);

      const response = await fetch("/api/parse-schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          fileData: base64Data
        })
      });

      const responseText = await response.text();
      let parsedResult: any = null;
      try {
        parsedResult = JSON.parse(responseText);
      } catch (e) {
        console.error("Failed to parse response as JSON:", responseText);
        throw new Error(`伺服器回應格式不正確 (預期 JSON 格式，但收到 HTML 或非預期文字)。內容開頭為: ${responseText.slice(0, 150)}...`);
      }

      if (!response.ok) {
        throw new Error(parsedResult?.error || "AI 排程演算遭遇剖析瓶頸，請確認甘特圖架構");
      }

      if (parsedResult.projectName) {
        setProjectName(parsedResult.projectName);
      } else {
        setProjectName(file.name.replace(/\.[^/.]+$/, ""));
      }

      if (parsedResult.tasks && parsedResult.tasks.length > 0) {
        const computed = recalculateSchedule(parsedResult.tasks, currentDate, projectExtensionDays, excludedDates);
        setTasks(computed.updatedTasks);
        setOriginalProjectEndDate(computed.originalProjectEndDate);
        setFinalProjectEndDate(computed.finalProjectEndDate);
        
        if (computed.updatedTasks.length > 0) {
          setSelectedTask(computed.updatedTasks[0]);
        }
        
        if (accessToken) {
          autoSaveToDrive(accessToken, computed.updatedTasks, parsedResult.projectName || file.name);
        }
      } else {
        throw new Error("沒能抽取出任務或其相依代碼，請至調校台手動配置。");
      }

    } catch (err: any) {
      console.error(err);
      setUploadError(err.message || "檔案格式不符或 AI 解析逾時，請試用其他 XER 或 XLSX 排程表");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(true);
  };

  const handleDragLeave = () => {
    setIsDraggingFile(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // 篩選與搜尋
  const filteredTasks = filterTasksByPeriod(tasks, activeFilter, currentDate).filter(t => {
    if (!searchQuery) return true;
    return t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.id.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const delayDiff = getDaysDifference(originalProjectEndDate, finalProjectEndDate);
  const isDelayed = delayDiff > 0;

  // 算進度
  const totalTasksCount = tasks.length;
  const inProgressCount = tasks.filter(t => t.progress > 0 && t.progress < 100).length;
  const completedCount = tasks.filter(t => t.progress === 100).length;
  const delayedTasksCount = tasks.filter(t => 
    (t.delayDays || 0) > 0 || 
    (t.adjustedDuration !== undefined && t.adjustedDuration !== t.duration)
  ).length;

  // 取得專案全景最快與最慢日期，用於甘特圖的絕對比例寬度計算 (真實可互動甘特圖)
  const getGanttTimelineRange = () => {
    if (tasks.length === 0) return { minTime: 0, maxTime: 0, totalDays: 1 };
    
    const startTimes = tasks.map(t => parseDate(t.calculatedStartDate || t.startDate).getTime());
    const endTimes = tasks.map(t => parseDate(t.calculatedEndDate || t.endDate).getTime());
    
    const minTime = Math.min(...startTimes);
    const maxTime = Math.max(...endTimes);
    const totalDays = Math.max(1, Math.round((maxTime - minTime) / (1000 * 60 * 60 * 24)) + 1);
    
    return { minTime, maxTime, totalDays };
  };

  const { minTime, totalDays } = getGanttTimelineRange();

  // 計算每個工項在甘特甘特橫條寬度與定位偏移
  const getGanttBarMeta = (task: Task) => {
    if (tasks.length === 0) return { leftPercent: 0, widthPercent: 0 };
    
    const taskStart = parseDate(task.calculatedStartDate || task.startDate).getTime();
    const taskEnd = parseDate(task.calculatedEndDate || task.endDate).getTime();
    const duration = Math.max(1, Math.round((taskEnd - taskStart) / (1000 * 60 * 60 * 24)) + 1);
    
    const leftOffsetDays = Math.round((taskStart - minTime) / (1000 * 60 * 60 * 24));
    
    // 放大成百分比
    const leftPercent = (leftOffsetDays / totalDays) * 100;
    const widthPercent = (duration / totalDays) * 100;
    
    return { leftPercent, widthPercent };
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-100 text-slate-800 font-sans antialiased selection:bg-indigo-100">
      
      {/* Top Navigation Header - Geometric Balance Style */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 shadow-xs sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button 
            id="mobile-sidebar-toggle"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-indigo-600 rounded hover:bg-slate-100 transition focus:outline-hidden cursor-pointer"
            title="開啟功能選單"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center text-white font-extrabold shadow-md shadow-indigo-100 shrink-0">C</div>
          <div className="flex flex-col">
            <h1 className="text-lg font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
              ProjectEngine CPM <span className="text-slate-400 font-normal text-xs font-mono bg-slate-100 py-0.5 px-2 rounded-full border border-slate-200">v4.2</span>
            </h1>
            <span className="text-[10px] text-slate-400 font-mono -mt-1">CPM 關鍵路徑排程重構演算法</span>
          </div>
        </div>

        {/* 頂部中段：系統時間展示 */}
        <div className="hidden md:flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-mono text-xs text-slate-600">
          <Calendar className="w-3.5 h-3.5 text-indigo-500" />
          <span>模擬基準日:</span>
          <input 
            id="header-date-input"
            type="date"
            value={currentDate}
            onChange={(e) => handleCurrentDateChange(e.target.value)}
            className="bg-white border-xs border-slate-200 rounded px-1.5 py-0.5 font-bold focus:outline-hidden text-slate-800 focus:border-indigo-500"
          />
        </div>

        {/* 頂部右側：Google 雲端同步/帳號區 */}
        <div className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs font-bold text-slate-800">{user.name}</p>
                <p className="text-[10px] text-slate-500 flex items-center justify-end gap-1 font-mono font-semibold">
                  <span className={`w-1.5 h-1.5 rounded-full ${syncStatus === 'ready' ? 'bg-emerald-500' : syncStatus === 'syncing' ? 'bg-indigo-500 animate-pulse' : 'bg-rose-500'}`}></span>
                  {driveMessage || "雲端已連線"}
                </p>
              </div>
              <div className="w-9 h-9 rounded-full bg-indigo-100 border border-slate-200 overflow-hidden shadow-xs relative group cursor-pointer">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-indigo-700 font-bold text-sm">
                    {user.name.charAt(0)}
                  </div>
                )}
                <div 
                  onClick={handleLogout}
                  className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white"
                  title="登出 Google"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          ) : (
            <button
              id="top-gsi-btn"
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="px-3.5 py-1.5 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <CloudLightning className="w-3.5 h-3.5" />
              <span>{isLoggingIn ? "安全性驗證中..." : "連結雲端讀寫之前的進度"}</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Structural Body */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* Mobile Sidebar Backdrop Overlay */}
        {isSidebarOpen && (
          <div 
            id="mobile-sidebar-backdrop"
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-slate-950/60 z-30 lg:hidden"
          />
        )}
        
        {/* Left Side Sidebar - Geometric Balance Design */}
        <aside className={`fixed lg:relative top-16 lg:top-0 bottom-0 left-0 z-40 w-64 bg-slate-900 text-slate-400 p-5 flex flex-col justify-between shrink-0 border-r border-slate-800 transition-transform duration-300 ease-in-out ${isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
          <div className="space-y-6 flex-1">
            
            {/* Active Project Card */}
            <section>
              <p className="text-[9px] uppercase tracking-widest font-extrabold text-slate-500 mb-2.5">Active Project / 目標專案計畫</p>
              <div className="p-3 bg-slate-800 rounded-lg border border-slate-700 select-none space-y-3">
                <div>
                  <p className="text-white text-sm font-bold truncate leading-snug">{projectName}</p>
                  <div className="flex justify-between items-center mt-1 text-[10px] text-slate-400 font-mono">
                    <span>檔案天數: {totalDays}d </span>
                    <span className="text-indigo-400 font-bold">工項: {tasks.length}x</span>
                  </div>
                </div>

                {/* 雲端工程案快選切換 */}
                {user && (
                  <div className="pt-2.5 border-t border-slate-700/60">
                    <label className="block text-[9px] text-indigo-400 font-extrabold mb-1.5 uppercase tracking-wider">
                      📁 雲端備份工程案選單
                    </label>
                    {driveFiles.length > 0 ? (
                      <select
                        id="select-drive-project"
                        onChange={(e) => {
                          if (e.target.value) {
                            handleSelectDriveProject(e.target.value);
                          }
                        }}
                        className="w-full bg-slate-900 border border-slate-700 hover:border-indigo-500 text-slate-200 font-semibold text-[11px] rounded px-2 py-1.5 focus:outline-hidden transition cursor-pointer"
                        value={driveFiles.find(f => cleanProjectName(f.name) === projectName)?.id || ""}
                      >
                        <option value="" disabled>-- 切換備份工程案 --</option>
                        {driveFiles.map(file => {
                          const name = cleanProjectName(file.name);
                          return (
                            <option key={file.id} value={file.id}>
                              {name}
                            </option>
                          );
                        })}
                      </select>
                    ) : (
                      <span className="text-[10px] text-slate-500 block italic">（尚未建立任何雲端備份）</span>
                    )}
                  </div>
                )}
              </div>
            </section>
            
            {/* Source Files Section */}
            <section>
              <p className="text-[9px] uppercase tracking-widest font-extrabold text-slate-500 mb-2.5">Source Files / 匯入依據</p>
              <ul className="space-y-2">
                <li className="flex items-center gap-3 text-xs text-slate-200 bg-slate-800/40 p-2 rounded border border-slate-800 hover:border-slate-700 transition">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                  <div className="flex-1 truncate">
                    <p className="font-bold truncate" title={sourceFileName}>{sourceFileName}</p>
                    <p className="text-[10px] text-slate-500 font-mono">{sourceFileSize} • 包含相依網圖</p>
                  </div>
                </li>
                <li className="flex items-center gap-2.5 text-xs text-slate-500 p-1.5 pl-2">
                  <CheckCircle className="w-3 h-3 text-indigo-500" />
                  <span>AI 甘特圖關係自動定錨</span>
                </li>
              </ul>
            </section>

            {/* 時限範圍過濾導航 (Tab Links on Left Panel for Geometric Look) */}
            <section>
              <p className="text-[9px] uppercase tracking-widest font-extrabold text-slate-500 mb-2">Display Filter / 實時進行區間</p>
              <nav className="space-y-1">
                {[
                  { id: "all", label: "全部載入工項", count: tasks.length },
                  { id: "completed", label: "已完工工項", count: filterTasksByPeriod(tasks, "completed", currentDate).length },
                  { id: "today", label: "今日正在進行", count: filterTasksByPeriod(tasks, "today", currentDate).length },
                  { id: "week_in", label: "未來 1 週內進行", count: filterTasksByPeriod(tasks, "week_in", currentDate).length },
                  { id: "week_out", label: "未來 1 週後開工", count: filterTasksByPeriod(tasks, "week_out", currentDate).length },
                  { id: "month_in", label: "未來 1 個月內進行", count: filterTasksByPeriod(tasks, "month_in", currentDate).length },
                  { id: "month_out", label: "未來 1 個月後開工", count: filterTasksByPeriod(tasks, "month_out", currentDate).length },
                  { id: "delayed", label: "🚨 延宕工項", count: filterTasksByPeriod(tasks, "delayed", currentDate).length },
                  { id: "affected", label: "⚠️ 受影響工項", count: filterTasksByPeriod(tasks, "affected", currentDate).length },
                  { id: "critical", label: "🔥 要徑工項", count: filterTasksByPeriod(tasks, "critical", currentDate).length }
                ].map(item => (
                  <button
                     key={item.id}
                     id={`sidebar-tab-${item.id}`}
                     onClick={() => setActiveFilter(item.id as any)}
                     className={`w-full text-left py-2 px-3 rounded text-xs transition duration-150 flex items-center justify-between cursor-pointer ${
                       activeFilter === item.id
                         ? item.id === "delayed"
                           ? "bg-rose-600 text-white font-extrabold shadow-sm shadow-rose-950/40"
                           : item.id === "affected"
                           ? "bg-amber-600 text-white font-extrabold shadow-sm shadow-amber-950/40"
                           : item.id === "critical"
                           ? "bg-purple-600 text-white font-extrabold shadow-sm shadow-purple-950/40"
                           : "bg-indigo-600 text-white font-extrabold shadow-sm shadow-indigo-950/40"
                         : "hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                     }`}
                  >
                     <span>{item.label}</span>
                     <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                       activeFilter === item.id
                         ? "bg-white/20 text-white"
                         : "bg-slate-800/80 text-slate-400"
                     }`}>
                       {item.count}
                     </span>
                  </button>
                ))}
              </nav>
            </section>

            {/* Actions / 重置、上傳、匯出 */}
            <section className="space-y-2 pt-2 border-t border-slate-800">
              <p className="text-[9px] uppercase tracking-widest font-extrabold text-slate-500 mb-1.5">Action Tools / 進度管理操作</p>
              
              <input 
                id="sidebar-file-selector"
                type="file" 
                accept=".mpp,.xer,.xlsx,.pdf,.txt,.csv" 
                onChange={handleFileChange} 
                className="hidden" 
              />
              <button 
                id="sidebar-upload-btn"
                onClick={() => document.getElementById("sidebar-file-selector")?.click()}
                disabled={isUploading}
                className="w-full text-left py-2 px-3 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-semibold flex items-center gap-2 cursor-pointer transition duration-150 disabled:opacity-40"
              >
                {isUploading ? <RefreshCw className="w-3.5 h-3.5 animate-spin"/> : <Upload className="w-3.5 h-3.5" />}
                上傳甘特圖規畫檔
              </button>

              <button 
                id="sidebar-demo-btn"
                onClick={() => {
                  setExcludedDates([]);
                  setProjectExtensionDays(0);
                  const computed = recalculateSchedule(DEMO_TASKS, currentDate, 0, []);
                  setProjectName("台北市信義區新建工程計畫");
                  setSourceFileName("台北市信義區新建工程計畫.mpp");
                  setTasks(computed.updatedTasks);
                  setOriginalProjectEndDate(computed.originalProjectEndDate);
                  setFinalProjectEndDate(computed.finalProjectEndDate);
                }}
                className="w-full text-left py-2 px-3 bg-slate-800/45 hover:bg-slate-800 text-slate-300 rounded text-xs font-medium flex items-center gap-2 cursor-pointer transition"
              >
                <History className="w-3.5 h-3.5" />
                還原載入示範專案
              </button>

              {tasks.length > 0 && (
                <button 
                  id="sidebar-export-btn"
                  onClick={() => downloadScheduleCSV(projectName, tasks)}
                  className="w-full text-left py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold flex items-center gap-2 cursor-pointer transition shadow-xs shadow-indigo-950/20"
                >
                  <Download className="w-3.5 h-3.5" />
                  匯出 Excel 工期重算報表
                </button>
              )}
            </section>
          </div>
          
          {/* Bottom Sidebar Status */}
          <div className="pt-4 border-t border-slate-800">
            <div className="flex items-center justify-between text-[9px] uppercase tracking-wider mb-1.5 text-slate-500">
              <span className="flex items-center gap-1">
                <Workflow className="w-3 h-3 text-indigo-500" /> CPM Engine
              </span>
              <span className="text-emerald-500 font-bold">Online</span>
            </div>
            <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
              <div className="bg-indigo-500 h-full w-full"></div>
            </div>
          </div>
        </aside>

        {/* Right Main Content Area */}
        <main className="flex-1 p-3 md:p-6 flex flex-col gap-4 md:gap-6 overflow-y-auto relative">
          
          {/* Mobile Only: Sticky Top Project & Display Filter Bar */}
          <div className="md:hidden sticky top-0 z-20 bg-slate-900 text-white rounded-xl p-4 shadow-md flex flex-col gap-3 border border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest font-extrabold text-indigo-400">📁 目標專案計畫</span>
              <span className="text-[10px] font-mono text-slate-400">工項: {tasks.length}x</span>
            </div>
            <h2 className="text-sm font-bold truncate leading-snug">{projectName}</h2>
            
            <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-800/60">
              <label htmlFor="mobile-filter-select" className="text-[9px] text-indigo-400 font-extrabold uppercase tracking-wider">
                🔍 選擇實時進行區間
              </label>
              <select
                id="mobile-filter-select"
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 text-slate-200 font-bold text-xs rounded px-2.5 py-2 focus:outline-hidden focus:border-indigo-500 transition cursor-pointer"
              >
                <option value="today">今日正在進行 (預設)</option>
                <option value="all">全部載入工項</option>
                <option value="completed">已完工工項</option>
                <option value="week_in">未來 1 週內進行</option>
                <option value="week_out">未來 1 週後開工</option>
                <option value="month_in">未來 1 個月內進行</option>
                <option value="month_out">未來 1 個月後開工</option>
                <option value="delayed">🚨 延宕工項</option>
                <option value="affected">⚠️ 受影響工項</option>
                <option value="critical">🔥 要徑工項</option>
              </select>
            </div>
          </div>
          
          {/* Dashboard Stats Panel - Geometric Balance Design */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 shrink-0">
            
            {/* Stat 1: 進行工項項目 */}
            <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
              <p className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider mb-1">正在進行中/可施工工項</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-slate-950 font-mono">
                  {filterTasksByPeriod(tasks, "today", currentDate).length}
                </span>
                <span className="text-xs text-slate-400">/ 總共 {tasks.length} 個</span>
              </div>
              <p className="text-[10px] text-emerald-600 font-medium mt-1.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span> 
                {completedCount} 個工項已完工 (100%)
              </p>
            </div>

            {/* Stat 2: 延期警示 與 不計工期日曆設定 */}
            <div id="stat-2-calendar-card" className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs relative flex flex-col justify-between min-h-[140px]">
              <div>
                <p className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider mb-1">工序延誤微調警報</p>
                <div className="flex items-baseline gap-2">
                  <span className={`text-3xl font-extrabold font-mono ${delayedTasksCount > 0 ? "text-amber-500" : "text-slate-900"}`}>
                    {String(delayedTasksCount).padStart(2, "0")}
                  </span>
                  <span className="text-xs text-slate-400">個受人為延遲</span>
                </div>
                
                {/* 顯示目前設定不計工期天數 */}
                <div className="mt-2 pt-1.5 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-slate-500 font-bold">已設定不計工期：</span>
                    <span className="text-xs font-extrabold text-amber-600 font-mono bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                      {excludedDates.length} 天
                    </span>
                  </div>
                  
                  {/* 已選日期標籤列表 */}
                  <div className="flex flex-wrap gap-1 max-h-[44px] overflow-y-auto mt-1 pr-0.5">
                    {excludedDates.length === 0 ? (
                      <span className="text-[10px] text-slate-400 font-normal italic">尚未設定排除日期</span>
                    ) : (
                      [...excludedDates].sort().map(d => (
                        <span key={d} className="inline-flex items-center gap-1 text-[9px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded transition">
                          {d.slice(5)}
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExcludedDate(d);
                            }}
                            className="text-slate-400 hover:text-red-500 font-extrabold text-[10px] cursor-pointer"
                          >
                            ×
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* 彈出日曆按鈕與下拉日曆 */}
              <div className="mt-2 relative">
                <button
                  onClick={() => setIsCalOpen(!isCalOpen)}
                  className="w-full py-1 px-2.5 bg-slate-950 hover:bg-slate-850 text-white rounded text-[10px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
                >
                  <CalendarDays className="w-3 h-3 text-amber-400" />
                  {isCalOpen ? "收合設定日曆" : "點選日曆排除工期"}
                </button>

                {/* Collapsible Mini-Calendar Popover / Dropdown */}
                {isCalOpen && (
                  <div className="absolute left-0 right-0 bottom-full mb-2 bg-white border border-slate-200 rounded-lg p-2.5 shadow-xl z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                    <div className="flex items-center justify-between mb-2">
                      <button
                        onClick={() => {
                          if (calMonth === 0) {
                            setCalMonth(11);
                            setCalYear(calYear - 1);
                          } else {
                            setCalMonth(calMonth - 1);
                          }
                        }}
                        className="p-1 hover:bg-slate-100 rounded text-xs text-slate-500 font-extrabold cursor-pointer"
                      >
                        &lt;
                      </button>
                      <span className="text-[11px] font-extrabold text-slate-800">
                        {calYear}年 {calMonth + 1}月
                      </span>
                      <button
                        onClick={() => {
                          if (calMonth === 11) {
                            setCalMonth(0);
                            setCalYear(calYear + 1);
                          } else {
                            setCalMonth(calMonth + 1);
                          }
                        }}
                        className="p-1 hover:bg-slate-100 rounded text-xs text-slate-500 font-extrabold cursor-pointer"
                      >
                        &gt;
                      </button>
                    </div>

                    {/* 星期標頭 */}
                    <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] font-bold text-slate-400 mb-1">
                      <span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span>
                    </div>

                    {/* 日期格 */}
                    <div className="grid grid-cols-7 gap-0.5">
                      {getCalendarDays(calYear, calMonth).map((day, idx) => {
                        const isExcluded = excludedDates.includes(day.dateStr);
                        return (
                          <button
                            key={idx}
                            onClick={() => toggleExcludedDate(day.dateStr)}
                            className={`
                              h-5 text-[9px] font-bold rounded flex items-center justify-center transition cursor-pointer
                              ${!day.isCurrentMonth ? "text-slate-300" : ""}
                              ${isExcluded 
                                ? "bg-amber-500 hover:bg-amber-600 text-white shadow-xs" 
                                : "hover:bg-slate-100 text-slate-700 bg-slate-50/50"
                              }
                            `}
                            title={day.dateStr}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* 快速清除與說明 */}
                    <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[8px] text-slate-400 leading-none">橘色格為排除日</span>
                      {excludedDates.length > 0 && (
                        <button
                          onClick={clearAllExcludedDates}
                          className="text-[8px] text-red-500 hover:text-red-700 font-extrabold cursor-pointer uppercase tracking-wider"
                        >
                          全部清除
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Stat 3: 專案預定最終工期與展延 */}
            <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs flex flex-col justify-between">
              <div>
                <p className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider mb-1">關鍵路徑與重算工期</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-extrabold text-indigo-600 font-mono">{totalDays}d</span>
                  <span className="text-xs text-slate-400">預估完工日: {finalProjectEndDate || "計算中"}</span>
                </div>
                <p className={`text-[10px] font-bold mt-1.5 flex items-center gap-1 ${isDelayed ? "text-rose-500" : "text-emerald-600"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isDelayed ? "bg-rose-500 animate-ping" : "bg-emerald-500"}`}></span> 
                  {isDelayed ? `受工期推遲衝擊: 展延 ${delayDiff} 天` : "本計畫按原始甘特時段運行"}
                </p>
              </div>

              {/* 工期展延天數控制 */}
              <div className="hidden md:flex mt-3 pt-2 border-t border-slate-100 flex-col gap-1.5">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-500 font-bold">工期展延天數 (增加所有浮時)</span>
                  <span className="font-mono font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">+{projectExtensionDays} 天</span>
                </div>
                <div className="relative flex items-center mt-0.5">
                  <input 
                    id="input-ext-number"
                    type="number"
                    min="0"
                    value={projectExtensionDays === 0 ? "" : projectExtensionDays}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      handleExtensionChange(isNaN(val) ? 0 : Math.max(0, val));
                    }}
                    className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded pl-2.5 pr-8 py-1.5 text-xs font-mono font-bold text-slate-800 outline-hidden transition"
                    placeholder="0"
                  />
                  <span className="absolute right-2.5 text-[10px] text-slate-400 font-bold select-none">天</span>
                </div>

                {/* 回復原設定 */}
                <button
                  id="btn-restore-defaults"
                  onClick={handleRestoreAllDefaults}
                  className="mt-2 w-full py-1.5 bg-slate-100 hover:bg-indigo-50 active:scale-98 text-indigo-700 font-bold text-[10px] rounded flex items-center justify-center gap-1.5 cursor-pointer transition border border-indigo-100 hover:border-indigo-200"
                  title="清除所有工項的附加延宕日期、調校工期及手動進度微調（工期展延保留）"
                >
                  <RefreshCw className="w-3 h-3 text-indigo-500" />
                  回復全案原設定
                </button>
              </div>
            </div>

            {/* Stat 4: 雲端同步硬碟狀態記錄 */}
            <div className="hidden lg:block bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
              <p className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider mb-1">Google 雲端備份同步</p>
              <div className="flex items-center gap-2.5 mt-2">
                <div className={`w-2.5 h-2.5 rounded-full ${user ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`}></div>
                <span className="text-sm font-bold text-slate-800">
                  {user ? "自動同步中" : "尚未連結雲端"}
                </span>
              </div>
              {user ? (
                <div>
                  <p className="text-[10px] text-emerald-600 font-semibold mt-1">
                    {driveMessage || "已連接並同步進度"}
                  </p>
                  <button
                    id="btn-sidebar-backup-trigger"
                    onClick={handleSaveToDrive}
                    className="text-[10px] text-indigo-600 font-semibold underline block mt-2 hover:text-indigo-800 cursor-pointer text-left"
                  >
                    立馬備份一次進度 ( engineering_schedule_state.json )
                  </button>
                </div>
              ) : (
                <div>
                  {driveMessage && (
                    <p className="text-[10px] text-rose-500 font-semibold mt-1 leading-normal">
                      {driveMessage}
                    </p>
                  )}
                  <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                    登入後自動於關聯異動時，備份異動到儲存空間。
                  </p>
                  <button
                    id="btn-sidebar-connect-drive"
                    onClick={handleLogin}
                    disabled={isLoggingIn}
                    className="text-[10px] text-indigo-600 hover:text-indigo-800 font-extrabold underline block mt-2 cursor-pointer text-left disabled:opacity-50"
                  >
                    {isLoggingIn ? "安全性驗證中..." : "👉 點此「連結 Google 雲端硬碟」啟用備份"}
                  </button>
                </div>
              )}
            </div>

          </div>

          {/* 拖放與大甘特重組面板 */}
          <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col min-h-0">
            
            {/* Block Header */}
            <div className="h-14 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between px-6 bg-slate-50/70 py-2 sm:py-0 gap-2 shrink-0">
              <div className="flex items-center gap-4">
                <span className="text-sm font-extrabold text-slate-800">
                  {activeFilter === 'all' ? '全部專案工程排程表' : 
                   activeFilter === 'completed' ? '已完工之工程項目' :
                   activeFilter === 'delayed' ? '🚨 延宕工項' :
                   activeFilter === 'affected' ? '⚠️ 受影響工項' :
                   activeFilter === 'critical' ? '🔥 要徑工項' :
                   `進行中工項 - ${
                    activeFilter === 'today' ? '今日正在進行' :
                    activeFilter === 'week_in' ? '未來 1 週內進行' :
                    activeFilter === 'week_out' ? '未來 1 週後' :
                    activeFilter === 'month_in' ? '未來 1 個月內進行' : '未來 1 個月後'
                   }`}
                </span>
                <div className="flex items-center gap-1.5 bg-slate-200/90 text-slate-700 rounded-sm px-2 py-0.5 text-xxs font-mono font-bold">
                  <span>聚焦工項: {filteredTasks.length}</span>
                </div>
              </div>

              {/* 上次重新計算提示 */}
              <div className="text-xxs text-slate-400 font-mono flex items-center gap-2">
                <span className="flex items-center gap-1 text-indigo-600 font-bold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                  <Workflow className="w-3 h-3 text-indigo-500" /> CPM 實時多網收斂演算法 (FS 鏈接)
                </span>
              </div>
            </div>

            {/* 搜尋輔助框 */}
            <div className="px-5 py-3 border-b border-slate-100 bg-white flex items-center gap-3 shrink-0">
              <div className="relative flex-1">
                <span className="absolute left-3 top-2.5 text-slate-400">
                  <Search className="w-3.5 h-3.5" />
                </span>
                <input 
                  id="main-search-input"
                  type="text"
                  placeholder="輸入篩選關鍵字 搜尋工項名稱 (例如：結構、防水、機電等)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded pl-9 pr-4 py-2 text-xs focus:outline-hidden focus:border-indigo-500 focus:bg-white transition"
                />
              </div>
              {searchQuery && (
                <button 
                  id="btn-clear-search"
                  onClick={() => setSearchQuery("")} 
                  className="text-xxs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded hover:bg-indigo-100 cursor-pointer"
                >
                  清除
                </button>
              )}
            </div>

            {/* 主 Grid : 左右等重或是左邊工工清單，右邊是真正的可調整甘特長條圖＋重估面板 */}
            <div className="flex-1 overflow-hidden grid grid-cols-12 max-[1024px]:flex max-[1024px]:flex-col">
              
              {/* Left col: 工項資訊列表表格 (col-span-5) */}
              <div className="col-span-12 lg:col-span-5 border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col overflow-y-auto max-h-none lg:max-h-full">
                <table id="gantt-minimal-table" className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50/80 border-b border-slate-200 uppercase text-[10px] font-extrabold text-slate-500 tracking-wider sticky top-0 z-10 select-none">
                    <tr>
                      <th className="px-4 py-3">任務代號</th>
                      <th className="px-4 py-3">施工工項名稱 (點擊選取)</th>
                      <th className="px-4 py-3 text-center">工期/調整</th>
                      <th className="px-4 py-3 text-right">衝擊</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans">
                    {filteredTasks.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-16 text-slate-400 font-mono">
                          沒有找到相符的工項項目
                        </td>
                      </tr>
                    ) : (
                      filteredTasks.map(task => {
                        const isSelected = selectedTask?.id === task.id;
                        const isManuallyAdjusted = (task.delayDays || 0) > 0 || (task.adjustedDuration !== undefined && task.adjustedDuration !== task.duration);
                        const isAffected = !isManuallyAdjusted && (task.calculatedStartDate !== undefined && task.calculatedStartDate !== task.startDate);
                        const displayDuration = task.adjustedDuration !== undefined ? task.adjustedDuration : task.duration;
                        
                        return (
                          <tr
                            key={task.id}
                            id={`task-row-geometric-${task.id}`}
                            onClick={() => setSelectedTask(task)}
                            className={`transition duration-150 cursor-pointer ${
                              isSelected 
                                ? "bg-indigo-50/80 border-l-4 border-l-indigo-600" 
                                : isManuallyAdjusted 
                                ? "bg-amber-50/45 hover:bg-slate-50/80" 
                                : isAffected
                                ? "bg-purple-50/35 hover:bg-slate-50/80"
                                : "hover:bg-slate-50/80"
                            }`}
                          >
                            <td className="px-4 py-3.5 font-mono font-bold text-slate-500">
                              {task.id}
                            </td>
                            <td className="px-4 py-3.5">
                              <p className={`font-bold text-xs ${isSelected ? "text-indigo-900" : "text-slate-800"}`}>
                                {task.name}
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                <span className="text-[10px] text-slate-400 font-mono mr-1">
                                  {task.calculatedStartDate || task.startDate} ~ {task.calculatedEndDate || task.endDate}
                                </span>
                                {task.progress === 100 ? (
                                  <span className="text-[9px] font-extrabold bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200 select-none">
                                    已完工
                                  </span>
                                ) : task.progress > 0 ? (
                                  <span className="text-[9px] font-extrabold bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200 select-none">
                                    進行中 {task.progress}%
                                  </span>
                                ) : null}
                                {isManuallyAdjusted && (
                                  <span className="text-[9px] font-extrabold bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 select-none">
                                    人為調整
                                  </span>
                                )}
                                {isAffected && (
                                  <span className="text-[9px] font-extrabold bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200 select-none animate-pulse">
                                    受影響
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              {isManuallyAdjusted ? (
                                <div className="flex flex-col items-center">
                                  <span className="line-through text-slate-400 text-[10px] font-mono">{task.duration}d</span>
                                  <span className="text-amber-700 font-bold bg-amber-100/80 px-1.5 py-0.5 rounded text-[10px] font-mono">
                                    {displayDuration}d {task.delayDays ? `(+${task.delayDays})` : ""}
                                  </span>
                                </div>
                              ) : (
                                <span className="font-mono text-slate-600 font-semibold">{task.duration} 天</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-right font-bold">
                              {task.isCritical ? (
                                <span className="text-rose-500 text-[10px] font-extrabold pb-0.5 pt-0.5 px-1.5 bg-rose-50 rounded border border-rose-100 flex items-center justify-end gap-1 select-none">
                                  <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0 animate-pulse" />
                                  要徑
                                </span>
                              ) : (
                                <span className="text-emerald-600 text-[10px] font-bold py-0.5 px-1.5 bg-emerald-50 rounded border border-emerald-100 flex items-center justify-end gap-1 select-none">
                                  浮時 {task.totalFloat} 天
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Right col: 互動式甘特圖展示牆 + 浮動重算調校面板 (col-span-7) */}
              <div className="hidden lg:flex lg:col-span-7 bg-slate-50/50 p-6 flex-col overflow-y-auto relative min-h-[400px]">
                
                {/* Timeline Header label */}
                <div className="flex border-b border-slate-200 pb-2 mb-3 text-[10px] font-bold text-slate-400 select-none font-mono">
                  <div className="flex-1 text-center border-r border-slate-200">專案前期 (0~20%)</div>
                  <div className="flex-1 text-center border-r border-slate-200 bg-indigo-50/50 py-0.5 text-indigo-600">中間期 (20~60%)</div>
                  <div className="flex-1 text-center border-r border-slate-200">後期安裝 (60~80%)</div>
                  <div className="flex-1 text-center">驗收與完工 (80%+)</div>
                </div>

                {/* 狀態圖例說明 */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 mb-4 bg-slate-100/70 rounded-lg border border-slate-200/50 text-[10px] text-slate-500 font-medium">
                  <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400 font-mono">排程圖例:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-2.5 rounded-xs bg-rose-500"></span>
                    <span>關鍵路徑/要徑</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-2.5 rounded-xs bg-indigo-500"></span>
                    <span>一般工期條</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-2.5 rounded-xs bg-amber-500"></span>
                    <span>人為調整工項 (橘黃色)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-2.5 rounded-xs bg-purple-500"></span>
                    <span>被影響工項 (紫色)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-2.5 rounded-xs bg-emerald-500"></span>
                    <span className="text-emerald-700 font-bold">已完工工項 (綠色)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-2.5 rounded-xs bg-emerald-500/50"></span>
                    <span className="text-emerald-600 font-medium">可用彈性浮時條</span>
                  </div>
                </div>

                {/* 甘特圖橫條列表 */}
                <div className="space-y-4 mb-32">
                  {filteredTasks.map((task, idx) => {
                    const isSelected = selectedTask?.id === task.id;
                    const { leftPercent, widthPercent } = getGanttBarMeta(task);
                    const isCompleted = task.progress === 100;
                    
                    const isManuallyAdjusted = (task.delayDays || 0) > 0 || (task.adjustedDuration !== undefined && task.adjustedDuration !== task.duration);
                    const isAffected = !isManuallyAdjusted && (task.calculatedStartDate !== undefined && task.calculatedStartDate !== task.startDate);

                    const colorStyle = isCompleted
                      ? "bg-emerald-500 shadow-sm"
                      : task.isCritical 
                      ? "bg-rose-500 shadow-sm"
                      : isManuallyAdjusted 
                      ? "bg-amber-500 shadow-sm"
                      : isAffected
                      ? "bg-purple-500 shadow-sm"
                      : "bg-indigo-500 shadow-sm";

                    // 動態決定浮動面板相對於工項列的垂直定位
                    const isNearTop = idx <= 2;
                    const isNearBottom = idx >= filteredTasks.length - 4;
                    const dynamicPositionClass = isNearTop
                      ? "top-[-12px] translate-y-0"
                      : isNearBottom
                      ? "bottom-[-12px] top-auto translate-y-0"
                      : "top-1/2 -translate-y-1/2";

                    return (
                      <div 
                        key={task.id} 
                        id={`gantt-row-geometric-${task.id}`}
                        onClick={() => setSelectedTask(task)}
                        className={`py-1.5 transition rounded-lg relative ${isSelected ? "bg-white border border-indigo-200 px-3 -mx-3 shadow-md z-30" : "cursor-pointer group hover:bg-slate-100/50"}`}
                      >
                        <div className="flex items-center justify-between text-[10px] mb-1">
                          <span className="font-bold text-slate-700 flex flex-wrap items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${task.isCritical ? "bg-rose-500" : "bg-indigo-600"}`}></span>
                            [{task.id}] {task.name.substring(0, 16)}...
                            {task.totalFloat !== undefined && task.totalFloat > 0 && (
                              <span className="text-[9px] text-emerald-600 font-bold bg-emerald-50 px-1 rounded border border-emerald-100/50 select-none">
                                浮時 {task.totalFloat}d
                              </span>
                            )}
                            {isManuallyAdjusted && (
                              <span className="text-[9px] font-extrabold bg-amber-50 text-amber-700 px-1 rounded border border-amber-200/50 select-none">
                                人為調整
                              </span>
                            )}
                            {isAffected && (
                              <span className="text-[9px] font-extrabold bg-purple-50 text-purple-700 px-1 rounded border border-purple-200/50 select-none">
                                受影響
                              </span>
                            )}
                          </span>
                          <span className="font-mono text-slate-400">
                            {task.calculatedStartDate || task.startDate} ~ {task.calculatedEndDate || task.endDate}
                          </span>
                        </div>
                        
                        {/* 進度背景槽 */}
                        <div 
                          id={`gantt-bar-container-${task.id}`}
                          className="w-full bg-slate-200/50 h-5 rounded-md relative overflow-hidden shadow-inner flex items-center"
                        >
                          {/* 甘特圖位置橫條 */}
                          <div 
                            className={`absolute h-full rounded-l-md transition-all duration-300 ${colorStyle}`}
                            style={{ 
                              left: `${Math.max(0, Math.min(leftPercent, 95))}%`, 
                              width: `${Math.max(4, Math.min(widthPercent, 100))}%` 
                            }}
                          >
                            {/* 工項內部進度條 */}
                            <div 
                              className="h-full bg-black/15 transition-all duration-300 rounded-l-md"
                              style={{ width: `${task.progress}%` }}
                            />
                            {/* 橫條上的提示進度 */}
                            {task.progress > 0 && widthPercent > 12 && (
                              <span className="absolute inset-y-0 left-2 flex items-center text-[9px] font-bold text-white leading-none">
                                {task.progress}%
                              </span>
                            )}
                          </div>

                          {/* 綠色浮時時間條 */}
                          {task.totalFloat !== undefined && task.totalFloat > 0 && (
                            <div 
                              className="absolute h-full bg-emerald-500/85 hover:bg-emerald-600 transition-all duration-300 rounded-r-md flex items-center justify-center border-l border-white/35 font-mono text-[9px] text-white font-bold tracking-tight select-none shadow-xs"
                              style={{ 
                                left: `${Math.max(0, Math.min(leftPercent + widthPercent, 99))}%`, 
                                width: `${Math.max(2, Math.min((task.totalFloat / totalDays) * 100, 100 - (leftPercent + widthPercent)))}%` 
                              }}
                              title={`可用總浮時: ${task.totalFloat} 天`}
                            >
                              {(task.totalFloat / totalDays) * 100 > 6 && (
                                <span className="px-1 truncate font-sans text-xxs font-black text-emerald-50">+ {task.totalFloat}d 浮時</span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Floating Details / Settings Panel: 顯示於所選工項右側的調校重算面板 */}
                        {isSelected && selectedTask && (
                          <div 
                            onClick={(e) => e.stopPropagation()}
                            className={`absolute right-0 sm:right-2 sm:left-auto ${dynamicPositionClass} w-[90vw] sm:w-[420px] bg-white border border-indigo-200 p-5 rounded-xl shadow-2xl z-50 text-slate-800 pointer-events-auto cursor-default`}
                          >
                            {/* 頂部選中工項狀態 */}
                            <div className="flex items-start justify-between border-b border-indigo-50 pb-2.5 mb-3.5 gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded font-mono">
                                    代碼: {selectedTask.id}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    計畫：{selectedTask.startDate}
                                  </span>
                                </div>
                                <p className="text-xs font-black text-slate-900 mt-1.5 truncate">
                                  {selectedTask.name}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {selectedTask.isCritical ? (
                                  <span className="text-[9px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded animate-pulse">
                                    要徑
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
                                    浮時 {selectedTask.totalFloat}d
                                  </span>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedTask(null);
                                  }}
                                  className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition cursor-pointer"
                                  title="關閉面版"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* 參數調校滑桿 */}
                            <div className="space-y-3.5">
                              
                              {/* 參數一：手動追加現場延誤 */}
                              <div className="bg-slate-50 p-2.5 rounded border border-slate-100">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-xxs font-extrabold text-slate-600">手動附加延宕日期 (Delay)</span>
                                  <span className="text-xs font-mono font-bold text-rose-600 bg-rose-50 px-1.5 rounded">+{selectedTask.delayDays || 0}d</span>
                                </div>
                                
                                <div className="flex items-center gap-2 mt-1.5">
                                  <button
                                    id="btn-g-delay-minus"
                                    onClick={() => {
                                      const current = selectedTask.delayDays || 0;
                                      if (current > 0) {
                                        handleTaskUpdate({ ...selectedTask, delayDays: current - 1 });
                                      }
                                    }}
                                    className="w-7 h-7 bg-white hover:bg-slate-100 active:scale-95 text-slate-800 font-extrabold text-xs rounded border border-slate-200 flex items-center justify-center transition cursor-pointer"
                                  >
                                    -
                                  </button>
                                  
                                  <input
                                    id="input-g-delay"
                                    type="range"
                                    min={0}
                                    max={60}
                                    value={selectedTask.delayDays || 0}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value) || 0;
                                      handleTaskUpdate({ ...selectedTask, delayDays: val });
                                    }}
                                    className="flex-1 accent-indigo-600 cursor-pointer h-1.5 rounded bg-slate-200"
                                  />

                                  <button
                                    id="btn-g-delay-plus"
                                    onClick={() => {
                                      const current = selectedTask.delayDays || 0;
                                      handleTaskUpdate({ ...selectedTask, delayDays: current + 1 });
                                    }}
                                    className="w-7 h-7 bg-white hover:bg-slate-100 active:scale-95 text-slate-800 font-extrabold text-xs border border-slate-200 rounded flex items-center justify-center transition cursor-pointer"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>

                              {/* 參數二：變更基準工工期 */}
                              <div className="bg-slate-50 p-2.5 rounded border border-slate-100">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-xxs font-extrabold text-slate-600">調校施工持續期間 (Duration)</span>
                                  <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-1.5 rounded">
                                    {selectedTask.adjustedDuration !== undefined ? selectedTask.adjustedDuration : selectedTask.duration}d
                                  </span>
                                </div>
                                
                                <div className="flex items-center gap-2 mt-1.5">
                                  <button
                                    id="btn-g-duration-minus"
                                    onClick={() => {
                                      const current = selectedTask.adjustedDuration !== undefined ? selectedTask.adjustedDuration : selectedTask.duration;
                                      if (current > 1) {
                                        handleTaskUpdate({ ...selectedTask, adjustedDuration: current - 1 });
                                      }
                                    }}
                                    className="w-7 h-7 bg-white hover:bg-slate-100 active:scale-95 text-slate-800 font-extrabold text-xs border border-slate-200 rounded flex items-center justify-center transition cursor-pointer"
                                  >
                                    -
                                  </button>
                                  
                                  <input
                                    id="input-g-duration"
                                    type="range"
                                    min={1}
                                    max={100}
                                    value={selectedTask.adjustedDuration !== undefined ? selectedTask.adjustedDuration : selectedTask.duration}
                                    onChange={(e) => {
                                      const val = Math.max(1, parseInt(e.target.value) || 1);
                                      handleTaskUpdate({ ...selectedTask, adjustedDuration: val });
                                    }}
                                    className="flex-1 accent-indigo-600 cursor-pointer h-1.5 rounded bg-slate-200"
                                  />

                                  <button
                                    id="btn-g-duration-plus"
                                    onClick={() => {
                                      const current = selectedTask.adjustedDuration !== undefined ? selectedTask.adjustedDuration : selectedTask.duration;
                                      handleTaskUpdate({ ...selectedTask, adjustedDuration: current + 1 });
                                    }}
                                    className="w-7 h-7 bg-white hover:bg-slate-100 active:scale-95 text-slate-800 font-extrabold text-xs border border-slate-200 rounded flex items-center justify-center transition cursor-pointer"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>

                              {/* 參數三：變更累計工程進度 */}
                              <div className="bg-slate-50 p-2.5 rounded border border-slate-100">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-xxs font-extrabold text-slate-600">累計實際施工進度 (Progress)</span>
                                  <span className={`text-xs font-mono font-bold px-1.5 rounded ${selectedTask.progress === 100 ? 'text-emerald-700 bg-emerald-50' : 'text-amber-700 bg-amber-50'}`}>
                                    {selectedTask.progress || 0}%
                                  </span>
                                </div>
                                
                                <div className="flex items-center gap-2 mt-1.5">
                                  <button
                                    id="btn-g-progress-minus"
                                    onClick={() => {
                                      const current = selectedTask.progress || 0;
                                      if (current > 0) {
                                        handleTaskUpdate({ ...selectedTask, progress: Math.max(0, current - 5) });
                                      }
                                    }}
                                    className="w-7 h-7 bg-white hover:bg-slate-100 active:scale-95 text-slate-800 font-extrabold text-xs border border-slate-200 rounded flex items-center justify-center transition cursor-pointer"
                                  >
                                    -
                                  </button>
                                  
                                  <input
                                    id="input-g-progress"
                                    type="range"
                                    min={0}
                                    max={100}
                                    step={5}
                                    value={selectedTask.progress || 0}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value) || 0;
                                      handleTaskUpdate({ ...selectedTask, progress: val });
                                    }}
                                    className="flex-1 accent-indigo-600 cursor-pointer h-1.5 rounded bg-slate-200"
                                  />

                                  <button
                                    id="btn-g-progress-plus"
                                    onClick={() => {
                                      const current = selectedTask.progress || 0;
                                      handleTaskUpdate({ ...selectedTask, progress: Math.min(100, current + 5) });
                                    }}
                                    className="w-7 h-7 bg-white hover:bg-slate-100 active:scale-95 text-slate-800 font-extrabold text-xs border border-slate-200 rounded flex items-center justify-center transition cursor-pointer"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>

                              {/* 回復此工項原設定按鈕 */}
                              <div className="pt-1.5 flex gap-2">
                                <button
                                  id="btn-restore-single-task"
                                  onClick={() => handleRestoreSingleTask(selectedTask.id)}
                                  className="w-full py-1.5 bg-slate-50 hover:bg-slate-100 active:scale-95 text-slate-750 font-extrabold text-[10px] rounded flex items-center justify-center gap-1.5 transition cursor-pointer border border-slate-200"
                                  title="清除此工項的附加延宕日期、調校工期及手動進度微調"
                                >
                                  <RefreshCw className="w-3 h-3 text-slate-500 animate-spin-hover" />
                                  回復此工項原設定
                                </button>
                              </div>

                            </div>

                            {/* 演算結論與相依關係展示 */}
                            <div className="mt-3 pt-3 border-t border-slate-100 text-xxs bg-indigo-50/20 p-2 rounded">
                              <p className="text-slate-700 font-bold flex flex-wrap items-center gap-1">
                                <span>排程極限：</span>
                                <span>最早開始 <span className="font-mono font-extrabold text-indigo-700 bg-indigo-50 px-1 rounded">{selectedTask.calculatedStartDate}</span></span>
                                <span className="text-slate-300">|</span>
                                <span>最遲開始 <span className="font-mono font-extrabold text-emerald-700 bg-emerald-50 px-1 rounded">{selectedTask.lateStartDate}</span></span>
                              </p>
                              <p className="text-slate-500 mt-1 flex flex-wrap items-center gap-1">
                                <span>完工極限：</span>
                                <span>最早完工 <span className="font-mono font-semibold text-indigo-650">{selectedTask.calculatedEndDate}</span></span>
                                <span className="text-slate-300">|</span>
                                <span>最遲完工 <span className="font-mono font-semibold text-emerald-650">{selectedTask.lateEndDate}</span></span>
                              </p>
                              {selectedTask.predecessors && selectedTask.predecessors.length > 0 && (
                                <p className="text-slate-400 mt-1 text-[9px] truncate">
                                  前置依賴：<span className="font-mono text-slate-600 bg-slate-100 px-1 rounded">{selectedTask.predecessors.join(", ")}</span>
                                </p>
                              )}
                              {user && (
                                <div className="mt-2.5 pt-2 border-t border-slate-100/60 flex justify-end">
                                  <button
                                    id="btn-cloud-sync-immediate"
                                    onClick={handleSaveToDrive}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-2.5 py-1 rounded text-[9px] shadow-xs flex items-center gap-1 cursor-pointer transition"
                                  >
                                    <CloudLightning className="w-2.5 h-2.5" /> 保存異動至 Drive
                                  </button>
                                </div>
                              )}
                            </div>

                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>



              </div>

            </div>

          </div>

        </main>

      </div>

      {/* Bottom Status Bar - Geometric Balance Style */}
      <footer className="h-8 bg-slate-50 border-t border-slate-200 flex items-center justify-between px-6 shrink-0 z-40 select-none">
        <div className="flex gap-5">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 uppercase tracking-wider font-bold">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
            甘特重算引擎: 進度同調
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 uppercase tracking-wider font-bold">
            <span className={`w-1.5 h-1.5 rounded-full ${user ? "bg-indigo-500" : "bg-slate-300"}`}></span>
            Google Drive: {user ? "自動同調中" : "未登入"}
          </div>
        </div>
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
          ProjectEngine Schedule Core: v1.0.9
        </div>
      </footer>

    </div>
  );
}
