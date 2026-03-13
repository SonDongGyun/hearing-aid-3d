/**
 * Generate realistic environment audio samples as WAV files
 * Run: node scripts/generate-audio.js
 */
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const DURATION = 10; // seconds per clip
const NUM_SAMPLES = SAMPLE_RATE * DURATION;

// --- WAV file writer ---
function writeWav(filename, samples) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = SAMPLE_RATE * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = samples.length * 2;

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
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

  fs.writeFileSync(filename, buffer);
  console.log(`  Created: ${filename} (${(buffer.length / 1024).toFixed(0)} KB)`);
}

// --- DSP helpers ---
function noise() { return Math.random() * 2 - 1; }

function bandpass(samples, centerFreq, bandwidth) {
  // Simple 2-pole bandpass via biquad coefficients
  const w0 = 2 * Math.PI * centerFreq / SAMPLE_RATE;
  const Q = centerFreq / bandwidth;
  const alpha = Math.sin(w0) / (2 * Q);

  const b0 = alpha;
  const b1 = 0;
  const b2 = -alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * Math.cos(w0);
  const a2 = 1 - alpha;

  return applyBiquad(samples, b0/a0, b1/a0, b2/a0, a1/a0, a2/a0);
}

function lowpass(samples, freq) {
  const w0 = 2 * Math.PI * freq / SAMPLE_RATE;
  const Q = 0.707;
  const alpha = Math.sin(w0) / (2 * Q);

  const b0 = (1 - Math.cos(w0)) / 2;
  const b1 = 1 - Math.cos(w0);
  const b2 = (1 - Math.cos(w0)) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * Math.cos(w0);
  const a2 = 1 - alpha;

  return applyBiquad(samples, b0/a0, b1/a0, b2/a0, a1/a0, a2/a0);
}

function highpass(samples, freq) {
  const w0 = 2 * Math.PI * freq / SAMPLE_RATE;
  const Q = 0.707;
  const alpha = Math.sin(w0) / (2 * Q);

  const b0 = (1 + Math.cos(w0)) / 2;
  const b1 = -(1 + Math.cos(w0));
  const b2 = (1 + Math.cos(w0)) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * Math.cos(w0);
  const a2 = 1 - alpha;

  return applyBiquad(samples, b0/a0, b1/a0, b2/a0, a1/a0, a2/a0);
}

function applyBiquad(samples, b0, b1, b2, a1, a2) {
  const out = new Float64Array(samples.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    out[i] = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x;
    y2 = y1; y1 = out[i];
  }
  return out;
}

function sine(freq, phase = 0) {
  const out = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    out[i] = Math.sin(2 * Math.PI * freq * i / SAMPLE_RATE + phase);
  }
  return out;
}

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

function multiply(a, b) {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] * b[i];
  return out;
}

function generateNoise(n) {
  const out = new Float64Array(n || NUM_SAMPLES);
  for (let i = 0; i < out.length; i++) out[i] = noise();
  return out;
}

// Create speech-like formant synthesis
function generateSpeech(f0, formants, modRate) {
  const out = new Float64Array(NUM_SAMPLES);
  // Glottal pulse train (sawtooth-ish)
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    // Vibrato
    const vibrato = 1 + 0.02 * Math.sin(2 * Math.PI * 5.5 * t);
    const phase = f0 * vibrato * t;
    // Glottal waveform approximation
    const p = phase % 1;
    out[i] = p < 0.4 ? (p / 0.4) : -(1 - (p - 0.4) / 0.6);
  }

  // Apply formant filters (vocal tract resonances)
  let filtered = out;
  for (const [freq, bw, gain] of formants) {
    const formantSignal = bandpass(filtered, freq, bw);
    filtered = mix([filtered, formantSignal], [0.3, gain]);
  }

  // Speech rhythm envelope (syllable modulation)
  const envelope = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    // Irregular syllable pattern
    const syllable = Math.sin(2 * Math.PI * modRate * t)
      * Math.sin(2 * Math.PI * (modRate * 0.37) * t + 1.2);
    envelope[i] = 0.3 + 0.7 * Math.max(0, syllable);
    // Add random pauses
    const pausePhase = Math.sin(2 * Math.PI * 0.3 * t + 0.5);
    if (pausePhase < -0.6) envelope[i] *= 0.1;
  }

  return multiply(filtered, envelope);
}

// --- Environment generators ---

function generateCafe() {
  console.log('Generating: cafe.wav');

  // 1. Background chatter (multiple filtered noise streams)
  const chatter1 = bandpass(generateNoise(), 800, 600);
  const chatter2 = bandpass(generateNoise(), 1500, 800);
  const chatter3 = bandpass(generateNoise(), 2200, 500);
  // Modulate chatter with slow envelope for natural feel
  const chatterEnv = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    chatterEnv[i] = 0.5 + 0.5 * Math.sin(t * 0.8) * Math.sin(t * 1.3 + 2);
  }
  const chatter = multiply(mix([chatter1, chatter2, chatter3], [0.4, 0.3, 0.2]), chatterEnv);

  // 2. Background music (soft melodic tones)
  const musicNotes = [220, 261.6, 329.6, 392, 440];
  const musicLayers = [];
  const musicGains = [];
  for (let n = 0; n < musicNotes.length; n++) {
    const noteSignal = new Float64Array(NUM_SAMPLES);
    for (let i = 0; i < NUM_SAMPLES; i++) {
      const t = i / SAMPLE_RATE;
      // Each note fades in/out at different times
      const noteEnv = Math.sin(Math.PI * ((t * 0.15 + n * 0.2) % 1));
      noteSignal[i] = Math.sin(2 * Math.PI * musicNotes[n] * t) * noteEnv;
    }
    musicLayers.push(noteSignal);
    musicGains.push(0.03);
  }
  const music = lowpass(mix(musicLayers, musicGains), 2000);

  // 3. Cup/dish clinking (short bursts of high freq noise)
  const clinks = new Float64Array(NUM_SAMPLES);
  const clinkTimes = [0.8, 2.1, 3.5, 4.2, 5.8, 6.5, 7.9, 9.1];
  for (const ct of clinkTimes) {
    const startSample = Math.floor(ct * SAMPLE_RATE);
    const duration = Math.floor(0.05 * SAMPLE_RATE);
    for (let i = 0; i < duration && startSample + i < NUM_SAMPLES; i++) {
      const env = Math.exp(-i / (duration * 0.15));
      clinks[startSample + i] = noise() * env;
    }
  }
  const clinkFiltered = highpass(bandpass(clinks, 4000, 3000), 2000);

  // 4. Clear voice (companion speaking)
  const voice = generateSpeech(140, [
    [700, 200, 0.8],   // F1
    [1200, 250, 0.6],  // F2
    [2600, 300, 0.4],  // F3
  ], 3.2);

  return mix(
    [chatter, music, clinkFiltered, voice],
    [0.25, 0.15, 0.12, 0.35]
  );
}

function generateStreet() {
  console.log('Generating: street.wav');

  // 1. Traffic rumble (low frequency noise)
  const rumbleNoise = lowpass(generateNoise(), 200);
  const rumbleEnv = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    // Cars passing by
    rumbleEnv[i] = 0.4 + 0.6 * (
      Math.max(0, Math.sin(t * 0.5)) * 0.5 +
      Math.max(0, Math.sin(t * 0.3 + 1)) * 0.3 +
      Math.max(0, Math.sin(t * 0.7 + 2.5)) * 0.2
    );
  }
  const traffic = multiply(rumbleNoise, rumbleEnv);

  // 2. Tire/road noise (mid-band)
  const roadNoise = bandpass(generateNoise(), 500, 400);
  const roadEnv = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    roadEnv[i] = 0.3 + 0.4 * Math.abs(Math.sin(t * 0.4));
  }
  const road = multiply(roadNoise, roadEnv);

  // 3. Honking (periodic horn blasts)
  const honks = new Float64Array(NUM_SAMPLES);
  const honkTimes = [1.5, 4.0, 6.8, 8.5];
  const honkFreqs = [520, 580, 490, 550];
  for (let h = 0; h < honkTimes.length; h++) {
    const start = Math.floor(honkTimes[h] * SAMPLE_RATE);
    const dur = Math.floor((0.3 + Math.random() * 0.4) * SAMPLE_RATE);
    for (let i = 0; i < dur && start + i < NUM_SAMPLES; i++) {
      const t = i / SAMPLE_RATE;
      const env = Math.min(1, i / (0.02 * SAMPLE_RATE)) * Math.min(1, (dur - i) / (0.02 * SAMPLE_RATE));
      honks[start + i] = (Math.sin(2 * Math.PI * honkFreqs[h] * t)
        + 0.3 * Math.sin(2 * Math.PI * honkFreqs[h] * 1.5 * t)) * env;
    }
  }

  // 4. Wind noise
  const wind = lowpass(bandpass(generateNoise(), 300, 500), 800);
  const windEnv = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    windEnv[i] = 0.3 + 0.7 * (Math.sin(t * 0.2) * 0.5 + 0.5);
  }
  const windFinal = multiply(wind, windEnv);

  // 5. Companion voice (harder to hear over traffic)
  const voice = generateSpeech(120, [
    [600, 180, 0.7],
    [1100, 220, 0.5],
    [2500, 280, 0.3],
  ], 3.0);

  return mix(
    [traffic, road, honks, windFinal, voice],
    [0.35, 0.15, 0.2, 0.1, 0.2]
  );
}

function generateConversation() {
  console.log('Generating: conversation.wav');

  // 1. Room tone (very quiet AC/ventilation hum)
  const hum = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    hum[i] = Math.sin(2 * Math.PI * 100 * t) * 0.3
      + Math.sin(2 * Math.PI * 200 * t) * 0.15
      + noise() * 0.05;
  }
  const roomTone = lowpass(hum, 300);

  // 2. Voice 1 - lower pitch (male-like)
  const voice1 = generateSpeech(110, [
    [500, 150, 0.9],
    [1000, 200, 0.7],
    [2400, 250, 0.4],
  ], 2.8);

  // 3. Voice 2 - higher pitch (female-like), offset timing
  const voice2Raw = generateSpeech(200, [
    [800, 180, 0.8],
    [1400, 250, 0.6],
    [2800, 300, 0.4],
  ], 3.5);
  // Offset: voice2 speaks when voice1 pauses
  const voice2Env = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    // Alternate speaking turns (~2s each)
    const turn = Math.sin(2 * Math.PI * 0.25 * t);
    voice2Env[i] = Math.max(0, -turn) * 0.8 + 0.1;
  }
  const voice2 = multiply(voice2Raw, voice2Env);

  // Adjust voice1 to alternate too
  const voice1Env = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    const turn = Math.sin(2 * Math.PI * 0.25 * t);
    voice1Env[i] = Math.max(0, turn) * 0.8 + 0.1;
  }
  const voice1Final = multiply(voice1, voice1Env);

  return mix(
    [roomTone, voice1Final, voice2],
    [0.1, 0.45, 0.4]
  );
}

function generateNature() {
  console.log('Generating: nature.wav');

  // 1. Wind through trees
  const windNoise = bandpass(generateNoise(), 400, 600);
  const windEnv = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    windEnv[i] = 0.3 + 0.7 * (
      Math.sin(t * 0.15) * 0.4 + 0.5 +
      Math.sin(t * 0.4 + 1) * 0.1
    );
  }
  const wind = multiply(windNoise, windEnv);

  // 2. Bird songs (multiple chirps at high frequencies)
  const birds = new Float64Array(NUM_SAMPLES);
  // Bird 1: rapid chirps
  const bird1Times = [0.5, 0.7, 0.9, 2.5, 2.7, 2.9, 5.0, 5.2, 5.4, 7.5, 7.7, 7.9];
  for (const bt of bird1Times) {
    const start = Math.floor(bt * SAMPLE_RATE);
    const dur = Math.floor(0.12 * SAMPLE_RATE);
    for (let i = 0; i < dur && start + i < NUM_SAMPLES; i++) {
      const t = i / SAMPLE_RATE;
      const env = Math.sin(Math.PI * i / dur);
      const freqSweep = 3000 + 1500 * (i / dur); // upward chirp
      birds[start + i] += Math.sin(2 * Math.PI * freqSweep * t) * env * 0.5;
    }
  }
  // Bird 2: two-tone song
  const bird2Times = [1.5, 3.8, 6.2, 8.8];
  for (const bt of bird2Times) {
    for (let note = 0; note < 3; note++) {
      const start = Math.floor((bt + note * 0.25) * SAMPLE_RATE);
      const dur = Math.floor(0.18 * SAMPLE_RATE);
      const freq = note % 2 === 0 ? 4200 : 3400;
      for (let i = 0; i < dur && start + i < NUM_SAMPLES; i++) {
        const t = i / SAMPLE_RATE;
        const env = Math.sin(Math.PI * i / dur);
        birds[start + i] += Math.sin(2 * Math.PI * freq * t) * env * 0.3;
      }
    }
  }

  // 3. Water stream (filtered noise with gentle modulation)
  const waterNoise = bandpass(generateNoise(), 2000, 3000);
  const waterEnv = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    waterEnv[i] = 0.4 + 0.3 * Math.sin(t * 1.5) + 0.2 * Math.sin(t * 2.7 + 1);
  }
  const water = multiply(waterNoise, waterEnv);

  // 4. Companion voice
  const voice = generateSpeech(150, [
    [650, 170, 0.8],
    [1150, 230, 0.6],
    [2700, 280, 0.4],
  ], 2.5);
  // Voice only speaks intermittently
  const voiceEnv = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    // Speak for ~2s, pause for ~3s
    const phase = (t % 5) / 5;
    voiceEnv[i] = phase < 0.4 ? Math.sin(Math.PI * phase / 0.4) : 0;
  }
  const voiceFinal = multiply(voice, voiceEnv);

  return mix(
    [wind, birds, water, voiceFinal],
    [0.2, 0.18, 0.15, 0.35]
  );
}

// --- Main ---
const outDir = path.join(__dirname, '..', 'public', 'audio');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

console.log('Generating environment audio samples...\n');

writeWav(path.join(outDir, 'cafe.wav'), generateCafe());
writeWav(path.join(outDir, 'street.wav'), generateStreet());
writeWav(path.join(outDir, 'conversation.wav'), generateConversation());
writeWav(path.join(outDir, 'nature.wav'), generateNature());

console.log('\nDone! Files saved to public/audio/');
