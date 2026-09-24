import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon';

const VOICE_INPUT_BAR_COUNT = 22;
const VOICE_INPUT_DEMO_TEXT = '用自然清晰的画面表达主体动作和场景氛围，节奏流畅，细节丰富。';

const DEFAULT_LABELS = {
  voiceInput: '语音输入',
  voicePanel: '语音输入模块',
  voiceListening: '聆听中...',
  voiceRecognizing: '识别中...',
  voicePolishing: 'AI 润色中...',
  voiceCancel: '取消语音输入',
  voiceDone: '完成',
  voiceComplete: '完成语音输入',
  micUnsupported: '当前浏览器不支持麦克风录音',
  micPermission: '请允许麦克风权限后再使用语音输入',
};

const createVoiceBars = () => Array.from({ length: VOICE_INPUT_BAR_COUNT }, () => 0.18);

export default function VoicePromptInput({ disabled = false, onComplete, labels = DEFAULT_LABELS }) {
  const resolvedLabels = { ...DEFAULT_LABELS, ...labels };
  const [phase, setPhase] = useState('idle');
  const [bars, setBars] = useState(() => createVoiceBars());
  const [error, setError] = useState('');
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(0);
  const timersRef = useRef([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(timerId => window.clearTimeout(timerId));
    timersRef.current = [];
  }, []);

  const stopRecording = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
    }
    streamRef.current?.getTracks?.().forEach(track => track.stop());
    streamRef.current = null;
    audioContextRef.current?.close?.().catch(() => {});
    audioContextRef.current = null;
    analyserRef.current = null;
  }, []);

  const cancelVoiceInput = useCallback(() => {
    clearTimers();
    stopRecording();
    setPhase('idle');
    setError('');
    setBars(createVoiceBars());
  }, [clearTimers, stopRecording]);

  useEffect(() => () => {
    clearTimers();
    stopRecording();
  }, [clearTimers, stopRecording]);

  const tickVoiceBars = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let index = 0; index < data.length; index += 1) {
        const centered = (data[index] - 128) / 128;
        sum += centered * centered;
      }
      const rms = Math.sqrt(sum / data.length);
      const level = Math.min(1, Math.max(0, (rms - 0.015) * 8));
      setBars(previous => previous.map((item, index) => {
        const wave = 0.55 + Math.sin((Date.now() / 120) + index * 0.75) * 0.45;
        const target = 0.14 + level * (0.22 + wave * 0.78);
        return item * 0.62 + Math.min(1, target) * 0.38;
      }));
      animationFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const startVoiceInput = useCallback(async () => {
    if (disabled || phase !== 'idle') return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(resolvedLabels.micUnsupported);
      return;
    }
    setError('');
    setPhase('listening');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContextClass();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      streamRef.current = stream;
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      tickVoiceBars();
    } catch {
      stopRecording();
      setPhase('idle');
      setError(resolvedLabels.micPermission);
    }
  }, [disabled, phase, resolvedLabels.micPermission, resolvedLabels.micUnsupported, stopRecording, tickVoiceBars]);

  const finishVoiceInput = useCallback(() => {
    if (phase !== 'listening') return;
    stopRecording();
    setPhase('recognizing');
    timersRef.current = [
      window.setTimeout(() => setPhase('polishing'), 900),
      window.setTimeout(() => {
        onComplete?.(VOICE_INPUT_DEMO_TEXT);
        setPhase('idle');
        setBars(createVoiceBars());
      }, 1800),
    ];
  }, [onComplete, phase, stopRecording]);

  if (phase === 'idle') {
    return (
      <button
        type="button"
        className="processor-voice-trigger"
        aria-label={resolvedLabels.voiceInput}
        title={error || resolvedLabels.voiceInput}
        disabled={disabled}
        onClick={startVoiceInput}
      >
        <Icon name="mic" size={18} />
      </button>
    );
  }

  const statusText = phase === 'listening'
    ? resolvedLabels.voiceListening
    : phase === 'recognizing'
      ? resolvedLabels.voiceRecognizing
      : resolvedLabels.voicePolishing;

  return (
    <div className={`processor-voice-panel is-${phase}`} role="group" aria-label={resolvedLabels.voicePanel}>
      <button
        type="button"
        className="processor-voice-cancel"
        onClick={cancelVoiceInput}
        aria-label={resolvedLabels.voiceCancel}
        title={resolvedLabels.voiceDone}
      >
        <Icon name="x" size={17} />
      </button>
      <div className="processor-voice-content">
        <span className="processor-voice-status">{statusText}</span>
        <div className="processor-voice-bars" aria-hidden="true">
          {bars.map((height, index) => (
            <span key={index} style={{ '--voice-bar-level': height }} />
          ))}
        </div>
      </div>
      <button
        type="button"
        className="processor-voice-complete"
        onClick={phase === 'listening' ? finishVoiceInput : undefined}
        disabled={phase !== 'listening'}
        aria-label={phase === 'listening' ? resolvedLabels.voiceComplete : statusText}
        title={phase === 'listening' ? resolvedLabels.voiceDone : statusText}
      >
        <Icon name={phase === 'listening' ? 'check' : 'loader'} size={17} />
      </button>
    </div>
  );
}
