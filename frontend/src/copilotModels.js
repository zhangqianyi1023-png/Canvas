const clean = value => String(value || '').trim();

export function formatCopilotModelName(modelName) {
  const value = clean(modelName);
  if (!value) return '未知模型';
  return value
    .replace(/^gpt[-_]/i, 'GPT ')
    .replace(/^deepseek[-_]/i, 'DeepSeek ')
    .replace(/^gemini[-_]/i, 'Gemini ')
    .replace(/^claude[-_]/i, 'Claude ')
    .replace(/[-_]+/g, ' ')
    .replace(/\b(r\d+)\b/gi, token => token.toUpperCase())
    .replace(/\b(v\d+)\b/gi, token => token.toUpperCase())
    .replace(/\b(luna|sol|flash|pro|sonnet|opus|haiku)\b/gi, token => (
      token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
    ));
}

export function buildCopilotModelOptions(runtimeSettings = {}) {
  const providers = Array.isArray(runtimeSettings.providers) ? runtimeSettings.providers : [];
  const activeProviderId = clean(runtimeSettings.activeProviderId);
  const options = [];

  providers.forEach((provider) => {
    const providerId = clean(provider?.id);
    if (!providerId) return;
    const modelNames = [...new Set([
      clean(provider?.defaultTextModel),
      ...(Array.isArray(provider?.textModels) ? provider.textModels.map(clean) : []),
    ].filter(Boolean))];
    const available = provider?.enabled !== false
      && Boolean(clean(provider?.baseUrl))
      && Boolean(clean(provider?.apiKey));

    modelNames.forEach((modelName) => {
      options.push({
        id: `${providerId}::${modelName}`,
        providerId,
        providerName: clean(provider?.name) || '模型服务',
        modelName,
        label: formatCopilotModelName(modelName),
        available,
        isDefault: modelName === clean(provider?.defaultTextModel),
        isActiveProvider: providerId === activeProviderId,
      });
    });
  });

  return options.sort((left, right) => {
    if (left.available !== right.available) return left.available ? -1 : 1;
    if (left.isActiveProvider !== right.isActiveProvider) return left.isActiveProvider ? -1 : 1;
    if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
    return left.label.localeCompare(right.label, 'zh-CN');
  });
}
