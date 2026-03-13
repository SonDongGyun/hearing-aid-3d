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

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
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

function generateNoise(n) {
  const out = new Float64Array(n || NUM_SAMPLES);
  for (let i = 0; i < out.length; i++) out[i] = noise();
  return out;
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

function bandpass(samples, centerFreq, bandwidth) {
  const w0 = 2 * Math.PI * centerFreq / SAMPLE_RATE;
  const Q = centerFreq / bandwidth;
  const alpha = Math.sin(w0) / (2 * Q);
  const b0 = alpha, b1 = 0, b2 = -alpha;
  const a0 = 1 + alpha, a1 = -2 * Math.cos(w0), a2 = 1 - alpha;
  return applyBiquad(samples, b0/a0, b1/a0, b2/a0, a1/a0, a2/a0);
}

function lowpass(samples, freq) {
  const w0 = 2 * Math.PI * freq / SAMPLE_RATE;
  const alpha = Math.sin(w0) / (2 * 0.707);
  const b0 = (1 - Math.cos(w0)) / 2, b1 = 1 - Math.cos(w0), b2 = b0;
  const a0 = 1 + alpha, a1 = -2 * Math.cos(w0), a2 = 1 - alpha;
  return applyBiquad(samples, b0/a0, b1/a0, b2/a0, a1/a0, a2/a0);
}

function highpass(samples, freq) {
  const w0 = 2 * Math.PI * freq / SAMPLE_RATE;
  const alpha = Math.sin(w0) / (2 * 0.707);
  const b0 = (1 + Math.cos(w0)) / 2, b1 = -(1 + Math.cos(w0)), b2 = b0;
  const a0 = 1 + alpha, a1 = -2 * Math.cos(w0), a2 = 1 - alpha;
  return applyBiquad(samples, b0/a0, b1/a0, b2/a0, a1/a0, a2/a0);
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

// --- Speech-shaped murmur (NOT formant synthesis) ---
// Creates a natural "people talking" sound using filtered noise with speech-like rhythm
function generateMurmur(pitchCenter, rhythmSpeed, options = {}) {
  const { speakRatio = 0.7, pauseChance = 0.3 } = options;

  // Start with white noise, filter to speech frequency range (300-3500Hz)
  const raw = generateNoise();
  // Multiple overlapping bandpass filters for warmth
  const band1 = bandpass(raw, pitchCenter, pitchCenter * 0.8);
  const band2 = bandpass(raw, pitchCenter * 1.8, pitchCenter * 0.6);
  const band3 = bandpass(raw, pitchCenter * 2.5, pitchCenter * 0.4);
  const speech = mix([band1, band2, band3], [0.5, 0.3, 0.15]);

  // Apply lowpass to soften harshness
  const softened = lowpass(speech, 3500);

  // Natural speech rhythm envelope with pauses
  const envelope = new Float64Array(NUM_SAMPLES);
  const syllableDur = Math.floor(SAMPLE_RATE / rhythmSpeed); // samples per syllable

  let speaking = true;
  let segmentEnd = 0;

  for (let i = 0; i < NUM_SAMPLES; i++) {
    if (i >= segmentEnd) {
      speaking = Math.random() > pauseChance;
      const segLen = speaking
        ? (0.3 + Math.random() * 1.5) * SAMPLE_RATE  // speaking: 0.3-1.8s
        : (0.2 + Math.random() * 0.8) * SAMPLE_RATE;  // pause: 0.2-1.0s
      segmentEnd = i + segLen;
    }

    if (speaking) {
      const t = i / SAMPLE_RATE;
      // Syllable-level modulation
      const syllable = 0.5 + 0.5 * Math.sin(2 * Math.PI * rhythmSpeed * t);
      // Gentle amplitude variation
      const variation = 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.8 * t);
      envelope[i] = syllable * variation;
    } else {
      envelope[i] = 0.02; // near silence during pauses
    }
  }

  // Smooth the envelope to avoid clicks
  const smoothed = lowpass(envelope, 20);

  return multiply(softened, smoothed);
}

// Multiple people murmuring (crowd/chatter effect)
function generateCrowdMurmur(numVoices, baseFreq, spread) {
  const layers = [];
  const gains = [];
  for (let v = 0; v < numVoices; v++) {
    const pitch = baseFreq + (Math.random() - 0.5) * spread;
    const speed = 2.5 + Math.random() * 2;
    const murmur = generateMurmur(pitch, speed, { pauseChance: 0.4 });
    layers.push(murmur);
    gains.push(1.0 / numVoices);
  }
  return mix(layers, gains);
}

// --- Environment generators ---

function generateCafe() {
  console.log('Generating: cafe.wav');

  // 1. Crowd murmur (many people talking at once - the main cafe sound)
  const crowd = generateCrowdMurmur(6, 600, 400);

  // 2. Background music (soft, distant melody)
  const musicNotes = [220, 261.6, 329.6, 392, 440];
  const musicLayers = [];
  const musicGains = [];
  for (let n = 0; n < musicNotes.length; n++) {
    const noteSignal = new Float64Array(NUM_SAMPLES);
    for (let i = 0; i < NUM_SAMPLES; i++) {
      const t = i / SAMPLE_RATE;
      const noteEnv = Math.sin(Math.PI * ((t * 0.15 + n * 0.2) % 1));
      noteSignal[i] = Math.sin(2 * Math.PI * musicNotes[n] * t) * noteEnv;
    }
    musicLayers.push(noteSignal);
    musicGains.push(0.03);
  }
  const music = lowpass(mix(musicLayers, musicGains), 2000);

  // 3. Cup/dish clinking
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

  // 4. Foreground voice (closer, clearer murmur - like companion talking)
  const foregroundVoice = generateMurmur(500, 3.5, { pauseChance: 0.25 });

  // 5. Espresso machine / steam hiss (occasional)
  const steam = new Float64Array(NUM_SAMPLES);
  const steamTimes = [1.5, 5.0, 8.2];
  for (const st of steamTimes) {
    const start = Math.floor(st * SAMPLE_RATE);
    const dur = Math.floor(1.5 * SAMPLE_RATE);
    for (let i = 0; i < dur && start + i < NUM_SAMPLES; i++) {
      const env = Math.sin(Math.PI * i / dur) * 0.5;
      steam[start + i] = noise() * env;
    }
  }
  const steamFiltered = highpass(steam, 3000);

  return mix(
    [crowd, music, clinkFiltered, foregroundVoice, steamFiltered],
    [0.30, 0.10, 0.10, 0.30, 0.08]
  );
}

function generateStreet() {
  console.log('Generating: street.wav');

  // 1. Traffic rumble
  const rumbleNoise = lowpass(generateNoise(), 200);
  const rumbleEnv = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    rumbleEnv[i] = 0.4 + 0.6 * (
      Math.max(0, Math.sin(t * 0.5)) * 0.5 +
      Math.max(0, Math.sin(t * 0.3 + 1)) * 0.3 +
      Math.max(0, Math.sin(t * 0.7 + 2.5)) * 0.2
    );
  }
  const traffic = multiply(rumbleNoise, rumbleEnv);

  // 2. Tire/road noise
  const roadNoise = bandpass(generateNoise(), 500, 400);
  const roadEnv = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    roadEnv[i] = 0.3 + 0.4 * Math.abs(Math.sin(t * 0.4));
  }
  const road = multiply(roadNoise, roadEnv);

  // 3. Honking
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

  // 5. Companion voice (speech-shaped murmur, not creepy formant)
  const voice = generateMurmur(450, 3.0, { pauseChance: 0.35 });

  return mix(
    [traffic, road, honks, windFinal, voice],
    [0.30, 0.12, 0.18, 0.10, 0.22]
  );
}

function generateConversation() {
  console.log('Generating: conversation.wav');

  // 1. Room tone (quiet AC/ventilation)
  const hum = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    hum[i] = Math.sin(2 * Math.PI * 100 * t) * 0.15
      + Math.sin(2 * Math.PI * 200 * t) * 0.08
      + noise() * 0.03;
  }
  const roomTone = lowpass(hum, 300);

  // 2. Voice 1 - deeper murmur with turn-taking
  const voice1Raw = generateMurmur(400, 3.0, { pauseChance: 0.2 });
  const voice1Env = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    const turn = Math.sin(2 * Math.PI * 0.25 * t);
    voice1Env[i] = Math.max(0.05, Math.max(0, turn));
  }
  const voice1 = multiply(voice1Raw, voice1Env);

  // 3. Voice 2 - higher murmur, speaks when voice1 pauses
  const voice2Raw = generateMurmur(650, 3.8, { pauseChance: 0.2 });
  const voice2Env = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    const turn = Math.sin(2 * Math.PI * 0.25 * t);
    voice2Env[i] = Math.max(0.05, Math.max(0, -turn));
  }
  const voice2 = multiply(voice2Raw, voice2Env);

  // 4. Occasional paper/object sounds
  const objects = new Float64Array(NUM_SAMPLES);
  const objTimes = [2.0, 4.5, 7.0, 9.0];
  for (const ot of objTimes) {
    const start = Math.floor(ot * SAMPLE_RATE);
    const dur = Math.floor(0.08 * SAMPLE_RATE);
    for (let i = 0; i < dur && start + i < NUM_SAMPLES; i++) {
      const env = Math.exp(-i / (dur * 0.2));
      objects[start + i] = noise() * env * 0.3;
    }
  }
  const objectsFiltered = bandpass(objects, 2000, 2000);

  return mix(
    [roomTone, voice1, voice2, objectsFiltered],
    [0.10, 0.40, 0.38, 0.06]
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

  // 2. Bird songs
  const birds = new Float64Array(NUM_SAMPLES);
  const bird1Times = [0.5, 0.7, 0.9, 2.5, 2.7, 2.9, 5.0, 5.2, 5.4, 7.5, 7.7, 7.9];
  for (const bt of bird1Times) {
    const start = Math.floor(bt * SAMPLE_RATE);
    const dur = Math.floor(0.12 * SAMPLE_RATE);
    for (let i = 0; i < dur && start + i < NUM_SAMPLES; i++) {
      const t = i / SAMPLE_RATE;
      const env = Math.sin(Math.PI * i / dur);
      const freqSweep = 3000 + 1500 * (i / dur);
      birds[start + i] += Math.sin(2 * Math.PI * freqSweep * t) * env * 0.5;
    }
  }
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

  // 3. Water stream
  const waterNoise = bandpass(generateNoise(), 2000, 3000);
  const waterEnv = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    waterEnv[i] = 0.4 + 0.3 * Math.sin(t * 1.5) + 0.2 * Math.sin(t * 2.7 + 1);
  }
  const water = multiply(waterNoise, waterEnv);

  // 4. Companion voice (gentle murmur, intermittent)
  const voiceRaw = generateMurmur(500, 2.8, { pauseChance: 0.3 });
  const voiceEnv = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    const phase = (t % 5) / 5;
    voiceEnv[i] = phase < 0.4 ? Math.sin(Math.PI * phase / 0.4) : 0;
  }
  const voiceFinal = multiply(voiceRaw, voiceEnv);

  return mix(
    [wind, birds, water, voiceFinal],
    [0.22, 0.18, 0.15, 0.30]
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
