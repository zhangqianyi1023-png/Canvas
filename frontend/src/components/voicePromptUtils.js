export const appendVoicePromptText = (currentValue, nextText) => {
  const current = String(currentValue || '').trim();
  const addition = String(nextText || '').trim();
  if (!addition) return currentValue || '';
  return current ? `${current}\n${addition}` : addition;
};
