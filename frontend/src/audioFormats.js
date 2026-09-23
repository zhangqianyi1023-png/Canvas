export const SUPPORTED_AUDIO_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/mp4',
  'audio/aac',
  'audio/ogg',
];

const SUPPORTED_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.webm', '.m4a', '.aac', '.ogg'];
const UNSUPPORTED_AUDIO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.m4v', '.webm.mp4'];

export const SUPPORTED_AUDIO_ACCEPT = [...SUPPORTED_AUDIO_TYPES, ...SUPPORTED_AUDIO_EXTENSIONS].join(',');

export const SUPPORTED_AUDIO_LABEL = 'MP3、WAV、WebM、M4A、AAC、OGG';

export const isSupportedAudioFile = (file) => {
  const mime = String(file?.type || '').toLowerCase();
  const name = String(file?.name || '').toLowerCase();
  if (mime.startsWith('video/')) return false;
  if (UNSUPPORTED_AUDIO_EXTENSIONS.some(ext => name.endsWith(ext))) return false;
  if (SUPPORTED_AUDIO_TYPES.includes(mime)) return true;
  return SUPPORTED_AUDIO_EXTENSIONS.some(ext => name.endsWith(ext));
};

export const getUnsupportedAudioMessage = (count = 1) => (
  count > 1
    ? `已忽略 ${count} 个不支持的音频格式，仅支持 ${SUPPORTED_AUDIO_LABEL}`
    : `音频格式不支持，仅支持 ${SUPPORTED_AUDIO_LABEL}`
);
