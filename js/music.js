// A small chiptune loop, scheduled note by note — no audio files.
// Uses the lookahead pattern: a timer wakes up often and schedules every note
// that falls into the next window, so the loop stays tight even if the timer
// itself drifts.

import { getContext, getMusicGain } from './audio.js';

const BPM = 132;
const STEP_S = 60 / BPM / 4;            // one sixteenth
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.15;

const R = null;                          // rest
// 32 steps in A minor, two bars. Lead carries the tune, bass the pulse.
const LEAD = [
  57, R, 60, R, 64, R, 62, R, 60, R, 57, R, 55, R, R, R,
  57, R, 60, R, 65, R, 64, R, 62, R, 60, R, 57, R, R, R,
];
const BASS = [
  33, R, R, R, 40, R, R, R, 33, R, R, R, 40, R, R, R,
  29, R, R, R, 36, R, R, R, 31, R, R, R, 38, R, R, R,
];
const ARP = [
  R, 69, R, 72, R, 76, R, 72, R, 69, R, 72, R, 76, R, 72,
  R, 69, R, 72, R, 77, R, 72, R, 69, R, 71, R, 74, R, 71,
];

const TRACKS = [
  { steps: LEAD, type: 'square', gain: 0.16, length: 0.9 },
  { steps: BASS, type: 'triangle', gain: 0.24, length: 2.6 },
  { steps: ARP, type: 'square', gain: 0.05, length: 0.6 },
];

const midiToFreq = (note) => 440 * Math.pow(2, (note - 69) / 12);

let busGain = null;
let timer = 0;
let nextNoteTime = 0;
let step = 0;
let running = false;

function noteAt(track, midi, time) {
  const ctx = getContext();
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  const duration = STEP_S * track.length;
  osc.type = track.type;
  osc.frequency.setValueAtTime(midiToFreq(midi), time);
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(track.gain, time + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0008, time + duration);
  osc.connect(env);
  env.connect(busGain);
  osc.start(time);
  osc.stop(time + duration + 0.02);
}

function scheduler() {
  const ctx = getContext();
  if (!ctx || !busGain) return;
  while (nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
    for (const track of TRACKS) {
      const midi = track.steps[step % track.steps.length];
      if (midi !== null) noteAt(track, midi, nextNoteTime);
    }
    nextNoteTime += STEP_S;
    step += 1;
  }
}

export function start() {
  const ctx = getContext();
  const musicGain = getMusicGain();
  if (!ctx || !musicGain || running) return;
  if (!busGain) {
    busGain = ctx.createGain();
    busGain.gain.value = 1;
    busGain.connect(musicGain);
  }
  running = true;
  step = 0;
  nextNoteTime = ctx.currentTime + 0.08;
  scheduler();
  timer = setInterval(scheduler, LOOKAHEAD_MS);
}

export function stop() {
  running = false;
  clearInterval(timer);
  timer = 0;
}

export const isPlaying = () => running;

// Quieter behind menus and the solution card, without touching the user's volume.
export function setDucked(ducked) {
  const ctx = getContext();
  if (!ctx || !busGain) return;
  busGain.gain.setTargetAtTime(ducked ? 0.35 : 1, ctx.currentTime, 0.08);
}
