import { ProjectState } from "../types";

const STATE_FILENAME = "engineering_schedule_state.json";

/**
 * 依工程案名稱取得在 Google Drive 的檔名
 */
export function getFileNameForProject(projectName: string): string {
  if (!projectName || projectName.trim() === "" || projectName.trim() === "台北市信義區新建工程計畫") {
    return STATE_FILENAME;
  }
  // 去除不合法的檔名符號
  const sanitized = projectName.replace(/[\/\\?%*:|"<>\s]+/g, "_");
  return `engineering_schedule_state_${sanitized}.json`;
}

/**
 * 在 Google Drive 中尋找特定檔名是否已有儲存好的排程狀態檔
 */
export async function findStateFile(accessToken: string, fileName: string = STATE_FILENAME): Promise<{ id: string } | null> {
  try {
    const url = `https://www.googleapis.com/drive/v3/files?q=name='${fileName}' and trashed=false&fields=files(id,name)`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Google Drive API 查詢失敗 (${res.status}): ${res.statusText}`);
    }

    const data = await res.json();
    if (data.files && data.files.length > 0) {
      return { id: data.files[0].id };
    }
    return null;
  } catch (error: any) {
    const is401 = error?.message?.includes("401") || String(error).includes("401");
    if (is401) {
      console.warn("尋找雲端硬碟檔案出錯 (401 - 授權過期或無效)");
    } else {
      console.error("尋找雲端硬碟檔案出錯:", error);
    }
    throw error;
  }
}

/**
 * 列出 Google Drive 中所有符合檔名含有 "engineering_schedule_state" 的檔案，以供切換工程案
 */
export async function listStateFiles(accessToken: string): Promise<Array<{ id: string; name: string; modifiedTime?: string }>> {
  try {
    const url = `https://www.googleapis.com/drive/v3/files?q=name contains 'engineering_schedule_state' and trashed=false&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Google Drive API 列表查詢失敗 (${res.status}): ${res.statusText}`);
    }

    const data = await res.json();
    return data.files || [];
  } catch (error: any) {
    const is401 = error?.message?.includes("401") || String(error).includes("401");
    if (is401) {
      console.warn("列出雲端硬碟檔案出錯 (401 - 授權過期或無效)");
    } else {
      console.error("列出雲端硬碟檔案出錯:", error);
    }
    throw error;
  }
}

/**
 * 從 Google Drive 載入排程狀態檔的具體 JSON 內容
 */
export async function loadStateFile(accessToken: string, fileId: string): Promise<ProjectState | null> {
  try {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Google Drive API 讀取失敗 (${res.status}): ${res.statusText}`);
    }

    const data = await res.json();
    return data as ProjectState;
  } catch (error: any) {
    const is401 = error?.message?.includes("401") || String(error).includes("401");
    if (is401) {
      console.warn("載入雲端硬碟進度出錯 (401 - 授權過期或無效)");
    } else {
      console.error("載入雲端硬碟進度出錯:", error);
    }
    throw error;
  }
}

/**
 * 儲存或更新排程狀態至 Google Drive
 */
export async function saveStateFile(
  accessToken: string,
  state: ProjectState,
  fileId?: string,
  customFileName?: string
): Promise<{ id: string }> {
  try {
    const stateString = JSON.stringify(state, null, 2);
    const fileName = customFileName || getFileNameForProject(state.projectName);

    if (fileId) {
      // 檔案已存在，使用 PATCH 覆蓋內容 (uploadType=media)
      const url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: stateString,
      });

      if (!res.ok) {
        throw new Error(`Google Drive 檔案更新失敗 (${res.status}): ${res.statusText}`);
      }

      return { id: fileId };
    } else {
      // 檔案不存在，使用 multipart/related 新增檔案
      const url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
      const boundary = "boundary_marker_gantt_applet";
      
      const metadata = {
        name: fileName,
        mimeType: "application/json",
      };

      const body = [
        `\r\n--${boundary}\r\n`,
        "Content-Type: application/json; charset=UTF-8\r\n\r\n",
        JSON.stringify(metadata),
        `\r\n--${boundary}\r\n`,
        "Content-Type: application/json\r\n\r\n",
        stateString,
        `\r\n--${boundary}--`
      ].join("");

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: body,
      });

      if (!res.ok) {
        throw new Error(`Google Drive 檔案建立失敗 (${res.status}): ${res.statusText}`);
      }

      const data = await res.json();
      return { id: data.id };
    }
  } catch (error: any) {
    const is401 = error?.message?.includes("401") || String(error).includes("401");
    if (is401) {
      console.warn("儲存雲端硬碟進度出錯 (401 - 授權過期或無效)");
    } else {
      console.error("儲存雲端硬碟進度出錯:", error);
    }
    throw error;
  }
}
