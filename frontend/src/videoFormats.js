export const SUPPORTED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

export const SUPPORTED_VIDEO_ACCEPT = SUPPORTED_VIDEO_TYPES.join(',');

export const SUPPORTED_VIDEO_LABEL = 'MP4、MOV、WebM';

export const isSupportedVideoFile = (file) => SUPPORTED_VIDEO_TYPES.includes(file?.type);

export const getUnsupportedVideoMessage = (count = 1) => (
  count > 1
    ? `已忽略 ${count} 个不支持的视频格式，仅支持 ${SUPPORTED_VIDEO_LABEL}`
    : `视频格式不支持，仅支持 ${SUPPORTED_VIDEO_LABEL}`
);
