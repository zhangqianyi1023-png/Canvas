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

export const SUPPORTED_AUDIO_ACCEPT = SUPPORTED_AUDIO_TYPES.join(',');

export const SUPPORTED_AUDIO_LABEL = 'MP3、WAV、WebM、M4A、AAC、OGG';

export const isSupportedAudioFile = (file) => {
  const mime = String(file?.type || '').toLowerCase();
  if (SUPPORTED_AUDIO_TYPES.includes(mime)) return true;
  const name = String(file?.name || '').toLowerCase();
  return SUPPORTED_AUDIO_EXTENSIONS.some(ext => name.endsWith(ext));
};

export const getUnsupportedAudioMessage = (count = 1) => (
  count > 1
    ? `已忽略 ${count} 个不支持的音频格式，仅支持 ${SUPPORTED_AUDIO_LABEL}`
    : `音频格式不支持，仅支持 ${SUPPORTED_AUDIO_LABEL}`
);
