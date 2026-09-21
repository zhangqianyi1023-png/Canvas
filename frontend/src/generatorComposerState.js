export function mergeGeneratorComposerData(generatorData = {}, generationConfig = null) {
  if (!generationConfig || typeof generationConfig !== 'object') {
    return generatorData;
  }
  return {
    ...generationConfig,
    ...generatorData,
  };
}
