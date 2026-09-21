export const buildLoginPayload = (username, password) => ({
  username: String(username || '').trim(),
  password: String(password || ''),
});

export const getLoginValidationError = (username, password) => {
  const payload = buildLoginPayload(username, password);
  if (!payload.username) return '请输入用户名';
  if (!payload.password) return '请输入密码';
  return '';
};

export const getLoginErrorMessage = (payload) => (
  payload?.detail || payload?.error || '登录失败，请稍后重试'
);
