// Web Audio: synthesized sound effects, no audio files at all.
// Nothing is created until unlock() runs inside a user gesture (iOS requirement).

let ctx = null;
let masterGain = null;
let musicGain = null;
let sfxGain = null;
let noiseBuffer = null;
let muted = false;
const volumes = { music: 0.35, sfx: 0.8 };

export const getContext = () => ctx;
export const getMusicGain = () => musicGain;
export const isReady = () => !!ctx && ctx.state === 'running';

export function applySettings(settings) {
  muted = !!settings.muted;
  volumes.sfx = settings.sfx;
  volumes.music = settings.music;
  if (!ctx) return;
  masterGain.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.02);
  sfxGain.gain.setTargetAtTime(volumes.sfx, ctx.currentTime, 0.02);
  musicGain.gain.setTargetAtTime(volumes.music, ctx.currentTime, 0.02);
}

// Must be called from a user gesture handler.
export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
    } catch (err) {
      return false;
    }
    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : 1;
    masterGain.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = volumes.music;
    musicGain.connect(masterGain);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = volumes.sfx;
    sfxGain.connect(masterGain);

    // One second of white noise, reused by every percussive effect.
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  return true;
}

function tone(spec) {
  if (!ctx) return;
  const t0 = ctx.currentTime + (spec.at || 0);
  const duration = spec.duration;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = spec.type || 'square';
  osc.frequency.setValueAtTime(spec.freq, t0);
  if (spec.endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, spec.endFreq), t0 + duration);
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(spec.volume || 0.3, t0 + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0008, t0 + duration);
  osc.connect(env);
  env.connect(sfxGain);
  osc.start(t0);
  osc.stop(t0 + duration + 0.03);
}

function noise(spec) {
  if (!ctx || !noiseBuffer) return;
  const t0 = ctx.currentTime + (spec.at || 0);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(spec.freq || 1800, t0);
  if (spec.endFreq) filter.frequency.exponentialRampToValueAtTime(spec.endFreq, t0 + spec.duration);
  const env = ctx.createGain();
  env.gain.setValueAtTime(spec.volume || 0.3, t0);
  env.gain.exponentialRampToValueAtTime(0.0008, t0 + spec.duration);
  src.connect(filter);
  filter.connect(env);
  env.connect(sfxGain);
  src.start(t0);
  src.stop(t0 + spec.duration + 0.02);
}

const NOTE = { C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880, B5: 987.77, C6: 1046.5, E6: 1318.5, G6: 1568 };

function arpeggio(freqs, step, type, volume) {
  freqs.forEach((freq, i) => {
    tone({ freq, type: type || 'square', duration: step * 1.6, at: i * step, volume: volume || 0.22 });
  });
}

export function playSfx(kind) {
  if (!isReady() || muted) return;
  switch (kind) {
    case 'key':
      tone({ freq: 880, type: 'triangle', duration: 0.03, volume: 0.12 });
      break;
    case 'hit':
      noise({ freq: 2200, endFreq: 400, duration: 0.09, volume: 0.28 });
      tone({ freq: 120, endFreq: 60, type: 'square', duration: 0.1, volume: 0.22 });
      break;
    case 'good':
      tone({ freq: NOTE.C5, type: 'triangle', duration: 0.11, volume: 0.28 });
      break;
    case 'perfect':
      arpeggio([NOTE.C5, NOTE.G5], 0.06, 'triangle', 0.26);
      break;
    case 'excellent':
      arpeggio([NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6], 0.055, 'square', 0.2);
      tone({ freq: NOTE.E6, type: 'triangle', duration: 0.22, at: 0.22, volume: 0.18 });
      break;
    case 'slow':
      tone({ freq: 330, type: 'triangle', duration: 0.16, volume: 0.2 });
      break;
    case 'wrong':
      tone({ freq: 220, endFreq: 150, type: 'square', duration: 0.22, volume: 0.24 });
      tone({ freq: 110, endFreq: 80, type: 'sawtooth', duration: 0.26, at: 0.05, volume: 0.16 });
      break;
    case 'timeout':
      tone({ freq: 440, endFreq: 180, type: 'sawtooth', duration: 0.34, volume: 0.2 });
      break;
    case 'lifeLost':
      tone({ freq: 392, type: 'square', duration: 0.13, volume: 0.22 });
      tone({ freq: 294, type: 'square', duration: 0.22, at: 0.13, volume: 0.22 });
      break;
    case 'enemyDeath':
      noise({ freq: 1400, endFreq: 200, duration: 0.3, volume: 0.26 });
      tone({ freq: 300, endFreq: 55, type: 'sawtooth', duration: 0.34, volume: 0.2 });
      break;
    case 'levelUp':
      arpeggio([NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6], 0.085, 'square', 0.2);
      break;
    case 'boss':
      tone({ freq: 150, endFreq: 70, type: 'sawtooth', duration: 0.5, volume: 0.26 });
      tone({ freq: 220, type: 'square', duration: 0.3, at: 0.2, volume: 0.18 });
      break;
    case 'achievement':
      arpeggio([NOTE.G5, NOTE.C6, NOTE.E6, NOTE.G6], 0.07, 'triangle', 0.24);
      break;
    case 'gameOver':
      tone({ freq: NOTE.C5, type: 'triangle', duration: 0.18, volume: 0.3 });
      tone({ freq: 415.3, type: 'triangle', duration: 0.18, at: 0.19, volume: 0.3 });
      tone({ freq: 349.23, type: 'triangle', duration: 0.2, at: 0.38, volume: 0.3 });
      tone({ freq: 261.63, type: 'triangle', duration: 0.5, at: 0.58, volume: 0.3 });
      break;
    case 'tick':
      tone({ freq: 1200, type: 'square', duration: 0.025, volume: 0.1 });
      break;
    default:
      break;
  }
}
