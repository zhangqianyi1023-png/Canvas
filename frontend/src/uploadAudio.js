import { API_BASE } from './apiBase';

export const uploadAudioFile = (file, onProgress) => new Promise((resolve, reject) => {
  const xhr = new XMLHttpRequest();
  const formData = new FormData();
  formData.append('file', file);

  xhr.upload.onprogress = (event) => {
    if (!event.lengthComputable) return;
    const progress = Math.round((event.loaded / event.total) * 100);
    onProgress?.(progress);
  };

  xhr.onload = () => {
    let payload = null;
    try {
      payload = JSON.parse(xhr.responseText || '{}');
    } catch {
      payload = null;
    }

    if (xhr.status >= 200 && xhr.status < 300 && payload?.success && payload.asset?.url) {
      onProgress?.(100);
      resolve(payload.asset);
      return;
    }

    const message = payload?.detail || payload?.error || `音频上传失败（HTTP ${xhr.status}）`;
    reject(new Error(message));
  };

  xhr.onerror = () => reject(new Error('音频上传失败，请检查后端服务是否正常'));
  xhr.open('POST', `${API_BASE}/api/uploads/audio`);
  xhr.send(formData);
});
