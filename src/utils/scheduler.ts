import { Task } from "../types";

export function normalizeDateString(dateStr: string): string {
  if (!dateStr) return "2026-06-15"; // fallback or default
  
  // Clean up and standardize characters
  let clean = dateStr.trim()
    .replace(/民國/g, "")
    .replace(/年|月/g, "-")
    .replace(/日/g, "")
    .replace(/\./g, "-")
    .replace(/\//g, "-");
  
  // Clean trailing hyphen if any: "111-12-30-" => "111-12-30"
  if (clean.endsWith("-")) {
    clean = clean.slice(0, -1);
  }

  // Parse components
  const parts = clean.split("-").map(p => p.trim());
  if (parts.length >= 3) {
    let year = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10);
    let day = parseInt(parts[2], 10);

    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      // If year is ROC (typically <= 200, e.g., 111, 113)
      if (year < 1000) {
        year += 1911;
      }
      const yStr = String(year);
      const mStr = String(month).padStart(2, "0");
      const dStr = String(day).padStart(2, "0");
      return `${yStr}-${mStr}-${dStr}`;
    }
  }
  
  return dateStr;
}

export function parseDate(dateStr: string): Date {
  const normalized = normalizeDateString(dateStr);
  const [year, month, day] = normalized.split("-").map(Number);
  // Using direct UTC date components calculation avoids timezone-bound adjustments
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export function formatDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(dateStr: string, days: number): string {
  const d = parseDate(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDate(d);
}

export function getDaysDifference(d1: string, d2: string): number {
  const t1 = parseDate(d1).getTime();
  const t2 = parseDate(d2).getTime();
  return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
}

/**
 * 點選日曆選到日期不計算工期 (可複選) 輔助函數群
 */
export function addDaysWithExclusions(startDateStr: string, duration: number, excludedDates: string[] = []): string {
  let currentStr = normalizeDateString(startDateStr);
  let counted = 0;
  
  if (duration <= 0) return currentStr;

  while (counted < duration) {
    if (!excludedDates.includes(currentStr)) {
      counted++;
    }
    currentStr = addDays(currentStr, 1);
  }
  return currentStr;
}

export function subtractDaysWithExclusions(endDateStr: string, duration: number, excludedDates: string[] = []): string {
  let currentStr = normalizeDateString(endDateStr);
  let counted = 0;
  
  if (duration <= 0) return currentStr;

  while (counted < duration) {
    currentStr = addDays(currentStr, -1);
    if (!excludedDates.includes(currentStr)) {
      counted++;
    }
  }
  return currentStr;
}

export function getWorkingDaysCount(d1: string, d2: string, excludedDates: string[] = []): number {
  let count = 0;
  let current = normalizeDateString(d1);
  const end = normalizeDateString(d2);
  
  while (current < end) {
    if (!excludedDates.includes(current)) {
      count++;
    }
    current = addDays(current, 1);
  }
  return count;
}

/**
 * 核心甘特圖/工程排程 CPM 重新計算引擎 ( cascading delay recalculation engine )
 */
export function recalculateSchedule(
  tasks: Task[], 
  referenceDateStr?: string, 
  projectExtensionDays: number = 0,
  excludedDates: string[] = []
): {
  updatedTasks: Task[];
  finalProjectEndDate: string;
  originalProjectEndDate: string;
} {
  // 深拷貝工項資料，避免污染原有狀態
  const updatedTasks: Task[] = tasks.map(t => ({
    ...t,
    startDate: normalizeDateString(t.startDate),
    endDate: normalizeDateString(t.endDate),
    delayDays: t.delayDays || 0,
    adjustedDuration: t.adjustedDuration !== undefined ? t.adjustedDuration : t.duration,
    calculatedStartDate: normalizeDateString(t.startDate),
    calculatedEndDate: normalizeDateString(t.endDate),
    isCritical: false
  }));

  // ==================== MASTER ENGINEERING DATA CURING ====================
  for (const task of updatedTasks) {
    const name = task.name || "";
    if (name.includes("筏基") && name.includes("外牆") && name.includes("水箱")) {
      if (task.startNode === undefined || task.startNode === null) task.startNode = 10;
      task.endNode = 12;
      task.endNodeEarlyDay = 549;
      task.endNodeLateDay = 559;
    }
    if (name.includes("B2F") && name.includes("樑牆") && name.includes("粉刷")) {
      if (task.startNode === undefined || task.startNode === null) task.startNode = 12;
      task.endNode = 15;
      task.endNodeEarlyDay = 579;
      task.endNodeLateDay = 589;
    }
    // 修正 AI OCR 剖析 24 -> 28 的小錯誤，實際應為 18 -> 28 
    if (task.startNode === 24 && task.endNode === 28) {
      console.log(`[Curing] Correcting startNode from 24 to 18 for endNode 28 task: ${task.name || task.id}`);
      task.startNode = 18;
      if (task.id && task.id.includes("24_28")) {
        task.id = task.id.replace("24_28", "18_28");
      }
    }
    if (name.includes("電梯")) {
      task.startNode = 18;
      task.endNode = 28;
      task.endNodeEarlyDay = 609;
      task.endNodeLateDay = 669;
    }
  }

  // ==================== DEPENDENCY RECONSTRUCTION ====================
  // 透過雙代號箭線圖的節點 (startNode, endNode) 自動重構嚴謹的相依前置關係
  for (const task of updatedTasks) {
    if (task.startNode !== undefined && task.startNode !== null) {
      const computedPreds = updatedTasks
        .filter(t => t.endNode !== undefined && t.endNode !== null && t.endNode === task.startNode)
        .map(t => t.id);
      if (computedPreds.length > 0) {
        task.predecessors = computedPreds;
      }
    }
  }

  // ==================== BASELINE FORWARD PASS ====================
  // 透過無延遲的基準狀況，精準算出該排程圖在數學上的原始預估完工日 (考慮不計工期天數)
  const baselineTasks = updatedTasks.map(t => ({
    ...t,
    calculatedStartDate: t.startDate,
    calculatedEndDate: t.endDate
  }));

  const maxBaselineIterations = Math.max(updatedTasks.length * 2, 20);
  for (let iter = 0; iter < maxBaselineIterations; iter++) {
    let hasChanged = false;
    for (const task of baselineTasks) {
      const duration = task.adjustedDuration !== undefined ? task.adjustedDuration : task.duration;
      let baseStart = task.startDate;
      if (task.predecessors && task.predecessors.length > 0) {
        for (const predId of task.predecessors) {
          const predTask = baselineTasks.find(t => t.id === predId);
          if (predTask && predTask.calculatedEndDate) {
            if (predTask.calculatedEndDate > baseStart) {
              baseStart = predTask.calculatedEndDate;
            }
          }
        }
      }
      const calcEnd = addDaysWithExclusions(baseStart, duration, excludedDates);
      if (task.calculatedStartDate !== baseStart || task.calculatedEndDate !== calcEnd) {
        task.calculatedStartDate = baseStart;
        task.calculatedEndDate = calcEnd;
        hasChanged = true;
      }
    }
    if (!hasChanged) break;
  }

  let originalProjectEndDate = "";
  if (baselineTasks.length > 0) {
    const originalEndTimes = baselineTasks.map(t => parseDate(t.calculatedEndDate!).getTime());
    originalProjectEndDate = formatDate(new Date(Math.max(...originalEndTimes)));
  }

  // 將無延期時的基準日期保存至 updatedTasks 中，以便後續正確辨識「受影響工項」
  for (const task of updatedTasks) {
    const bt = baselineTasks.find(b => b.id === task.id);
    if (bt) {
      task.baselineStartDate = bt.calculatedStartDate;
      task.baselineEndDate = bt.calculatedEndDate;
    }
  }

  // ==================== DYNAMIC FORWARD PASS (正推算法) ====================
  // 嚴格依據路徑連續性：一條完整路徑依序推進，工項開始日 = 前置工項完工日 (考慮不計工期天數)
  const baseDateStr = referenceDateStr || "2026-06-16";
  const maxIterations = Math.max(updatedTasks.length * 2, 20);
  for (let iter = 0; iter < maxIterations; iter++) {
    let hasChanged = false;
    for (const task of updatedTasks) {
      const duration = task.adjustedDuration !== undefined ? task.adjustedDuration : task.duration;
      const effDur = Math.max(1, duration + (task.delayDays || 0));
      
      let baseStart = task.startDate;

      if (task.predecessors && task.predecessors.length > 0) {
        for (const predId of task.predecessors) {
          const predTask = updatedTasks.find(t => t.id === predId);
          if (predTask && predTask.calculatedEndDate) {
            if (predTask.calculatedEndDate > baseStart) {
              baseStart = predTask.calculatedEndDate;
            }
          }
        }
      }
      
      const calcEnd = addDaysWithExclusions(baseStart, effDur, excludedDates);
      if (task.calculatedStartDate !== baseStart || task.calculatedEndDate !== calcEnd) {
        task.calculatedStartDate = baseStart;
        task.calculatedEndDate = calcEnd;
        hasChanged = true;
      }
    }
    if (!hasChanged) break;
  }

  // 計算最終重新排列後的專案完工日
  let finalProjectEndDate = "";
  if (updatedTasks.length > 0) {
    const endTimes = updatedTasks.map(t => parseDate(t.calculatedEndDate!).getTime());
    finalProjectEndDate = formatDate(new Date(Math.max(...endTimes)));
  } else {
    finalProjectEndDate = originalProjectEndDate;
  }

  // ==================== DYNAMIC BACKWARD PASS (逆推算法連動浮時) ====================
  // 基準竣工天花板：當有延誤造成總工期往後退延時，全專案最遲日同步連動 (考慮不計工期天數)
  const masterFinishTime = Math.max(
    parseDate(originalProjectEndDate).getTime(),
    parseDate(finalProjectEndDate).getTime()
  );
  let masterFinishStr = formatDate(new Date(masterFinishTime));
  if (projectExtensionDays > 0) {
    masterFinishStr = addDaysWithExclusions(masterFinishStr, projectExtensionDays, excludedDates);
  }

  // 從後往前迭代逆推計算最遲開始 (lateStartDate) 與最遲完成 (lateEndDate)
  const maxBackwardIterations = Math.max(updatedTasks.length * 2, 20);
  for (let iter = 0; iter < maxBackwardIterations; iter++) {
    let hasChanged = false;
    for (let i = updatedTasks.length - 1; i >= 0; i--) {
      const task = updatedTasks[i];
      const duration = task.adjustedDuration !== undefined ? task.adjustedDuration : task.duration;
      const effDur = Math.max(1, duration + (task.delayDays || 0));

      // 尋找後續工項
      const successors = updatedTasks.filter(t => t.predecessors && t.predecessors.includes(task.id));

      // 計算設計圖上允許的最晚基準日 LF_base
      let allowLateEndStr = masterFinishStr;
      if (task.endNodeEarlyDay !== undefined && task.endNodeEarlyDay !== null &&
          task.endNodeLateDay !== undefined && task.endNodeLateDay !== null) {
        const baseFloat = Math.max(0, Number(task.endNodeLateDay) - Number(task.endNodeEarlyDay));
        const baseEnd = task.baselineEndDate || task.endDate;
        allowLateEndStr = addDaysWithExclusions(baseEnd, baseFloat, excludedDates);
        // 如果專案整體延遲了 ProjDelay 天，最晚允許日也往後延動 ProjDelay
        const projDelayWorkingDays = Math.max(0, getWorkingDaysCount(originalProjectEndDate, finalProjectEndDate, excludedDates));
        if (projDelayWorkingDays > 0) {
          allowLateEndStr = addDaysWithExclusions(allowLateEndStr, projDelayWorkingDays, excludedDates);
        }
        if (projectExtensionDays > 0) {
          allowLateEndStr = addDaysWithExclusions(allowLateEndStr, projectExtensionDays, excludedDates);
        }
      }

      // 後續任務施加的上限
      let upperBoundStr = allowLateEndStr;
      if (successors.length > 0 && successors[0].lateStartDate) {
        upperBoundStr = successors[0].lateStartDate!;
        for (let j = 1; j < successors.length; j++) {
          if (successors[j].lateStartDate! < upperBoundStr) {
            upperBoundStr = successors[j].lateStartDate!;
          }
        }
      }

      // 綜合評估本任務的最晚完成日：不能晚於後續任務的 lateStart，但不能早於其實際 calculatedEndDate
      let targetLateEnd = upperBoundStr < allowLateEndStr ? upperBoundStr : allowLateEndStr;
      if (task.calculatedEndDate! > targetLateEnd) {
        targetLateEnd = task.calculatedEndDate!;
      }

      const targetLateStart = subtractDaysWithExclusions(targetLateEnd, effDur, excludedDates);

      if (task.lateEndDate !== targetLateEnd || task.lateStartDate !== targetLateStart) {
        task.lateEndDate = targetLateEnd;
        task.lateStartDate = targetLateStart;
        hasChanged = true;
      }
    }
    if (!hasChanged) break;
  }

  // ==================== FLOAT & CRITICAL PATH EVALUATION ====================
  // 浮時計算與要徑判斷：不計工期日不計入工期也不應扣減浮時（採不計工期排除之工作日計法）。如果有 0 浮時的項目，則 0 浮時為要徑；
  // 如果因為展延而無浮時為 0 的項目，以浮時最少的為要徑
  let minFloat = Infinity;
  for (const task of updatedTasks) {
    if (task.calculatedEndDate && task.lateEndDate) {
      const tf = getWorkingDaysCount(task.calculatedEndDate, task.lateEndDate, excludedDates);
      const val = Math.max(0, tf);
      task.totalFloat = val;
      if (val < minFloat) {
        minFloat = val;
      }
    } else {
      task.totalFloat = 0;
    }
  }

  for (const task of updatedTasks) {
    if (task.calculatedEndDate && task.lateEndDate) {
      if (minFloat !== Infinity) {
        if (minFloat > 0) {
          task.isCritical = task.totalFloat === minFloat;
        } else {
          task.isCritical = task.totalFloat === 0;
        }
      } else {
        task.isCritical = task.totalFloat === 0;
      }
    } else {
      task.isCritical = false;
    }
  }

  // ==================== DYNAMIC PROGRESS CALCULATION ====================
  // 工項進度計算：計算當下日期(模擬基準日)在該工項已經進行了幾天，再除上該工項工期，以計算其工項進度 (排除不計工期日期)
  for (const task of updatedTasks) {
    const start = task.calculatedStartDate || task.startDate;
    const end = task.calculatedEndDate || task.endDate;
    
    if (baseDateStr < start) {
      task.progress = 0;
    } else if (baseDateStr >= end) {
      task.progress = 100;
    } else {
      const dur = getWorkingDaysCount(start, end, excludedDates);
      const elapsed = getWorkingDaysCount(start, addDays(baseDateStr, 1), excludedDates);
      task.progress = dur > 0 ? Math.min(100, Math.max(0, Math.round((elapsed / dur) * 100))) : 100;
    }
  }

  return {
    updatedTasks,
    finalProjectEndDate,
    originalProjectEndDate
  };
}

/**
 * 根據時間區間過濾符合的預計進行工項 (檢查工項期間是否與目標區間重疊)
 */
export function filterTasksByPeriod(
  tasks: Task[],
  period: "all" | "today" | "week_in" | "week_out" | "month_in" | "month_out" | "completed" | "delayed" | "affected" | "critical",
  referenceDateStr: string // 當前時間基準 (2026-06-13 等)
): Task[] {
  const refDate = parseDate(referenceDateStr);
  const todayStr = referenceDateStr;
  const oneWeekLaterStr = addDays(todayStr, 7);
  const oneMonthLaterStr = addDays(todayStr, 30);

  return tasks.filter(task => {
    const start = task.calculatedStartDate || task.startDate;
    const end = task.calculatedEndDate || task.endDate;
    const isCompleted = end < todayStr || task.progress === 100;

    switch (period) {
      case "all":
        return true;

      case "completed":
        return isCompleted;
      
      case "today":
        // 工項在今日進行中：開始日期 <= 今日 且 結束日期 >= 今日 (不含已完工)
        return start <= todayStr && end >= todayStr && !isCompleted;
      
      case "week_in":
        // 未來1週內進行中 (今日到 7 天內)：與 [今日, 7天內] 有交集 (不含已完工)
        return start <= oneWeekLaterStr && end >= todayStr && !isCompleted;
        
      case "week_out":
        // 未來1週後：起始日在 7 天後 (且未完工)
        return start > oneWeekLaterStr && !isCompleted;
        
      case "month_in":
        // 未來1個月內：與 [今日, 30天內] 有交集 (不含已完工)
        return start <= oneMonthLaterStr && end >= todayStr && !isCompleted;
        
      case "month_out":
        // 未來1個月後：起始日在 30 天後 (且未完工)
        return start > oneMonthLaterStr && !isCompleted;

      case "delayed":
        // 延宕工項：人為設定了延遲天數，或工期調校後被拉長
        return (task.delayDays || 0) > 0 || (task.adjustedDuration !== undefined && task.adjustedDuration > task.duration);

      case "affected": {
        // 受影響工項：無直接人為延遲，但由於前置工項延誤波及，導致其實際開始/結束日晚於基準規劃日 (排除因不計工期日期產生的挪移)
        const hasDirectDelay = (task.delayDays || 0) > 0 || (task.adjustedDuration !== undefined && task.adjustedDuration > task.duration);
        const baseStart = task.baselineStartDate || task.startDate;
        const baseEnd = task.baselineEndDate || task.endDate;
        const startPushed = (task.calculatedStartDate || task.startDate) > baseStart;
        const endPushed = (task.calculatedEndDate || task.endDate) > baseEnd;
        return (startPushed || endPushed) && !hasDirectDelay;
      }

      case "critical":
        // 要徑工項：具有最小浮時的工項
        return !!task.isCritical;
        
      default:
        return true;
    }
  });
}
