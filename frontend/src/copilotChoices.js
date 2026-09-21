const cleanText = (value, maxLength) => String(value || '').trim().slice(0, maxLength);

export function normalizeCopilotChoices(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.options)) {
    throw new Error('Copilot 没有返回有效的选项');
  }
  if (value.options.length < 2 || value.options.length > 6) {
    throw new Error('Copilot 单次只能提供 2 到 6 个选项');
  }

  const question = cleanText(value.question, 300);
  if (!question) throw new Error('Copilot 返回的选项缺少问题');

  const ids = new Set();
  const options = value.options.map((option) => {
    const id = cleanText(option?.id, 80);
    const label = cleanText(option?.label, 60);
    const submitText = cleanText(option?.submit_text ?? option?.submitText, 600);
    if (!id || ids.has(id)) throw new Error('Copilot 返回了重复或空的选项标识');
    if (!label || !submitText) throw new Error('Copilot 返回的选项不完整');
    ids.add(id);
    return {
      id,
      label,
      description: cleanText(option.description, 180),
      submitText,
    };
  });

  return { question, options };
}
