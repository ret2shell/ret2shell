import { accountStore } from "@storage/account";
import type { Progress } from "ky";
import api from ".";

export async function downloadFile(
  url: string,
  searchParams?: { [key: string]: string },
  onDownloadProgress?: (progress: Progress) => void
) {
  return await api
    .get(url, {
      searchParams,
      onDownloadProgress,
    })
    .blob();
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
