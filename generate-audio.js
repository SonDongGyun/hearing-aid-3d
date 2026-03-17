/**
 * Generate WAV audio samples for SoundClear hearing aid demo
 * Each file has two distinct layers:
 *   1. Background noise (non-speech frequencies: <250Hz and >4000Hz)
 *   2. Speech-like content (300-3400Hz voice band)
 *
 * Run: node generate-audio.js
 * Output: public/audio/{cafe,street,conversation,nature}.wav
 */
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const DURATION = 10;
const NUM_SAMPLES = SAMPLE_RATE * DURATION;
const TWO_PI = 2 * Math.PI;

// ============================================================
// WAV writer (44100Hz, 16-bit, mono, no dependencies)
// ============================================================
function writeWav(filepath, samples) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = SAMPLE_RATE * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);            // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }

  fs.writeFileSync(filepath, buffer);
  const kb = (buffer.length / 1024).toFixed(0);
  console.log(`  Created: ${filepath} (${kb} KB)`);
}

// ============================================================
// DSP helpers
// ============================================================

// --- Seeded PRNG for reproducibility ---
let _seed = 12345;
function seededRandom() {
  _seed = (_seed * 16807 + 0) % 2147483647;
  return (_seed - 1) / 2147483646;
}
function resetSeed(s) { _seed = s; }

function noise() { return seededRandom() * 2 - 1; }

function generateNoise(n) {
  const out = new Float64Array(n || NUM_SAMPLES);
  for (let i = 0; i < out.length; i++) out[i] = noise();
  return out;
}

// Biquad filter (direct form I)
function applyBiquad(samples, b0, b1, b2, a1, a2) {
  const out = new Float64Array(samples.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y;
    x2 = x1; x1 = x;
    y2 = y1; y1 = y;
  }
  return out;
}

function lowpass(samples, freq, Q) {
  Q = Q || 0.707;
  const w0 = TWO_PI * freq / SAMPLE_RATE;
  const alpha = Math.sin(w0) / (2 * Q);
  const cosw = Math.cos(w0);
  const b0 = (1 - cosw) / 2, b1 = 1 - cosw, b2 = b0;
  const a0 = 1 + alpha, a1 = -2 * cosw, a2 = 1 - alpha;
  return applyBiquad(samples, b0/a0, b1/a0, b2/a0, a1/a0, a2/a0);
}

function highpass(samples, freq, Q) {
  Q = Q || 0.707;
  const w0 = TWO_PI * freq / SAMPLE_RATE;
  const alpha = Math.sin(w0) / (2 * Q);
  const cosw = Math.cos(w0);
  const b0 = (1 + cosw) / 2, b1 = -(1 + cosw), b2 = b0;
  const a0 = 1 + alpha, a1 = -2 * cosw, a2 = 1 - alpha;
  return applyBiquad(samples, b0/a0, b1/a0, b2/a0, a1/a0, a2/a0);
}

function bandpass(samples, centerFreq, bandwidth) {
  const w0 = TWO_PI * centerFreq / SAMPLE_RATE;
  const Q = centerFreq / Math.max(bandwidth, 1);
  const alpha = Math.sin(w0) / (2 * Q);
  const cosw = Math.cos(w0);
  const b0 = alpha, b1 = 0, b2 = -alpha;
  const a0 = 1 + alpha, a1 = -2 * cosw, a2 = 1 - alpha;
  return applyBiquad(samples, b0/a0, b1/a0, b2/a0, a1/a0, a2/a0);
}

// Cascade two filters for steeper rolloff
function lowpassSteep(samples, freq) {
  return lowpass(lowpass(samples, freq), freq);
}
function highpassSteep(samples, freq) {
  return highpass(highpass(samples, freq), freq);
}

// Mix arrays with gains
function mix(arrays, gains) {
  const out = new Float64Array(NUM_SAMPLES);
  for (let a = 0; a < arrays.length; a++) {
    const arr = arrays[a];
    const g = gains[a];
    for (let i = 0; i < NUM_SAMPLES; i++) {
      out[i] += (arr[i] || 0) * g;
    }
  }
  return out;
}

// Element-wise multiply
function multiply(a, b) {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] * (b[i] || 0);
  return out;
}

// Add two arrays
function add(a, b) {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] || 0);
  return out;
}

// Scale an array
function scale(arr, g) {
  const out = new Float64Array(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = arr[i] * g;
  return out;
}

// Generate a sine wave
function sine(freq, phase) {
  phase = phase || 0;
  const out = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    out[i] = Math.sin(TWO_PI * freq * i / SAMPLE_RATE + phase);
  }
  return out;
}

// Generate a detuned warm tone (fundamental + slight detune copies)
function warmTone(freq, detuneHz) {
  detuneHz = detuneHz || 0.5;
  return mix(
    [sine(freq), sine(freq + detuneHz), sine(freq - detuneHz)],
    [0.5, 0.25, 0.25]
  );
}

// Smooth envelope to avoid clicks (simple lowpass on an envelope signal)
function smoothEnvelope(env, cutoff) {
  cutoff = cutoff || 15;
  return lowpass(env, cutoff, 0.5);
}

// Fade in/out for loopable edges (0.5s each)
function applyLoopFade(samples) {
  const fadeLen = Math.floor(0.5 * SAMPLE_RATE);
  const out = new Float64Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    let gain = 1.0;
    if (i < fadeLen) {
      // Smooth cosine fade in
      gain = 0.5 * (1 - Math.cos(Math.PI * i / fadeLen));
    } else if (i >= samples.length - fadeLen) {
      const j = samples.length - 1 - i;
      gain = 0.5 * (1 - Math.cos(Math.PI * j / fadeLen));
    }
    out[i] = samples[i] * gain;
  }
  return out;
}

// Normalize to peak amplitude
function normalize(samples, peak) {
  peak = peak || 0.7;
  let max = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > max) max = abs;
  }
  if (max === 0) return samples;
  const g = peak / max;
  const out = new Float64Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * g;
  return out;
}

// ============================================================
// Speech-like synthesis using additive sine harmonics + AM
// ============================================================
function generateVoice(fundamental, harmonicGains, rhythmHz, options) {
  options = options || {};
  const speakDur = options.speakDur || 2.0;   // seconds speaking
  const pauseDur = options.pauseDur || 0.5;    // seconds pause
  const offset = options.offset || 0;          // time offset in seconds
  const detuneAmt = options.detune || 0.3;     // Hz detune for warmth

  // Build harmonic stack
  const layers = [];
  const gains = [];
  for (let h = 0; h < harmonicGains.length; h++) {
    const hFreq = fundamental * (h + 1);
    if (hFreq > SAMPLE_RATE / 2) break;
    // Warm detuned tone for each harmonic
    layers.push(warmTone(hFreq, detuneAmt * (h + 1)));
    gains.push(harmonicGains[h]);
  }
  const raw = mix(layers, gains);

  // Syllable-level amplitude modulation (speech rhythm)
  const amEnv = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    // Syllable AM: half-rectified sine for natural pulsing
    const syllable = Math.max(0, Math.sin(TWO_PI * rhythmHz * t));
    // Gentle secondary modulation for variation
    const variation = 0.8 + 0.2 * Math.sin(TWO_PI * 0.7 * t + 1.3);
    amEnv[i] = syllable * variation;
  }

  // Speaking/pause envelope (turn-taking)
  const turnEnv = new Float64Array(NUM_SAMPLES);
  const cycleDur = speakDur + pauseDur;
  const rampLen = 0.05 * SAMPLE_RATE; // 50ms ramp
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE - offset;
    const phase = ((t % cycleDur) + cycleDur) % cycleDur;
    if (phase < speakDur) {
      // Inside speaking segment
      if (phase < 0.05) {
        turnEnv[i] = phase / 0.05; // ramp in
      } else if (phase > speakDur - 0.05) {
        turnEnv[i] = (speakDur - phase) / 0.05; // ramp out
      } else {
        turnEnv[i] = 1.0;
      }
    } else {
      turnEnv[i] = 0.0;
    }
  }

  const smoothTurn = smoothEnvelope(turnEnv, 20);
  return multiply(multiply(raw, amEnv), smoothTurn);
}

// ============================================================
// Environment: Cafe
// ============================================================
function generateCafe() {
  console.log('Generating: cafe.wav');
  resetSeed(42);

  // --- BACKGROUND LAYER (non-speech: <250Hz and >4000Hz) ---

  // 1. Espresso machine low rumble (80-150Hz)
  const espresso1 = warmTone(90, 0.8);
  const espresso2 = warmTone(130, 1.0);
  const espressoEnv = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    espressoEnv[i] = 0.3 + 0.2 * Math.sin(TWO_PI * 0.15 * t)
                    + 0.1 * Math.sin(TWO_PI * 0.07 * t + 0.5);
  }
  const espresso = multiply(mix([espresso1, espresso2], [0.5, 0.5]), espressoEnv);

  // 2. Soft background music tones (200-400Hz, cycling 3-4 notes, very quiet)
  // Keep below 250Hz emphasis for background classification
  const musicNotes = [200, 220, 240, 210]; // cycling notes
  const musicSignal = new Float64Array(NUM_SAMPLES);
  const noteDur = SAMPLE_RATE * 2.5; // each note ~2.5s
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const noteIdx = Math.floor(i / noteDur) % musicNotes.length;
    const notePhase = (i % noteDur) / noteDur;
    const noteEnv = Math.sin(Math.PI * notePhase); // smooth swell
    const t = i / SAMPLE_RATE;
    musicSignal[i] = (Math.sin(TWO_PI * musicNotes[noteIdx] * t)
                    + 0.3 * Math.sin(TWO_PI * musicNotes[noteIdx] * 2 * t)) * noteEnv;
  }
  const musicFiltered = lowpass(scale(musicSignal, 1), 250);

  // 3. High-frequency sparkle of cups/glasses (3000-6000Hz)
  const tinkles = new Float64Array(NUM_SAMPLES);
  const tinkleTimes = [];
  for (let t = 0.3; t < DURATION; t += 0.4 + seededRandom() * 0.8) {
    tinkleTimes.push(t);
  }
  for (const tt of tinkleTimes) {
    const start = Math.floor(tt * SAMPLE_RATE);
    const dur = Math.floor((0.02 + seededRandom() * 0.05) * SAMPLE_RATE);
    const freq = 3500 + seededRandom() * 2500;
    for (let i = 0; i < dur && start + i < NUM_SAMPLES; i++) {
      const t = i / SAMPLE_RATE;
      const env = Math.exp(-i / (dur * 0.2));
      tinkles[start + i] += Math.sin(TWO_PI * freq * t) * env;
    }
  }
  const tinkleFiltered = highpassSteep(tinkles, 4000);

  // 4. Distant crowd murmur (broadband but filtered, low amp) - mostly outside speech band
  const crowdNoise = generateNoise();
  const crowdLow = lowpassSteep(crowdNoise, 200);
  const crowdHigh = highpassSteep(crowdNoise, 4500);
  const crowdBg = add(scale(crowdLow, 0.3), scale(crowdHigh, 0.15));

  const background = mix(
    [espresso, musicFiltered, tinkleFiltered, crowdBg],
    [0.25, 0.08, 0.12, 0.15]
  );

  // --- VOICE LAYER (300-3400Hz speech band) ---

  // Pattern 1: Lower voice
  const voice1 = generateVoice(150, [1.0, 0.7, 0.4, 0.2], 4, {
    speakDur: 2.5, pauseDur: 2.5, offset: 0, detune: 0.4
  });

  // Pattern 2: Higher voice responding
  const voice2 = generateVoice(220, [1.0, 0.6, 0.35, 0.15], 4.5, {
    speakDur: 2.0, pauseDur: 3.0, offset: 2.8, detune: 0.35
  });

  const voiceLayer = mix([voice1, voice2], [0.35, 0.30]);

  // Combine and finalize
  const combined = add(background, voiceLayer);
  return applyLoopFade(normalize(combined, 0.7));
}

// ============================================================
// Environment: Street
// ============================================================
function generateStreet() {
  console.log('Generating: street.wav');
  resetSeed(99);

  // --- BACKGROUND LAYER ---

  // 1. Deep traffic rumble (40-120Hz)
  const rumble1 = warmTone(50, 1.0);
  const rumble2 = warmTone(80, 1.5);
  const rumble3 = warmTone(110, 0.8);
  const rumbleEnv = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    rumbleEnv[i] = 0.5 + 0.3 * Math.sin(TWO_PI * 0.08 * t)
                 + 0.2 * Math.sin(TWO_PI * 0.13 * t + 2.1);
  }
  const rumble = multiply(mix([rumble1, rumble2, rumble3], [0.4, 0.35, 0.25]), rumbleEnv);

  // 2. Horn-like tones (400-800Hz, brief bursts every 2-3s)
  // These cross into speech band slightly but are brief and tonal
  const horns = new Float64Array(NUM_SAMPLES);
  const hornTimes = [1.2, 3.5, 6.1, 8.7];
  const hornFreqs = [520, 580, 490, 550];
  for (let h = 0; h < hornTimes.length; h++) {
    const start = Math.floor(hornTimes[h] * SAMPLE_RATE);
    const dur = Math.floor(0.3 * SAMPLE_RATE);
    for (let i = 0; i < dur && start + i < NUM_SAMPLES; i++) {
      const t = i / SAMPLE_RATE;
      // Smooth attack/decay envelope
      const env = Math.sin(Math.PI * i / dur);
      horns[start + i] = (Math.sin(TWO_PI * hornFreqs[h] * t)
        + 0.4 * Math.sin(TWO_PI * hornFreqs[h] * 1.5 * t)
        + 0.2 * Math.sin(TWO_PI * hornFreqs[h] * 2 * t)) * env;
    }
  }

  // 3. Wind whoosh (filtered noise 100-1000Hz, slow AM at 0.3Hz)
  const windRaw = generateNoise();
  const windFiltered = lowpass(highpass(windRaw, 100), 1000);
  const windEnv = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    windEnv[i] = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(TWO_PI * 0.3 * t));
  }
  const wind = multiply(windFiltered, windEnv);
  // Keep only low part for background
  const windBg = lowpassSteep(wind, 250);

  // 4. High tire/road noise (2000-5000Hz, continuous but quiet)
  const tireNoise = highpassSteep(bandpass(generateNoise(), 3500, 2000), 4000);
  const tireEnv = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    tireEnv[i] = 0.5 + 0.2 * Math.sin(TWO_PI * 0.2 * t);
  }
  const tire = multiply(tireNoise, tireEnv);

  const background = mix(
    [rumble, horns, windBg, tire],
    [0.30, 0.15, 0.12, 0.10]
  );

  // --- VOICE LAYER ---
  // Single companion voice (180Hz fundamental, rich harmonics up to 2500Hz)
  // Speech rhythm 4Hz, pauses every 2-3 seconds
  const voice = generateVoice(180, [1.0, 0.8, 0.6, 0.4, 0.25, 0.15, 0.08], 4, {
    speakDur: 2.0, pauseDur: 1.0, offset: 0.3, detune: 0.3
  });

  // Add secondary phrasing: longer pauses interspersed
  const phraseEnv = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    // Speak ~2.5s, pause ~1s pattern with variation
    const phase = ((t + 0.2) % 3.5) / 3.5;
    if (phase < 0.65) {
      phraseEnv[i] = Math.sin(Math.PI * phase / 0.65);
    } else {
      phraseEnv[i] = 0;
    }
  }
  const voiceLayer = multiply(voice, smoothEnvelope(phraseEnv, 10));

  const combined = add(background, scale(voiceLayer, 0.35));
  return applyLoopFade(normalize(combined, 0.7));
}

// ============================================================
// Environment: Conversation
// ============================================================
function generateConversation() {
  console.log('Generating: conversation.wav');
  resetSeed(777);

  // --- BACKGROUND LAYER (very quiet indoor room) ---

  // 1. AC/ventilation hum (120Hz + 240Hz harmonic, very steady)
  const acHum = add(
    scale(warmTone(120, 0.3), 0.6),
    scale(warmTone(240, 0.2), 0.3)
  );
  const acEnv = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    acEnv[i] = 0.9 + 0.1 * Math.sin(TWO_PI * 0.05 * t); // very steady
  }
  const ac = multiply(acHum, acEnv);

  // 2. Faint room tone (broadband, very low amplitude)
  const roomNoise = lowpassSteep(generateNoise(), 200);

  const background = mix([ac, roomNoise], [0.12, 0.04]);

  // --- VOICE LAYER ---

  // Speaker 1 (male-like): fundamental 130Hz, harmonics at 260, 390, 520, 1040Hz
  // Speak ~2s, pause 0.5s
  const speaker1 = generateVoice(130, [1.0, 0.7, 0.5, 0.35, 0, 0, 0, 0.2], 3.5, {
    speakDur: 2.0, pauseDur: 2.5, offset: 0, detune: 0.3
  });

  // Speaker 2 (female-like): fundamental 230Hz, harmonics at 460, 690, 920, 1840Hz
  // Speak ~1.5s, pause 0.5s, offset to alternate with speaker 1
  const speaker2 = generateVoice(230, [1.0, 0.6, 0.4, 0.3, 0, 0, 0, 0.15], 4.2, {
    speakDur: 1.5, pauseDur: 3.0, offset: 2.3, detune: 0.25
  });

  const voiceLayer = mix([speaker1, speaker2], [0.40, 0.38]);

  const combined = add(background, voiceLayer);
  return applyLoopFade(normalize(combined, 0.7));
}

// ============================================================
// Environment: Nature
// ============================================================
function generateNatureEnv() {
  console.log('Generating: nature.wav');
  resetSeed(333);

  // --- BACKGROUND LAYER ---

  // 1. Wind through trees (filtered noise 80-600Hz, slow AM at 0.15Hz)
  const windRaw = generateNoise();
  const windFiltered = lowpass(highpass(windRaw, 80), 600);
  const windEnv = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    windEnv[i] = 0.4 + 0.4 * (0.5 + 0.5 * Math.sin(TWO_PI * 0.15 * t))
               + 0.1 * Math.sin(TWO_PI * 0.4 * t + 1.2);
  }
  const wind = multiply(windFiltered, windEnv);
  const windBg = lowpassSteep(wind, 250); // keep in background band

  // 2. Bird chirps (2500-4500Hz, random timing, 50-150ms, freq sweep)
  const birds = new Float64Array(NUM_SAMPLES);
  const birdTimes = [];
  let bt = 0.4;
  while (bt < DURATION - 0.3) {
    birdTimes.push(bt);
    bt += 0.5 + seededRandom() * 1.0; // every 0.5-1.5s
  }
  for (const bTime of birdTimes) {
    const start = Math.floor(bTime * SAMPLE_RATE);
    const dur = Math.floor((0.05 + seededRandom() * 0.1) * SAMPLE_RATE); // 50-150ms
    const baseFreq = 2500 + seededRandom() * 2000;
    const sweepRange = 500 + seededRandom() * 800;
    for (let i = 0; i < dur && start + i < NUM_SAMPLES; i++) {
      const t = i / SAMPLE_RATE;
      const env = Math.sin(Math.PI * i / dur); // smooth chirp envelope
      const freq = baseFreq + sweepRange * (i / dur); // upward sweep
      birds[start + i] += Math.sin(TWO_PI * freq * t) * env;
      // Add a harmonic for richness
      birds[start + i] += 0.3 * Math.sin(TWO_PI * freq * 1.5 * t) * env;
    }
  }
  const birdsFiltered = highpassSteep(birds, 4000);

  // 3. Distant water/stream (filtered noise 800-3000Hz, gentle, continuous)
  const waterRaw = generateNoise();
  const waterFiltered = bandpass(waterRaw, 1800, 2000);
  const waterEnv = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    waterEnv[i] = 0.4 + 0.15 * Math.sin(TWO_PI * 0.5 * t)
                + 0.1 * Math.sin(TWO_PI * 1.2 * t + 0.7);
  }
  const water = multiply(waterFiltered, waterEnv);
  // Split water: keep high part for background
  const waterBg = highpassSteep(water, 4000);

  const background = mix(
    [windBg, birdsFiltered, waterBg],
    [0.20, 0.15, 0.10]
  );

  // --- VOICE LAYER ---
  // Companion pointing things out: voice 200Hz fundamental, speak 1.5s, pause 2s
  const voice = generateVoice(200, [1.0, 0.7, 0.5, 0.3, 0.15, 0.08], 3.5, {
    speakDur: 1.5, pauseDur: 2.0, offset: 0.5, detune: 0.35
  });

  const voiceLayer = scale(voice, 0.35);

  const combined = add(background, voiceLayer);
  return applyLoopFade(normalize(combined, 0.7));
}

// ============================================================
// Main
// ============================================================
const outDir = path.join(__dirname, 'public', 'audio');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

console.log('Generating environment audio samples for SoundClear...\n');

writeWav(path.join(outDir, 'cafe.wav'), generateCafe());
writeWav(path.join(outDir, 'street.wav'), generateStreet());
writeWav(path.join(outDir, 'conversation.wav'), generateConversation());
writeWav(path.join(outDir, 'nature.wav'), generateNatureEnv());

// Verify
console.log('\nVerifying output files...');
const expectedSize = 44 + NUM_SAMPLES * 2; // header + data
const files = ['cafe.wav', 'street.wav', 'conversation.wav', 'nature.wav'];
let allGood = true;
for (const f of files) {
  const fp = path.join(outDir, f);
  if (fs.existsSync(fp)) {
    const stat = fs.statSync(fp);
    const ok = stat.size === expectedSize;
    console.log(`  ${f}: ${(stat.size / 1024).toFixed(0)} KB ${ok ? '(OK)' : '(SIZE MISMATCH!)'}`);
    if (!ok) allGood = false;
  } else {
    console.log(`  ${f}: MISSING!`);
    allGood = false;
  }
}

console.log(allGood ? '\nAll files generated successfully!' : '\nSome files had issues!');
