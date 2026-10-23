import { accountStore } from "@storage/account";
import type { Progress } from "ky";
import api from ".";

export async function downloadFile(
  url: string,
  searchParams?: { [key: string]: string },
  onDownloadProgress?: (progress: Progress) => void
) {
  // Since ky v2, the `timeout` option (10s by default) also bounds body reads
  // in shortcut methods like `.blob()`. The timeout should only cover the
  // request until the response headers arrive; downloading the body may
  // legitimately take longer. Awaiting the raw Response and consuming the body
  // with the native method skips ky's body-read race while keeping the
  // request-phase timeout intact.
  const response = await api.get(url, {
    searchParams,
    onDownloadProgress,
  });
  return await response.blob();
}

export async function uploadFile(url: string, file: File[], onUploadProgress?: (progress: Progress) => void) {
  // console.log("uploadFile");
  const formData = new FormData();
  for (const f of file) {
    formData.append(f.name, f);
  }
  const xhr = new XMLHttpRequest();
  const resp = await new Promise((resolve: (_: string) => void, reject: (_: string) => void) => {
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        onUploadProgress?.({
          percent: (e.loaded / e.total) * 100,
          transferredBytes: e.loaded,
          totalBytes: e.total,
        });
      }
    });
    xhr.addEventListener("loadend", () => {
      if (xhr.readyState === 4 && xhr.status === 200) {
        resolve(xhr.responseText);
      } else {
        reject(xhr.responseText);
      }
    });
    xhr.open("POST", url, true);
    const token = accountStore.token;
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }
    xhr.send(formData);
  });
  return resp;
}
