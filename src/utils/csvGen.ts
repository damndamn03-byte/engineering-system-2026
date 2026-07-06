import { Task } from "../types";

/**
 * 匯出排程資料表為 UTF-8 BOM 格式之 Excel / CSV 可直接辨識檔案
 */
export function downloadScheduleCSV(projectName: string, tasks: Task[]) {
  // \uFEFF 是 UTF-8 BOM 開頭，可以讓 Excel 雙擊開啟時，直接以 UTF-8 繁體中文正確解碼，避免亂碼
  const BOM = "\uFEFF";
  
  const headers = [
    "工項編號 (ID)",
    "工項名稱 (Task Name)",
    "原本預估工期 (天)",
    "原始預定開始 (Original Start)",
    "原始預定結束 (Original End)",
    "手動調整延遲天數 (Delay)",
    "調整後工期天數 (Adjusted Duration)",
    "重新預估開始日期 (Recalculated Start)",
    "重新預估完工日期 (Recalculated End)",
    "當前進度 (Progress %)",
    "前置工項 (Predecessors)",
    "是否影響最終完工日 (On Critical Path)"
  ];

  const rows = tasks.map(task => [
    task.id,
    task.name.replace(/"/g, '""'), // 雙引號溢出字元
    task.duration,
    task.startDate,
    task.endDate,
    task.delayDays || 0,
    task.adjustedDuration !== undefined ? task.adjustedDuration : task.duration,
    task.calculatedStartDate || task.startDate,
    task.calculatedEndDate || task.endDate,
    `${task.progress}%`,
    task.predecessors ? task.predecessors.join(";") : "無",
    task.isCritical ? "是 (影響)" : "否 (不影響)"
  ]);

  const csvContent = [
    [`專案工程名稱: ,${(projectName || "未命名專案").replace(/"/g, '""')}`],
    [`匯出日期: ,${new Date().toISOString().split("T")[0]}`],
    [],
    headers,
    ...rows
  ].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n");

  const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  
  const cleanName = (projectName || "工程排程").trim().replace(/[\/:*?"<>|]/g, "_");
  link.setAttribute("href", url);
  link.setAttribute("download", `工程排程重新計算清單_${cleanName}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
export default downloadScheduleCSV;
