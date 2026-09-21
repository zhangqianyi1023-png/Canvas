export async function parseJsonResponse(response, fallbackLabel = '请求失败') {
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const detail = payload?.detail || payload?.error;
    const fallback = text
      ? `${fallbackLabel}（HTTP ${response.status}）：${text.slice(0, 300)}`
      : `${fallbackLabel}（HTTP ${response.status}）`;
    throw new Error(detail || fallback);
  }

  if (!payload) {
    throw new Error(text ? `后端返回的不是 JSON：${text.slice(0, 300)}` : '后端返回空响应');
  }

  return payload;
}
