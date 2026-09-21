import { preferCanvasServerUrls } from './taskMedia.js';

const GENERATOR_TYPES_WITH_IMAGE_INPUT = new Set([
  'generateText',
  'generateImage',
  'generateVideo',
  'generateStoryboardScript',
]);

const uniqueImages = (values = []) => [...new Set(values.filter(Boolean))];

export function getResultImageReferenceUrls(sourceNode) {
  if (sourceNode?.type !== 'result') return [];
  return preferCanvasServerUrls([
    ...(Array.isArray(sourceNode.data?.imageUrls) ? sourceNode.data.imageUrls : []),
    sourceNode.data?.imageUrl,
  ]);
}

export function getResultCoverImageReference(sourceNode) {
  const images = getResultImageReferenceUrls(sourceNode);
  if (images.length === 0) return '';

  const coverIndex = Number.isInteger(sourceNode?.data?.coverIndex)
    && sourceNode.data.coverIndex >= 0
    && sourceNode.data.coverIndex < images.length
    ? sourceNode.data.coverIndex
    : 0;

  return images[coverIndex] || images[0] || '';
}

export function getConnectedImagesForNewGenerator({
  generatorType,
  sourceNode,
  sourceHandle = null,
}) {
  if (!GENERATOR_TYPES_WITH_IMAGE_INPUT.has(generatorType) || !sourceNode) {
    return [];
  }

  if (sourceNode.type === 'result') {
    const cardMatch = sourceHandle?.match(/^card-(\d+)$/);
    if (cardMatch) {
      const card = sourceNode.data?.storyboardCards?.[Number(cardMatch[1])];
      return uniqueImages([card?.imageUrl]);
    }

    const imageMatch = sourceHandle?.match(/^img-(\d+)$/);
    if (imageMatch) {
      const imageUrl = getResultImageReferenceUrls(sourceNode)[Number(imageMatch[1])];
      return uniqueImages([imageUrl]);
    }

    return uniqueImages([getResultCoverImageReference(sourceNode)]);
  }

  if (sourceNode.type === 'smartSplitter') {
    return uniqueImages([
      ...(sourceNode.data?.connected_images || []),
      ...(sourceNode.data?.uploaded_reference_images || []),
    ]);
  }

  return [];
}
