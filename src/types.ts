export interface Task {
  id: string;          // 唯一識別工項ID
  name: string;        // 工項名稱
  duration: number;    // 持續天數 (基本天數)
  startDate: string;   // 原始預定開始日期 (YYYY-MM-DD)
  endDate: string;     // 原始預定結束日期 (YYYY-MM-DD)
  progress: number;    // 進度 (0-100)
  predecessors: string[]; // 前置工項 ID 陣列

  // 使用者可微調與調整的參數
  delayDays?: number;       // 人為延遲天數 (例如工項遇到突發延遲)
  adjustedDuration?: number;// 調整後的工期 (如果延長或縮短工項)

  // 系統自動計算後的預估時期
  calculatedStartDate?: string; // 重新計算後的開始日期 (YYYY-MM-DD)
  calculatedEndDate?: string;   // 重新計算後的完工日期 (YYYY-MM-DD)
  lateStartDate?: string;       // 最遲開始日期 (YYYY-MM-DD)
  lateEndDate?: string;         // 最遲完工日期 (YYYY-MM-DD)
  totalFloat?: number;          // 總浮時天數
  isCritical?: boolean;         // 是否在關鍵路徑/影響最終工期
  baselineStartDate?: string;   // 考慮排除日期但無人為延遲時的基準開始日期
  baselineEndDate?: string;     // 考慮排除日期但無人為延遲時的基準結束日期

  // 雙代號網絡圖節點屬性 (用於精準判斷浮時)
  startNode?: number;
  endNode?: number;
  endNodeEarlyDay?: number;
  endNodeLateDay?: number;
}

export interface ProjectState {
  projectName: string;
  tasks: Task[];
  lastUpdated: string;
  sourceFileName?: string;
  sourceFileType?: string;
  excludedDates?: string[];
}

export interface UserProfile {
  email: string;
  name: string;
  photoURL?: string;
}
