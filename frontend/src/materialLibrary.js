export const filterLibraryItems = (items, query, fields) => {
  const normalized = (query || '').trim().toLowerCase();
  if (!normalized) return items;

  return items.filter(item => fields.some(field => (
    String(item?.[field] || '').toLowerCase().includes(normalized)
  )));
};

export const getLibraryProjectName = (kind, item) => {
  const name = String(item?.name || '').trim();
  if (name) return name;
  if (kind === 'product') return '未命名商品';
  if (kind === 'template') return '未命名模板';
  return '未命名素材';
};

const normalizeMaterialUrl = value => String(value || '').trim();

export const normalizeLocalAssetMaterial = (asset = {}) => {
  const url = normalizeMaterialUrl(asset.url);
  if (!url) return null;
  const mediaType = asset.mediaType === 'video'
    ? 'video'
    : asset.mediaType === 'audio'
      ? ''
      : 'image';
  if (!mediaType) return null;
  const createdAt = asset.createdAt || new Date(0).toISOString();
  return {
    id: `asset_${asset.id || asset.sha256 || url}`,
    name: asset.filename || (mediaType === 'video' ? '本地视频素材' : '本地图片素材'),
    imageUrl: url,
    prompt: '',
    type: mediaType,
    source: 'local-asset',
    sourceId: asset.id || asset.sha256 || '',
    byteSize: asset.byteSize || 0,
    createdAt,
    updatedAt: asset.updatedAt || createdAt,
  };
};

export const mergeMaterialSources = (savedMaterials = [], localAssets = []) => {
  const merged = [];
  const seenUrls = new Set();

  savedMaterials.forEach(material => {
    if (!material) return;
    const url = normalizeMaterialUrl(material.imageUrl);
    if (url) seenUrls.add(url);
    merged.push(material);
  });

  localAssets.forEach(asset => {
    const material = normalizeLocalAssetMaterial(asset);
    if (!material) return;
    const url = normalizeMaterialUrl(material.imageUrl);
    if (seenUrls.has(url)) return;
    seenUrls.add(url);
    merged.push(material);
  });

  return merged.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
};
