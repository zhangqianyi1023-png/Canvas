import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import GenerateCreditButton from './GenerateCreditButton';

const VOICE_INPUT_BAR_COUNT = 8;
const VOICE_INPUT_DEMO_TEXT = '用自然清晰的画面表达主体动作和场景氛围，节奏流畅，细节丰富。';
const VOICE_DOT_VISUAL_WEIGHTS = [0.18, 0.36, 0.68, 1, 0.9, 0.62, 0.34, 0.2];
const VOICE_DOT_PHASE_OFFSETS = [0.2, 1.4, 2.2, 0.7, 2.8, 1.1, 2.5, 0.9];

const createVoiceDots = () => Array.from({ length: VOICE_INPUT_BAR_COUNT }, (_, index) => index);
const createVoiceLevels = () => Array.from({ length: VOICE_INPUT_BAR_COUNT }, () => 0);
const clampVoiceLevel = value => Math.min(1, Math.max(0, value));

export default function ProcessorVoiceGenerateControl({
  voiceDisabled = false,
  labels = {},
  onVoiceComplete,
  creditButtonProps = {},
}) {
  const [phase, setPhase] = useState('idle');
  const [sendHover, setSendHover] = useState(false);
  const [voiceLevels, setVoiceLevels] = useState(() => createVoiceLevels());
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioSourceRef = useRef(null);
  const boostGainRef = useRef(null);
  const silentGainRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(0);
  const timerRef = useRef(null);

  const stopRecording = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
    }
    streamRef.current?.getTracks?.().forEach(track => track.stop());
    streamRef.current = null;
    audioContextRef.current?.close?.().catch(() => {});
    audioContextRef.current = null;
    audioSourceRef.current = null;
    boostGainRef.current = null;
    silentGainRef.current = null;
    analyserRef.current = null;
  }, []);

  const resetVoice = useCallback(() => {
    window.clearTimeout(timerRef.current);
    stopRecording();
    setPhase('idle');
    setSendHover(false);
    setVoiceLevels(createVoiceLevels());
  }, [stopRecording]);

  useEffect(() => () => {
    window.clearTimeout(timerRef.current);
    stopRecording();
  }, [stopRecording]);

  const startVoiceInput = useCallback(async () => {
    if (voiceDisabled || phase !== 'idle') return;
    if (!navigator.mediaDevices?.getUserMedia) {
      window.alert(labels.micUnsupported || '当前浏览器不支持麦克风录音');
      return;
    }
    setPhase('listening');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContextClass();
      await audioContext.resume?.();
      const analyser = audioContext.createAnalyser();
      const boostGain = audioContext.createGain();
      const silentGain = audioContext.createGain();
      analyser.fftSize = 512;
      analyser.minDecibels = -95;
      analyser.maxDecibels = -12;
      analyser.smoothingTimeConstant = 0.22;
      boostGain.gain.value = 3.2;
      silentGain.gain.value = 0;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(boostGain);
      boostGain.connect(analyser);
      analyser.connect(silentGain);
      silentGain.connect(audioContext.destination);
      streamRef.current = stream;
      audioContextRef.current = audioContext;
      audioSourceRef.current = source;
      boostGainRef.current = boostGain;
      silentGainRef.current = silentGain;
      analyserRef.current = analyser;
      const timeData = new Uint8Array(analyser.fftSize);
      const frequencyData = new Uint8Array(analyser.frequencyBinCount);
      let rmsNoiseFloor = 0;
      let frequencyNoiseFloor = 0;
      let calibrationFrames = 0;
      const tick = () => {
        if (audioContext.state === 'suspended') {
          audioContext.resume?.().catch(() => {});
        }
        analyser.getByteTimeDomainData(timeData);
        analyser.getByteFrequencyData(frequencyData);
        let sum = 0;
        for (let index = 0; index < timeData.length; index += 1) {
          const centered = (timeData[index] - 128) / 128;
          sum += centered * centered;
        }
        const rms = Math.sqrt(sum / timeData.length);
        let frequencySum = 0;
        const frequencyEnd = Math.min(frequencyData.length, 96);
        for (let index = 2; index < frequencyEnd; index += 1) {
          frequencySum += frequencyData[index] / 255;
        }
        const frequencyAverage = frequencySum / Math.max(1, frequencyEnd - 2);
        const isCalibrating = calibrationFrames < 18;
        if (isCalibrating) {
          rmsNoiseFloor = calibrationFrames === 0
            ? rms
            : rmsNoiseFloor * 0.82 + rms * 0.18;
          frequencyNoiseFloor = calibrationFrames === 0
            ? frequencyAverage
            : frequencyNoiseFloor * 0.82 + frequencyAverage * 0.18;
        }
        const activeRms = Math.max(0, rms - rmsNoiseFloor * 1.25 - 0.0008);
        const activeFrequency = Math.max(0, frequencyAverage - frequencyNoiseFloor * 1.15 - 0.0018);
        const voiceEnergy = clampVoiceLevel(Math.max(
          activeRms * 42,
          Math.pow(activeRms, 0.66) * 9.8,
          activeFrequency * 3.8,
          Math.pow(activeFrequency, 0.58) * 2.2,
        ));
        calibrationFrames += 1;
        const displayEnergy = voiceEnergy > 0.016 ? Math.min(0.78, Math.pow(voiceEnergy, 0.78)) : 0;
        const now = performance.now();
        const frameLevels = VOICE_DOT_VISUAL_WEIGHTS.map((weight, dotIndex) => {
          if (!displayEnergy) return 0;
          const primaryPulse = 0.88 + Math.sin(now / 118 + VOICE_DOT_PHASE_OFFSETS[dotIndex]) * 0.13;
          const secondaryPulse = 0.96 + Math.sin(now / 191 + dotIndex * 0.73) * 0.05;
          const target = displayEnergy * weight * primaryPulse * secondaryPulse;
          return target > 0.018 ? Math.max(0.1, clampVoiceLevel(target)) : 0;
        });
        setVoiceLevels(previous => previous.map((item, index) => {
          const target = frameLevels[index] || 0;
          const nextLevel = target > item
            ? item * 0.42 + target * 0.58
            : item * 0.28 + target * 0.72;
          return nextLevel < 0.02 ? 0 : nextLevel;
        }));
        animationFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setPhase('idle');
      setVoiceLevels(createVoiceLevels());
      window.alert(labels.micPermission || '请允许麦克风权限后再使用语音输入');
    }
  }, [labels.micPermission, labels.micUnsupported, phase, voiceDisabled]);

  const confirmVoiceInput = useCallback(() => {
    if (phase !== 'listening') return;
    stopRecording();
    setSendHover(false);
    setPhase('submitting');
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      onVoiceComplete?.(VOICE_INPUT_DEMO_TEXT);
      setPhase('idle');
      setVoiceLevels(createVoiceLevels());
    }, 2000);
  }, [onVoiceComplete, phase, stopRecording]);

  if (phase === 'submitting') {
    return (
      <div className="processor-voice-generate-control is-submitting">
        <button
          type="button"
          className="processor-voice-generate-loading"
          disabled
          aria-label={labels.voiceRecognizing || '识别中'}
          title={labels.voiceRecognizing || '识别中'}
        >
          <Icon name="loader" size={18} />
        </button>
      </div>
    );
  }

  if (phase === 'listening') {
    return (
      <div className="processor-voice-generate-control is-listening">
        <button
          type="button"
          className="processor-voice-generate-cancel"
          onClick={resetVoice}
          aria-label={labels.voiceCancel || '取消语音输入'}
          title={labels.voiceCancel || '取消'}
        >
          <Icon name="x" size={18} />
        </button>
        <button
          type="button"
          className={`processor-voice-generate-confirm ${sendHover ? 'is-send-hover' : ''}`}
          onClick={confirmVoiceInput}
          onPointerLeave={() => setSendHover(false)}
          aria-label={labels.voiceComplete || '完成语音输入'}
          title={labels.voiceDone || '确定'}
        >
          <span className="processor-voice-generate-dots left" aria-hidden="true">
            {createVoiceDots().map(index => (
              <i key={`left-${index}`} style={{ '--voice-level': voiceLevels[index] || 0 }} />
            ))}
          </span>
          <span className="processor-voice-generate-label">发送</span>
          <span className="processor-voice-generate-dots right" aria-hidden="true">
            {createVoiceDots().slice(0, 4).map(index => (
              <i key={`right-${index}`} style={{ '--voice-level': voiceLevels[index + 3] || 0 }} />
            ))}
          </span>
          <span
            className="processor-voice-generate-arrow"
            aria-hidden="true"
            onPointerEnter={() => setSendHover(true)}
          >
            <Icon name="check" size={17} />
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="processor-voice-generate-control">
      <button
        type="button"
        className="processor-voice-trigger"
        aria-label={labels.voiceInput || '语音输入'}
        title={labels.voiceInput || '语音输入'}
        disabled={voiceDisabled}
        onClick={startVoiceInput}
      >
        <Icon name="mic" size={18} />
      </button>
      <GenerateCreditButton {...creditButtonProps} />
    </div>
  );
}
