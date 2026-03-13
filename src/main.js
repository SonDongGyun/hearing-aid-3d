import * as THREE from 'three';
import { gsap } from 'gsap';

// ===== GLOBALS =====
let scene, camera, renderer;
let hearingAidGroup, particleSystem, soundWaveRings = [];
let handActive = false;
let scrollY = 0, targetScrollY = 0;
const clock = new THREE.Clock();
const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  || (window.innerWidth <= 768);
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// ===== INIT =====
function init() {
  // Scene
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050508, 0.0008);

  // Camera
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, 30);

  // Renderer
  renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('three-canvas'),
    antialias: true,
    alpha: true
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  // Lights
  const ambientLight = new THREE.AmbientLight(0x334466, 0.5);
  scene.add(ambientLight);

  const mainLight = new THREE.DirectionalLight(0x00c8ff, 1);
  mainLight.position.set(5, 10, 5);
  scene.add(mainLight);

  const accentLight = new THREE.PointLight(0x7b61ff, 1, 50);
  accentLight.position.set(-5, -3, 10);
  scene.add(accentLight);

  const rimLight = new THREE.PointLight(0x00c8ff, 0.8, 40);
  rimLight.position.set(10, 5, -5);
  scene.add(rimLight);

  createHearingAid();
  createParticles();
  createSoundWaves();
  createFloatingOrbs();

  setupEvents();
  setupScrollAnimations();
  setupIntersectionObserver();
  animateStats();

  // Experience demos
  setupExperienceTabs();
  setupNoiseCancellation();
  setupHearingTest();
  setupEnvironmentSim();

  // Hide loader
  setTimeout(() => {
    document.getElementById('loader').classList.add('hidden');
  }, 1500);

  animate();
}

// ===== 3D HEARING AID MODEL =====
function createHearingAid() {
  hearingAidGroup = new THREE.Group();
  hearingAidGroup.position.set(isMobile ? 5 : 12, isMobile ? 2 : 0, 0);

  // Main body - organic shape using lathe geometry
  const bodyPoints = [];
  for (let i = 0; i < 20; i++) {
    const t = i / 19;
    const r = 1.8 * Math.sin(t * Math.PI) * (1 + 0.3 * Math.sin(t * Math.PI * 3));
    bodyPoints.push(new THREE.Vector2(r, t * 4 - 2));
  }
  const bodyGeo = new THREE.LatheGeometry(bodyPoints, 32);
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0xd0d5e0,
    metalness: 0.6,
    roughness: 0.15,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.5
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.scale.set(0.8, 1, 0.8);
  hearingAidGroup.add(body);

  // Speaker tip
  const tipGeo = new THREE.CylinderGeometry(0.3, 0.5, 1.5, 16);
  const tipMat = new THREE.MeshPhysicalMaterial({
    color: 0x00c8ff,
    metalness: 0.8,
    roughness: 0.1,
    emissive: 0x003344,
    emissiveIntensity: 0.5
  });
  const tip = new THREE.Mesh(tipGeo, tipMat);
  tip.position.set(0, -2.5, 0);
  hearingAidGroup.add(tip);

  // Glowing ring
  const ringGeo = new THREE.TorusGeometry(1.2, 0.08, 16, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x00c8ff,
    transparent: true,
    opacity: 0.8
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.5;
  ring.rotation.x = Math.PI / 2;
  hearingAidGroup.add(ring);

  // LED indicator
  const ledGeo = new THREE.SphereGeometry(0.15, 16, 16);
  const ledMat = new THREE.MeshBasicMaterial({
    color: 0x00ff88,
    transparent: true,
    opacity: 0.9
  });
  const led = new THREE.Mesh(ledGeo, ledMat);
  led.position.set(0.8, 1.2, 1);
  hearingAidGroup.add(led);

  // Wireframe overlay
  const wireGeo = new THREE.IcosahedronGeometry(3, 1);
  const wireMat = new THREE.MeshBasicMaterial({
    color: 0x00c8ff,
    wireframe: true,
    transparent: true,
    opacity: 0.05
  });
  const wireframe = new THREE.Mesh(wireGeo, wireMat);
  hearingAidGroup.add(wireframe);

  hearingAidGroup.rotation.set(0.3, 0, 0.2);
  scene.add(hearingAidGroup);
}

// ===== PARTICLE SYSTEM =====
function createParticles() {
  const count = isMobile ? 1000 : 3000;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  const colorA = new THREE.Color(0x00c8ff);
  const colorB = new THREE.Color(0x7b61ff);

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const radius = 20 + Math.random() * 40;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i3 + 2] = radius * Math.cos(phi);

    const mixFactor = Math.random();
    const color = colorA.clone().lerp(colorB, mixFactor);
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;

    sizes[i] = Math.random() * 3 + 0.5;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.PointsMaterial({
    size: 0.15,
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  });

  particleSystem = new THREE.Points(geo, mat);
  scene.add(particleSystem);
}

// ===== SOUND WAVE RINGS =====
function createSoundWaves() {
  for (let i = 0; i < 5; i++) {
    const ringGeo = new THREE.TorusGeometry(3 + i * 1.5, 0.02, 8, 128);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00c8ff,
      transparent: true,
      opacity: 0.3 - i * 0.05,
      blending: THREE.AdditiveBlending
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(isMobile ? 5 : 12, isMobile ? 2 : 0, 0);
    ring.rotation.y = Math.PI / 2;
    ring.userData = { baseScale: 1, phase: i * 0.5 };
    scene.add(ring);
    soundWaveRings.push(ring);
  }
}

// ===== FLOATING ORBS =====
function createFloatingOrbs() {
  const orbCount = isMobile ? 4 : 8;
  for (let i = 0; i < orbCount; i++) {
    const size = 0.2 + Math.random() * 0.5;
    const geo = new THREE.SphereGeometry(size, 16, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: Math.random() > 0.5 ? 0x00c8ff : 0x7b61ff,
      transparent: true,
      opacity: 0.3 + Math.random() * 0.3,
      blending: THREE.AdditiveBlending
    });
    const orb = new THREE.Mesh(geo, mat);
    orb.position.set(
      (Math.random() - 0.5) * 40,
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 20 - 10
    );
    orb.userData = {
      speed: 0.3 + Math.random() * 0.5,
      offset: Math.random() * Math.PI * 2,
      amplitude: 2 + Math.random() * 3
    };
    scene.add(orb);
  }
}

// ===== ANIMATION LOOP =====
function animate() {
  requestAnimationFrame(animate);
  const time = clock.getElapsedTime();
  const delta = clock.getDelta();

  // Smooth scroll
  scrollY += (targetScrollY - scrollY) * 0.1;
  const scrollProgress = scrollY / (document.body.scrollHeight - window.innerHeight);

  // Camera movement based on scroll
  camera.position.y = -scrollProgress * 30;
  camera.position.z = 30 - scrollProgress * 10;

  // Hearing aid rotation
  if (hearingAidGroup) {
    hearingAidGroup.rotation.y = time * 0.3 + (handActive ? (handX - 0.5) * 3 : 0);
    hearingAidGroup.rotation.x = 0.3 + Math.sin(time * 0.5) * 0.1 + (handActive ? (handY - 0.5) * 2 : 0);

    // Pulse effect
    const pulse = 1 + Math.sin(time * 2) * 0.02;
    hearingAidGroup.scale.setScalar(pulse);

    // LED blink
    const led = hearingAidGroup.children[3];
    if (led) {
      led.material.opacity = 0.5 + Math.sin(time * 3) * 0.5;
    }
  }

  // Particle animation
  if (particleSystem) {
    particleSystem.rotation.y = time * 0.03;
    particleSystem.rotation.x = time * 0.01;

    // Skip per-vertex animation on mobile for performance
    if (!isMobile) {
      const positions = particleSystem.geometry.attributes.position.array;
      for (let i = 0; i < positions.length; i += 3) {
        positions[i + 1] += Math.sin(time + positions[i] * 0.1) * 0.005;
      }
      particleSystem.geometry.attributes.position.needsUpdate = true;
    }
  }

  // Sound wave animation
  soundWaveRings.forEach((ring, i) => {
    const scale = 1 + Math.sin(time * 2 + ring.userData.phase) * 0.3;
    ring.scale.setScalar(scale);
    ring.material.opacity = (0.3 - i * 0.05) * (1 + Math.sin(time * 2 + ring.userData.phase) * 0.5);
    ring.rotation.x = Math.sin(time * 0.5 + i) * 0.3;
  });

  // Floating orbs
  scene.children.forEach(child => {
    if (child.userData && child.userData.speed) {
      child.position.y += Math.sin(time * child.userData.speed + child.userData.offset) * 0.01;
      child.position.x += Math.cos(time * child.userData.speed * 0.7 + child.userData.offset) * 0.008;
    }
  });

  renderer.render(scene, camera);
}

// ===== EVENTS =====
function setupEvents() {
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  window.addEventListener('scroll', () => {
    targetScrollY = window.scrollY;

    // Nav scroll effect
    const nav = document.getElementById('nav');
    if (window.scrollY > 50) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
  });

  // Mouse / touch parallax for hearing aid
  if (isTouchDevice) {
    // Touch-based interaction for 3D model
    let touchStartX = 0, touchStartY = 0;
    window.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (!handActive && hearingAidGroup) {
        const touchX = (e.touches[0].clientX / window.innerWidth - 0.5) * 2;
        const touchY = (e.touches[0].clientY / window.innerHeight - 0.5) * 2;
        gsap.to(hearingAidGroup.rotation, {
          y: touchX * 0.8 + clock.getElapsedTime() * 0.3,
          x: 0.3 + touchY * 0.3,
          duration: 0.5
        });
      }
    }, { passive: true });

    // Device orientation for extra parallax on mobile
    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', (e) => {
        if (!handActive && hearingAidGroup && e.gamma !== null) {
          const tiltX = (e.gamma / 90) * 0.5; // left-right tilt
          const tiltY = ((e.beta - 45) / 90) * 0.3; // front-back tilt (offset for holding angle)
          gsap.to(hearingAidGroup.rotation, {
            y: tiltX + clock.getElapsedTime() * 0.3,
            x: 0.3 + tiltY,
            duration: 0.8
          });
        }
      }, { passive: true });
    }
  } else {
    window.addEventListener('mousemove', (e) => {
      if (!handActive) {
        const mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
        const mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
        if (hearingAidGroup) {
          gsap.to(hearingAidGroup.rotation, {
            y: mouseX * 0.5 + clock.getElapsedTime() * 0.3,
            x: 0.3 + mouseY * 0.2,
            duration: 1
          });
        }
      }
    });
  }

  // Mobile menu
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const mobileNav = document.getElementById('mobile-nav');
  const mobileNavClose = document.getElementById('mobile-nav-close');

  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => mobileNav.classList.add('open'));
  }
  if (mobileNavClose) {
    mobileNavClose.addEventListener('click', () => mobileNav.classList.remove('open'));
  }

  // Expose closeMobileNav globally for inline onclick
  window.closeMobileNav = () => {
    if (mobileNav) mobileNav.classList.remove('open');
  };

  // (experience demos are initialized separately)
}

// ===== SCROLL ANIMATIONS =====
function setupScrollAnimations() {
  // Product section scroll progress
  window.addEventListener('scroll', () => {
    const productSection = document.getElementById('product');
    if (!productSection) return;

    const rect = productSection.getBoundingClientRect();
    const progress = 1 - (rect.top / window.innerHeight);

    if (progress > 0 && progress < 2) {
      const step = Math.min(2, Math.floor(progress * 1.5));
      document.querySelectorAll('.product-detail').forEach((el, i) => {
        el.classList.toggle('active', i === step);
      });
    }
  });
}

// ===== INTERSECTION OBSERVER =====
function setupIntersectionObserver() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.2 });

  document.querySelectorAll('.feature-card, .testimonial-card').forEach(el => {
    observer.observe(el);
  });
}

// ===== STATS COUNTER =====
function animateStats() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const nums = entry.target.querySelectorAll('.stat-num');
        nums.forEach(num => {
          const target = parseInt(num.dataset.target);
          let current = 0;
          const increment = target / 60;
          const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
              current = target;
              clearInterval(timer);
            }
            num.textContent = Math.floor(current).toLocaleString();
          }, 30);
        });
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  const statsContainer = document.querySelector('.hero-stats');
  if (statsContainer) observer.observe(statsContainer);
}

// ===== EXPERIENCE TABS =====
function setupExperienceTabs() {
  const tabs = document.querySelectorAll('.exp-tab');
  const panels = document.querySelectorAll('.exp-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');

      // Resize canvases after they become visible
      requestAnimationFrame(() => {
        if (tab.dataset.tab === 'hearing') {
          resizeHearingCanvas();
        } else if (tab.dataset.tab === 'environment') {
          resizeEnvCanvas();
        }
      });
    });
  });
}

// ======================================================
// 1. NOISE CANCELLATION DEMO
// ======================================================
let noiseAudioCtx, noiseAnalyser, noiseDataArray, noiseMicStream;
let noiseFilterEnabled = false;
let noiseAnimFrame;
let noiseDemoMode = 'none'; // 'none', 'mic', 'simulated'
let noiseSimNodes = []; // track all audio nodes for cleanup
let noiseNoiseGainNode = null; // gain for noise sources (to modulate on filter toggle)
let noiseVoiceGainNode = null; // gain for voice sources
let noiseBandpassFilter = null; // for mic mode

function setupNoiseCancellation() {
  const startBtn = document.getElementById('start-mic');
  const startSimBtn = document.getElementById('start-sim');
  const toggle = document.getElementById('noise-toggle');
  const stopBtn = document.getElementById('stop-noise');

  startBtn.addEventListener('click', startNoiseMic);
  startSimBtn.addEventListener('click', startSimulatedNoise);
  stopBtn.addEventListener('click', stopNoiseCancellation);

  toggle.addEventListener('click', () => {
    noiseFilterEnabled = !noiseFilterEnabled;
    toggle.classList.toggle('active', noiseFilterEnabled);
    toggle.querySelector('.toggle-text').textContent = noiseFilterEnabled ? 'ON' : 'OFF';
    applyNoiseFilter();
  });
}

function applyNoiseFilter() {
  if (!noiseAudioCtx) return;
  const t = noiseAudioCtx.currentTime;

  if (noiseDemoMode === 'simulated') {
    // Simulated: directly change gain of noise vs voice
    if (noiseNoiseGainNode) {
      noiseNoiseGainNode.gain.linearRampToValueAtTime(
        noiseFilterEnabled ? 0.003 : 0.06, t + 0.3
      );
    }
    if (noiseVoiceGainNode) {
      noiseVoiceGainNode.gain.linearRampToValueAtTime(
        noiseFilterEnabled ? 0.12 : 0.04, t + 0.3
      );
    }
  } else if (noiseDemoMode === 'mic' && noiseBandpassFilter) {
    // Mic mode: toggle bandpass filter
    if (noiseFilterEnabled) {
      noiseBandpassFilter.frequency.linearRampToValueAtTime(1500, t + 0.2);
      noiseBandpassFilter.Q.linearRampToValueAtTime(0.5, t + 0.2);
    } else {
      // Wide open = essentially no filter
      noiseBandpassFilter.frequency.linearRampToValueAtTime(5000, t + 0.2);
      noiseBandpassFilter.Q.linearRampToValueAtTime(0.01, t + 0.2);
    }
  }
}

function stopNoiseCancellation() {
  // Stop animation
  if (noiseAnimFrame) {
    cancelAnimationFrame(noiseAnimFrame);
    noiseAnimFrame = null;
  }

  // Stop mic stream
  if (noiseMicStream) {
    noiseMicStream.getTracks().forEach(t => t.stop());
    noiseMicStream = null;
  }

  // Stop all sim audio nodes
  noiseSimNodes.forEach(node => {
    try { node.stop(); } catch (e) {}
    try { node.disconnect(); } catch (e) {}
  });
  noiseSimNodes = [];
  noiseNoiseGainNode = null;
  noiseVoiceGainNode = null;
  noiseBandpassFilter = null;

  // Close audio context
  if (noiseAudioCtx) {
    try { noiseAudioCtx.close(); } catch (e) {}
    noiseAudioCtx = null;
  }

  noiseDemoMode = 'none';

  // Reset UI
  const overlay = document.getElementById('noise-overlay');
  overlay.classList.remove('hidden');
  document.getElementById('noise-stop-wrap').style.display = 'none';

  // Reset toggle
  noiseFilterEnabled = false;
  const toggle = document.getElementById('noise-toggle');
  toggle.classList.remove('active');
  toggle.querySelector('.toggle-text').textContent = 'OFF';

  // Clear canvas
  const canvas = document.getElementById('noise-canvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

async function startNoiseMic() {
  const overlay = document.getElementById('noise-overlay');
  try {
    noiseMicStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    overlay.classList.add('hidden');
    document.getElementById('noise-stop-wrap').style.display = 'block';
    noiseDemoMode = 'mic';

    noiseAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = noiseAudioCtx.createMediaStreamSource(noiseMicStream);

    // Bandpass filter for AI noise cancellation effect
    noiseBandpassFilter = noiseAudioCtx.createBiquadFilter();
    noiseBandpassFilter.type = 'bandpass';
    noiseBandpassFilter.frequency.value = 5000; // wide = no filter initially
    noiseBandpassFilter.Q.value = 0.01;

    noiseAnalyser = noiseAudioCtx.createAnalyser();
    noiseAnalyser.fftSize = 2048;
    noiseAnalyser.smoothingTimeConstant = 0.8;

    source.connect(noiseBandpassFilter);
    noiseBandpassFilter.connect(noiseAnalyser);

    noiseDataArray = new Uint8Array(noiseAnalyser.frequencyBinCount);

    const canvas = document.getElementById('noise-canvas');
    canvas.width = canvas.clientWidth * (isMobile ? 1 : 2);
    canvas.height = canvas.clientHeight * (isMobile ? 1 : 2);

    drawNoiseVisualization(canvas);
  } catch (err) {
    startSimulatedNoise();
  }
}

function startSimulatedNoise() {
  const overlay = document.getElementById('noise-overlay');
  overlay.classList.add('hidden');
  document.getElementById('noise-stop-wrap').style.display = 'block';
  noiseDemoMode = 'simulated';

  noiseAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const ctx = noiseAudioCtx;

  // === NOISE SOURCES ===
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.06;
  noiseNoiseGainNode = noiseGain;

  // White noise (general ambient)
  const bufferSize = ctx.sampleRate * 2;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const bufData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) bufData[i] = Math.random() * 2 - 1;

  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = noiseBuffer;
  noiseSrc.loop = true;
  noiseSrc.connect(noiseGain);
  noiseSrc.start();
  noiseSimNodes.push(noiseSrc);

  // Low rumble
  const rumbleOsc = ctx.createOscillator();
  rumbleOsc.type = 'sine';
  rumbleOsc.frequency.value = 80;
  const rumbleG = ctx.createGain();
  rumbleG.gain.value = 0.5;
  rumbleOsc.connect(rumbleG);
  rumbleG.connect(noiseGain);
  rumbleOsc.start();
  noiseSimNodes.push(rumbleOsc);

  // Mid noise (chatter-like)
  const chatterSrc = ctx.createBufferSource();
  chatterSrc.buffer = noiseBuffer;
  chatterSrc.loop = true;
  const chatterBP = ctx.createBiquadFilter();
  chatterBP.type = 'bandpass';
  chatterBP.frequency.value = 1000;
  chatterBP.Q.value = 0.8;
  const chatterG = ctx.createGain();
  chatterG.gain.value = 0.7;
  chatterSrc.connect(chatterBP);
  chatterBP.connect(chatterG);
  chatterG.connect(noiseGain);
  chatterSrc.start();
  noiseSimNodes.push(chatterSrc);

  // === VOICE SOURCES ===
  const voiceGain = ctx.createGain();
  voiceGain.gain.value = 0.04;
  noiseVoiceGainNode = voiceGain;

  // Speech harmonics with natural modulation
  const voiceFreqs = [300, 600, 1200, 2400];
  voiceFreqs.forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = i === 0 ? 'sawtooth' : 'sine';
    osc.frequency.value = f;

    // Vibrato
    const vib = ctx.createOscillator();
    vib.frequency.value = 4.5 + Math.random() * 2;
    const vibG = ctx.createGain();
    vibG.gain.value = f * 0.015;
    vib.connect(vibG);
    vibG.connect(osc.frequency);
    vib.start();
    noiseSimNodes.push(vib);

    // Syllable amplitude modulation
    const ampMod = ctx.createOscillator();
    ampMod.frequency.value = 2.5 + Math.random();
    const ampModG = ctx.createGain();
    ampModG.gain.value = 0.5;
    ampMod.connect(ampModG);
    ampMod.start();
    noiseSimNodes.push(ampMod);

    const oscGain = ctx.createGain();
    oscGain.gain.value = i === 0 ? 0.6 : 0.3 / (i + 1);
    ampModG.connect(oscGain.gain);

    osc.connect(oscGain);
    oscGain.connect(voiceGain);
    osc.start();
    noiseSimNodes.push(osc);
  });

  // === MIX & OUTPUT ===
  noiseAnalyser = ctx.createAnalyser();
  noiseAnalyser.fftSize = 2048;
  noiseAnalyser.smoothingTimeConstant = 0.8;

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.6;

  noiseGain.connect(noiseAnalyser);
  voiceGain.connect(noiseAnalyser);
  noiseAnalyser.connect(masterGain);
  masterGain.connect(ctx.destination);

  noiseDataArray = new Uint8Array(noiseAnalyser.frequencyBinCount);

  const canvas = document.getElementById('noise-canvas');
  canvas.width = canvas.clientWidth * (isMobile ? 1 : 2);
  canvas.height = canvas.clientHeight * (isMobile ? 1 : 2);

  // Apply current filter state
  applyNoiseFilter();
  drawNoiseVisualization(canvas);
}

function drawNoiseVisualization(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  function draw() {
    noiseAnimFrame = requestAnimationFrame(draw);
    noiseAnalyser.getByteFrequencyData(noiseDataArray);

    ctx.fillStyle = 'rgba(5,5,8,0.3)';
    ctx.fillRect(0, 0, w, h);

    const binCount = noiseDataArray.length;
    const barWidth = w / binCount * 2.5;
    const time = performance.now() * 0.001;

    // Calculate RMS for dB display
    let sumInput = 0;
    for (let i = 0; i < binCount; i++) {
      sumInput += noiseDataArray[i] * noiseDataArray[i];
    }
    const rmsInput = Math.sqrt(sumInput / binCount);
    const dbInput = Math.max(0, Math.min(100, rmsInput * 0.6));

    // Voice band: 300Hz~3400Hz
    const nyquist = noiseAudioCtx.sampleRate / 2;
    const voiceLow = Math.floor(300 / nyquist * binCount);
    const voiceHigh = Math.floor(3400 / nyquist * binCount);

    // Draw frequency bars — raw input
    for (let i = 0; i < binCount && i * barWidth < w; i++) {
      const val = noiseDataArray[i] / 255;
      const barH = val * h * 0.8;
      const x = i * barWidth;
      const isVoice = i >= voiceLow && i <= voiceHigh;

      // Raw waveform (top half)
      ctx.fillStyle = isVoice
        ? `rgba(0, 200, 255, ${0.4 + val * 0.6})`
        : `rgba(255, 68, 68, ${0.3 + val * 0.5})`;
      ctx.fillRect(x, h / 2 - barH / 2, Math.max(barWidth - 1, 1), barH / 2);
    }

    // Draw filtered output (bottom half)
    if (noiseFilterEnabled) {
      for (let i = 0; i < binCount && i * barWidth < w; i++) {
        const isVoice = i >= voiceLow && i <= voiceHigh;
        let val = noiseDataArray[i] / 255;

        // Simulate noise cancellation: suppress non-voice, boost voice
        if (!isVoice) {
          val *= 0.05; // Heavy suppression of non-voice
        } else {
          val = Math.min(1, val * 1.3); // Slight boost to voice
        }

        const barH = val * h * 0.8;
        const x = i * barWidth;
        ctx.fillStyle = `rgba(123, 97, 255, ${0.4 + val * 0.6})`;
        ctx.fillRect(x, h / 2, Math.max(barWidth - 1, 1), barH / 2);
      }
    } else {
      // Without filter: same as input on bottom
      for (let i = 0; i < binCount && i * barWidth < w; i++) {
        const val = noiseDataArray[i] / 255;
        const barH = val * h * 0.8;
        const x = i * barWidth;
        ctx.fillStyle = `rgba(136, 136, 160, ${0.2 + val * 0.3})`;
        ctx.fillRect(x, h / 2, Math.max(barWidth - 1, 1), barH / 2);
      }
    }

    // Center line
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // Labels
    ctx.font = `${isMobile ? 10 : 12}px "Noto Sans KR", sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.textAlign = 'left';
    ctx.fillText(noiseDemoMode === 'mic' ? '마이크 입력' : '시뮬레이션 음원', 10, 20);
    ctx.fillText(noiseFilterEnabled ? 'AI 소음제거 적용' : '처리 없음', 10, h - 10);

    // Frequency labels
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    const freqLabels = [250, 500, 1000, 2000, 4000, 8000];
    freqLabels.forEach(f => {
      const idx = Math.floor(f / nyquist * binCount);
      const x = idx * barWidth;
      if (x < w) ctx.fillText(`${f >= 1000 ? f / 1000 + 'k' : f}`, x, h / 2 + 14);
    });

    // Voice band indicator
    const vx1 = voiceLow * barWidth;
    const vx2 = voiceHigh * barWidth;
    ctx.strokeStyle = 'rgba(0,200,255,0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(vx1, 4, vx2 - vx1, h - 8);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(0,200,255,0.3)';
    ctx.fillText('음성 대역', (vx1 + vx2) / 2, h / 2 - 6);

    // Update meters
    const inputMeter = document.getElementById('input-meter');
    const outputMeter = document.getElementById('output-meter');
    const inputDbEl = document.getElementById('input-db');
    const outputDbEl = document.getElementById('output-db');

    inputMeter.style.width = `${dbInput}%`;
    inputDbEl.textContent = `${Math.floor(dbInput * 0.8)} dB`;

    if (noiseFilterEnabled) {
      // Calculate voice-band only RMS
      let sumVoice = 0, countVoice = 0;
      for (let i = voiceLow; i <= voiceHigh; i++) {
        sumVoice += noiseDataArray[i] * noiseDataArray[i];
        countVoice++;
      }
      const rmsVoice = Math.sqrt(sumVoice / Math.max(1, countVoice));
      const dbVoice = Math.max(0, Math.min(100, rmsVoice * 0.6));
      outputMeter.style.width = `${dbVoice}%`;
      outputDbEl.textContent = `${Math.floor(dbVoice * 0.8)} dB`;
    } else {
      outputMeter.style.width = `${dbInput}%`;
      outputDbEl.textContent = `${Math.floor(dbInput * 0.8)} dB`;
    }
  }

  draw();
}

// ======================================================
// 2. HEARING TEST
// ======================================================
let hearingAudioCtx;
let activeOscillator = null;
let hearingCanvasCtx;
let hearingAnimFrame;
const hearingProfile = {};

function resizeHearingCanvas() {
  const canvas = document.getElementById('hearing-canvas');
  if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
    canvas.width = canvas.clientWidth * (isMobile ? 1 : 2);
    canvas.height = canvas.clientHeight * (isMobile ? 1 : 2);
    hearingCanvasCtx = canvas.getContext('2d');
    updateHearingChart();
  }
}

function setupHearingTest() {
  const canvas = document.getElementById('hearing-canvas');
  hearingCanvasCtx = canvas.getContext('2d');
  // Defer initial sizing — panel may be hidden
  resizeHearingCanvas();

  // Play buttons
  document.querySelectorAll('.freq-play').forEach(btn => {
    btn.addEventListener('click', () => {
      const freq = parseInt(btn.dataset.freq);
      const slider = document.querySelector(`.freq-slider[data-freq="${freq}"]`);
      const volume = parseInt(slider.value) / 100;

      if (btn.classList.contains('playing')) {
        stopTone();
        btn.classList.remove('playing');
        btn.textContent = '▶';
        return;
      }

      // Stop any playing tone
      document.querySelectorAll('.freq-play').forEach(b => {
        b.classList.remove('playing');
        b.textContent = '▶';
      });

      playTone(freq, volume);
      btn.classList.add('playing');
      btn.textContent = '■';

      // Record in profile: slider value = minimum audible volume
      // Higher slider = need louder sound = worse hearing at this freq
      // We store "hearing ability": 1 = perfect (hears at 0%), 0 = deaf (needs 100%)
      hearingProfile[freq] = 1 - volume;
      updateHearingChart();
      updateHearingResult();
    });
  });

  // Slider change updates volume of active tone
  document.querySelectorAll('.freq-slider').forEach(slider => {
    slider.addEventListener('input', () => {
      const freq = parseInt(slider.dataset.freq);
      const volume = parseInt(slider.value) / 100;
      // Store hearing ability (inverted: low slider = good hearing)
      hearingProfile[freq] = 1 - volume;

      if (activeOscillator && activeOscillator._freq === freq) {
        activeOscillator._gain.gain.setValueAtTime(volume * 0.3, hearingAudioCtx.currentTime);
      }
      updateHearingChart();
    });
  });

  drawHearingChart();
}

function playTone(freq, volume) {
  stopTone();

  if (!hearingAudioCtx) {
    hearingAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  const osc = hearingAudioCtx.createOscillator();
  const gain = hearingAudioCtx.createGain();

  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, hearingAudioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(volume * 0.3, hearingAudioCtx.currentTime + 0.1);

  osc.connect(gain);
  gain.connect(hearingAudioCtx.destination);
  osc.start();

  osc._freq = freq;
  osc._gain = gain;
  activeOscillator = osc;

  // Auto-stop after 3 seconds
  setTimeout(() => {
    if (activeOscillator === osc) {
      stopTone();
      document.querySelectorAll('.freq-play').forEach(b => {
        b.classList.remove('playing');
        b.textContent = '▶';
      });
    }
  }, 3000);
}

function stopTone() {
  if (activeOscillator) {
    try {
      activeOscillator._gain.gain.linearRampToValueAtTime(0, hearingAudioCtx.currentTime + 0.05);
      activeOscillator.stop(hearingAudioCtx.currentTime + 0.1);
    } catch (e) {}
    activeOscillator = null;
  }
}

function drawHearingChart() {
  updateHearingChart();
}

function updateHearingChart() {
  const ctx = hearingCanvasCtx;
  const canvas = ctx.canvas;
  const w = canvas.width;
  const h = canvas.height;
  const pad = { top: 40, right: 30, bottom: 50, left: 60 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  ctx.fillStyle = 'rgba(5,5,8,1)';
  ctx.fillRect(0, 0, w, h);

  const freqs = [250, 500, 1000, 2000, 4000, 8000];

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const y = pad.top + (chartH / 10) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + chartW, y);
    ctx.stroke();
  }

  freqs.forEach((f, i) => {
    const x = pad.left + (chartW / (freqs.length - 1)) * i;
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, pad.top + chartH);
    ctx.stroke();
  });

  // Axis labels
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = `${isMobile ? 10 : 12}px "Noto Sans KR", sans-serif`;
  ctx.textAlign = 'center';

  freqs.forEach((f, i) => {
    const x = pad.left + (chartW / (freqs.length - 1)) * i;
    ctx.fillText(f >= 1000 ? `${f / 1000}kHz` : `${f}Hz`, x, h - 15);
  });

  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (chartH / 4) * i;
    const label = ['좋음', '', '보통', '', '약함'][i];
    ctx.fillText(label, pad.left - 10, y + 4);
  }

  // Title
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `bold ${isMobile ? 12 : 14}px "Noto Sans KR", sans-serif`;
  ctx.fillText('주파수별 청력 프로필', w / 2, 24);

  // Normal hearing range (shaded area)
  ctx.fillStyle = 'rgba(0,200,255,0.05)';
  ctx.fillRect(pad.left, pad.top, chartW, chartH * 0.4);
  ctx.fillStyle = 'rgba(0,200,255,0.15)';
  ctx.font = `${isMobile ? 9 : 11}px "Noto Sans KR", sans-serif`;
  ctx.fillText('정상 청력 범위', w / 2, pad.top + 16);

  // User profile line
  const profileFreqs = freqs.filter(f => hearingProfile[f] !== undefined);
  if (profileFreqs.length > 0) {
    // Filled area
    ctx.beginPath();
    profileFreqs.forEach((f, i) => {
      const fi = freqs.indexOf(f);
      const x = pad.left + (chartW / (freqs.length - 1)) * fi;
      const y = pad.top + chartH * (1 - hearingProfile[f]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    const lastFi = freqs.indexOf(profileFreqs[profileFreqs.length - 1]);
    const firstFi = freqs.indexOf(profileFreqs[0]);
    ctx.lineTo(pad.left + (chartW / (freqs.length - 1)) * lastFi, pad.top + chartH);
    ctx.lineTo(pad.left + (chartW / (freqs.length - 1)) * firstFi, pad.top + chartH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,200,255,0.08)';
    ctx.fill();

    // Line
    ctx.beginPath();
    profileFreqs.forEach((f, i) => {
      const fi = freqs.indexOf(f);
      const x = pad.left + (chartW / (freqs.length - 1)) * fi;
      const y = pad.top + chartH * (1 - hearingProfile[f]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#00c8ff';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Points
    profileFreqs.forEach(f => {
      const fi = freqs.indexOf(f);
      const x = pad.left + (chartW / (freqs.length - 1)) * fi;
      const y = pad.top + chartH * (1 - hearingProfile[f]);

      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#00c8ff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,200,255,0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Simulated "with hearing aid" line
    ctx.beginPath();
    ctx.setLineDash([6, 4]);
    profileFreqs.forEach((f, i) => {
      const fi = freqs.indexOf(f);
      const x = pad.left + (chartW / (freqs.length - 1)) * fi;
      // Hearing aid boosts weak frequencies toward normal
      const raw = hearingProfile[f];
      const boosted = raw + (1 - raw) * 0.6; // Boost toward 1.0
      const y = pad.top + chartH * (1 - Math.min(1, boosted));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#7b61ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);

    // Legend
    ctx.font = `${isMobile ? 9 : 11}px "Noto Sans KR", sans-serif`;
    ctx.textAlign = 'left';

    ctx.fillStyle = '#00c8ff';
    ctx.fillRect(pad.left + 10, pad.top + chartH - 36, 12, 3);
    ctx.fillText('현재 청력', pad.left + 28, pad.top + chartH - 32);

    ctx.fillStyle = '#7b61ff';
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = '#7b61ff';
    ctx.beginPath();
    ctx.moveTo(pad.left + 10, pad.top + chartH - 20);
    ctx.lineTo(pad.left + 22, pad.top + chartH - 20);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText('보청기 착용 시', pad.left + 28, pad.top + chartH - 16);
  }
}

function updateHearingResult() {
  const resultEl = document.getElementById('hearing-result');
  const freqs = [250, 500, 1000, 2000, 4000, 8000];
  const tested = freqs.filter(f => hearingProfile[f] !== undefined);

  if (tested.length < 3) {
    resultEl.innerHTML = `<p>최소 3개 주파수를 테스트해보세요. (${tested.length}/6 완료)</p>`;
    return;
  }

  // hearingProfile[freq] = hearing ability (0~1, higher = better hearing)
  // A low value means the user needed a high volume to hear → weak hearing
  const weakFreqs = tested.filter(f => hearingProfile[f] < 0.4);
  const avgAbility = tested.reduce((s, f) => s + hearingProfile[f], 0) / tested.length;

  let msg = '';
  if (avgAbility > 0.7) {
    msg = `<strong style="color:#00c8ff;">양호한 청력</strong><br>대부분의 주파수를 작은 소리에서도 잘 들을 수 있습니다.`;
  } else if (avgAbility > 0.4) {
    msg = `<strong style="color:#ffcc00;">경도 난청 가능성</strong><br>일부 주파수에서 볼륨을 높여야 들리는 경향이 있습니다. 전문 상담을 권장합니다.`;
  } else {
    msg = `<strong style="color:#ff6644;">청력 보강 권장</strong><br>여러 주파수에서 높은 볼륨이 필요합니다. 보청기 착용 시 큰 개선이 예상됩니다.`;
  }

  if (weakFreqs.length > 0) {
    const names = weakFreqs.map(f => f >= 1000 ? `${f / 1000}kHz` : `${f}Hz`);
    msg += `<br><br>보강이 필요한 주파수: ${names.join(', ')}`;
    msg += `<br><span style="color:#7b61ff;">→ SoundClear가 이 대역을 자동으로 증폭하여 선명하게 전달합니다.</span>`;
  }

  msg += `<br><br><span style="color:var(--text-dim); font-size:0.8rem;">※ 이 테스트는 참고용이며 의료 진단을 대체하지 않습니다.</span>`;

  resultEl.innerHTML = `<p>${msg}</p>`;
}

// ======================================================
// 3. ENVIRONMENT SIMULATION (with Audio Synthesis)
// ======================================================
let envCanvas, envCtx, envAnimFrame;
let currentEnv = 'cafe';
let envHAEnabled = false;
let envAudioCtx = null;
let envAudioNodes = []; // active audio nodes for current environment
let envIsPlaying = false;

const ENV_CONFIG = {
  cafe: {
    label: '카페',
    noiseSources: [
      { type: 'ambient', label: '배경 음악', freq: 0.8, amp: 0.6 },
      { type: 'noise', label: '접시/컵 소리', freq: 3.5, amp: 0.5, burst: true },
      { type: 'noise', label: '다른 테이블 대화', freq: 1.2, amp: 0.7 },
      { type: 'voice', label: '상대방 음성', freq: 1.0, amp: 0.5 },
    ],
    noiseLevel: 0.65,
    voiceLevel: 0.5,
    color: '#ff8844',
    // Audio synthesis definitions
    audio: [
      // Background music: warm low-mid tones
      { synthType: 'music', freqs: [220, 330, 440], gain: 0.04, isVoice: false },
      // Dishes/cups: high frequency bursts
      { synthType: 'clatter', freq: 3500, gain: 0.02, isVoice: false },
      // Other table chatter: filtered noise in speech band
      { synthType: 'chatter', freqLow: 200, freqHigh: 2000, gain: 0.05, isVoice: false },
      // Companion voice: clear speech-range tones
      { synthType: 'voice', freqs: [300, 600, 1200, 2400], gain: 0.06, isVoice: true },
    ]
  },
  street: {
    label: '길거리',
    noiseSources: [
      { type: 'noise', label: '차량 소음', freq: 0.3, amp: 0.9 },
      { type: 'noise', label: '클랙슨', freq: 2.0, amp: 0.7, burst: true },
      { type: 'noise', label: '바람 소리', freq: 0.1, amp: 0.4 },
      { type: 'voice', label: '동행자 음성', freq: 1.0, amp: 0.4 },
    ],
    noiseLevel: 0.8,
    voiceLevel: 0.35,
    color: '#ff4444',
    audio: [
      // Traffic: low rumble
      { synthType: 'rumble', freqLow: 50, freqHigh: 300, gain: 0.07, isVoice: false },
      // Honking: harsh mid-high
      { synthType: 'honk', freq: 600, gain: 0.03, isVoice: false },
      // Wind: broadband whoosh
      { synthType: 'wind', freqLow: 100, freqHigh: 1500, gain: 0.03, isVoice: false },
      // Companion voice
      { synthType: 'voice', freqs: [280, 560, 1100, 2200], gain: 0.05, isVoice: true },
    ]
  },
  conversation: {
    label: '대화',
    noiseSources: [
      { type: 'ambient', label: '에어컨', freq: 0.15, amp: 0.2 },
      { type: 'voice', label: '상대방 음성 1', freq: 1.0, amp: 0.7 },
      { type: 'voice', label: '상대방 음성 2', freq: 1.5, amp: 0.6 },
    ],
    noiseLevel: 0.2,
    voiceLevel: 0.7,
    color: '#ffcc00',
    audio: [
      // AC hum
      { synthType: 'hum', freq: 120, gain: 0.02, isVoice: false },
      // Voice 1 (lower, male-like)
      { synthType: 'voice', freqs: [180, 360, 720, 1800], gain: 0.06, isVoice: true },
      // Voice 2 (higher, female-like)
      { synthType: 'voice', freqs: [320, 640, 1280, 2800], gain: 0.05, isVoice: true },
    ]
  },
  nature: {
    label: '자연',
    noiseSources: [
      { type: 'ambient', label: '새소리', freq: 4.0, amp: 0.3 },
      { type: 'ambient', label: '바람', freq: 0.2, amp: 0.25 },
      { type: 'ambient', label: '물소리', freq: 1.5, amp: 0.3 },
      { type: 'voice', label: '동행자 음성', freq: 1.0, amp: 0.6 },
    ],
    noiseLevel: 0.3,
    voiceLevel: 0.55,
    color: '#44cc66',
    audio: [
      // Birds: high pitched chirps
      { synthType: 'birds', freqs: [2800, 3500, 4200], gain: 0.02, isVoice: false },
      // Wind: low broadband
      { synthType: 'wind', freqLow: 80, freqHigh: 800, gain: 0.025, isVoice: false },
      // Water stream
      { synthType: 'water', freqLow: 500, freqHigh: 4000, gain: 0.02, isVoice: false },
      // Companion voice
      { synthType: 'voice', freqs: [260, 520, 1040, 2600], gain: 0.05, isVoice: true },
    ]
  }
};

// --- Audio Synthesis Engine ---
function createWhiteNoise(ctx, duration) {
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * duration;
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function buildEnvAudio(envKey) {
  stopEnvAudio();

  if (!envAudioCtx) {
    envAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  const ctx = envAudioCtx;
  const env = ENV_CONFIG[envKey];
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.8;
  masterGain.connect(ctx.destination);

  const noiseBuffer = createWhiteNoise(ctx, 4);

  env.audio.forEach(src => {
    const nodes = {};
    // Per-source gain node (this is what we modulate for HA effect)
    const srcGain = ctx.createGain();
    srcGain.gain.value = src.gain;
    srcGain.connect(masterGain);
    nodes.gain = srcGain;
    nodes.isVoice = src.isVoice;
    nodes.baseGain = src.gain;
    nodes.sources = [];

    switch (src.synthType) {
      case 'voice': {
        // Simulate speech: multiple harmonics with vibrato
        src.freqs.forEach((f, i) => {
          const osc = ctx.createOscillator();
          osc.type = i === 0 ? 'sawtooth' : 'sine';
          // Add natural vibrato
          const vibrato = ctx.createOscillator();
          const vibratoGain = ctx.createGain();
          vibrato.frequency.value = 4 + Math.random() * 2; // 4-6 Hz vibrato
          vibratoGain.gain.value = f * 0.02; // subtle pitch variation
          vibrato.connect(vibratoGain);
          vibratoGain.connect(osc.frequency);
          vibrato.start();

          osc.frequency.value = f;
          // Amplitude modulation for natural speech rhythm
          const ampMod = ctx.createOscillator();
          const ampModGain = ctx.createGain();
          ampMod.frequency.value = 2 + Math.random() * 2; // syllable rate
          ampModGain.gain.value = 0.4;
          ampMod.connect(ampModGain);

          const ampGain = ctx.createGain();
          ampGain.gain.value = i === 0 ? 0.5 : 0.3 / (i + 1);
          ampModGain.connect(ampGain.gain);
          ampMod.start();

          osc.connect(ampGain);
          ampGain.connect(srcGain);
          osc.start();

          nodes.sources.push(osc, vibrato, ampMod);
        });
        break;
      }
      case 'music': {
        src.freqs.forEach((f, i) => {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = f;
          const g = ctx.createGain();
          g.gain.value = 0.3 / (i + 1);
          // Slow tremolo
          const trem = ctx.createOscillator();
          const tremG = ctx.createGain();
          trem.frequency.value = 0.3 + i * 0.1;
          tremG.gain.value = 0.15;
          trem.connect(tremG);
          tremG.connect(g.gain);
          trem.start();

          osc.connect(g);
          g.connect(srcGain);
          osc.start();
          nodes.sources.push(osc, trem);
        });
        break;
      }
      case 'chatter':
      case 'rumble':
      case 'wind':
      case 'water': {
        // Filtered noise
        const noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = noiseBuffer;
        noiseSrc.loop = true;

        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = (src.freqLow + src.freqHigh) / 2;
        bp.Q.value = bp.frequency.value / (src.freqHigh - src.freqLow);

        noiseSrc.connect(bp);
        bp.connect(srcGain);
        noiseSrc.start();
        nodes.sources.push(noiseSrc);
        break;
      }
      case 'clatter': {
        // Periodic high-frequency clicks
        const noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = noiseBuffer;
        noiseSrc.loop = true;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = src.freq;
        hp.Q.value = 2;
        // Gate it with a slow square-ish LFO for intermittent clatter
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 1.5;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.5;
        lfo.connect(lfoGain);
        const gateGain = ctx.createGain();
        gateGain.gain.value = 0.5;
        lfoGain.connect(gateGain.gain);
        lfo.start();

        noiseSrc.connect(hp);
        hp.connect(gateGain);
        gateGain.connect(srcGain);
        noiseSrc.start();
        nodes.sources.push(noiseSrc, lfo);
        break;
      }
      case 'honk': {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = src.freq;
        // Intermittent honking
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.4;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.5;
        lfo.connect(lfoGain);
        const gate = ctx.createGain();
        gate.gain.value = 0.5;
        lfoGain.connect(gate.gain);
        lfo.start();

        osc.connect(gate);
        gate.connect(srcGain);
        osc.start();
        nodes.sources.push(osc, lfo);
        break;
      }
      case 'hum': {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = src.freq;
        osc.connect(srcGain);
        osc.start();
        // Add harmonic
        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = src.freq * 2;
        const g2 = ctx.createGain();
        g2.gain.value = 0.3;
        osc2.connect(g2);
        g2.connect(srcGain);
        osc2.start();
        nodes.sources.push(osc, osc2);
        break;
      }
      case 'birds': {
        // Chirping with frequency sweeps
        src.freqs.forEach((f, i) => {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = f;
          // Chirp modulation
          const chirpLfo = ctx.createOscillator();
          chirpLfo.frequency.value = 6 + i * 3;
          const chirpGain = ctx.createGain();
          chirpGain.gain.value = f * 0.15;
          chirpLfo.connect(chirpGain);
          chirpGain.connect(osc.frequency);
          chirpLfo.start();
          // Amplitude gate for intermittent chirps
          const ampLfo = ctx.createOscillator();
          ampLfo.frequency.value = 0.5 + i * 0.3;
          const ampLfoG = ctx.createGain();
          ampLfoG.gain.value = 0.5;
          ampLfo.connect(ampLfoG);
          const gate = ctx.createGain();
          gate.gain.value = 0.3 / (i + 1);
          ampLfoG.connect(gate.gain);
          ampLfo.start();

          osc.connect(gate);
          gate.connect(srcGain);
          osc.start();
          nodes.sources.push(osc, chirpLfo, ampLfo);
        });
        break;
      }
    }

    envAudioNodes.push(nodes);
  });

  envIsPlaying = true;
  updateEnvAudioGains();
}

function updateEnvAudioGains() {
  if (!envAudioCtx || !envIsPlaying) return;
  envAudioNodes.forEach(nodes => {
    let targetGain = nodes.baseGain;
    if (envHAEnabled) {
      if (nodes.isVoice) {
        targetGain = Math.min(0.12, nodes.baseGain * 1.8); // Boost voice
      } else {
        targetGain = nodes.baseGain * 0.08; // Suppress noise heavily
      }
    }
    nodes.gain.gain.linearRampToValueAtTime(targetGain, envAudioCtx.currentTime + 0.3);
  });
}

function stopEnvAudio() {
  envAudioNodes.forEach(nodes => {
    nodes.sources.forEach(src => {
      try { src.stop(); } catch (e) {}
    });
    try { nodes.gain.disconnect(); } catch (e) {}
  });
  envAudioNodes = [];
  envIsPlaying = false;
}

function resizeEnvCanvas() {
  if (envCanvas && envCanvas.clientWidth > 0 && envCanvas.clientHeight > 0) {
    envCanvas.width = envCanvas.clientWidth * (isMobile ? 1 : 2);
    envCanvas.height = envCanvas.clientHeight * (isMobile ? 1 : 2);
  }
}

function setupEnvironmentSim() {
  envCanvas = document.getElementById('env-canvas');
  envCtx = envCanvas.getContext('2d');
  resizeEnvCanvas();

  // Environment buttons
  document.querySelectorAll('.env-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.env-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentEnv = btn.dataset.env;
      // Restart audio for new environment
      if (envIsPlaying) {
        buildEnvAudio(currentEnv);
      }
    });
  });

  // Hearing aid toggle
  const toggle = document.getElementById('env-ha-toggle');
  toggle.addEventListener('click', () => {
    envHAEnabled = !envHAEnabled;
    toggle.classList.toggle('active', envHAEnabled);
    toggle.querySelector('.toggle-text').textContent = envHAEnabled ? '보청기 ON' : '보청기 OFF';
    updateEnvAudioGains();
  });

  // Play/stop audio button
  const playBtn = document.getElementById('env-play-btn');
  playBtn.addEventListener('click', () => {
    if (envIsPlaying) {
      stopEnvAudio();
      playBtn.innerHTML = '<span>🔊</span> 소리 재생';
      playBtn.classList.remove('playing');
    } else {
      buildEnvAudio(currentEnv);
      playBtn.innerHTML = '<span>⏹</span> 소리 정지';
      playBtn.classList.add('playing');
    }
  });

  drawEnvironmentSim();
}

function drawEnvironmentSim() {
  // Auto-resize if canvas was initialized while hidden
  if (envCanvas.width === 0 || envCanvas.height === 0) {
    resizeEnvCanvas();
  }
  const ctx = envCtx;
  const w = envCanvas.width;
  const h = envCanvas.height;
  if (w === 0 || h === 0) { envAnimFrame = requestAnimationFrame(drawEnvironmentSim); return; }
  const time = performance.now() * 0.001;
  const env = ENV_CONFIG[currentEnv];

  ctx.fillStyle = 'rgba(5,5,8,0.15)';
  ctx.fillRect(0, 0, w, h);

  const centerX = w / 2;
  const centerY = h / 2;

  // Draw ear/listener icon in center
  ctx.beginPath();
  ctx.arc(centerX, centerY, 20, 0, Math.PI * 2);
  ctx.fillStyle = envHAEnabled ? 'rgba(0,200,255,0.8)' : 'rgba(255,255,255,0.3)';
  ctx.fill();
  ctx.font = `${isMobile ? 14 : 18}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#050508';
  ctx.fillText('\u{1F442}', centerX, centerY);
  ctx.textBaseline = 'alphabetic';

  // Draw sound sources around the listener
  env.noiseSources.forEach((src, i) => {
    const angle = (i / env.noiseSources.length) * Math.PI * 2 - Math.PI / 2;
    const dist = 80 + (isMobile ? 40 : 80);
    const sx = centerX + Math.cos(angle) * dist;
    const sy = centerY + Math.sin(angle) * dist;

    const isVoice = src.type === 'voice';
    const baseColor = isVoice ? '0,200,255' : '255,68,68';

    let effectiveAmp = src.amp;
    if (src.burst) {
      effectiveAmp *= 0.5 + Math.abs(Math.sin(time * 2 + i)) * 0.5;
    }

    let displayAmp = effectiveAmp;
    if (envHAEnabled) {
      if (isVoice) {
        displayAmp = Math.min(1, effectiveAmp * 1.5);
      } else {
        displayAmp *= 0.15;
      }
    }

    // Expanding rings
    for (let r = 0; r < 3; r++) {
      const ringPhase = (time * src.freq + r * 0.8) % 3;
      const ringRadius = 15 + ringPhase * 30 * displayAmp;
      const ringOpacity = (1 - ringPhase / 3) * displayAmp * 0.6;
      ctx.beginPath();
      ctx.arc(sx, sy, ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${baseColor}, ${ringOpacity})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Sound ray to listener
    const rayOpacity = displayAmp * 0.4;
    const grad = ctx.createLinearGradient(sx, sy, centerX, centerY);
    grad.addColorStop(0, `rgba(${baseColor}, ${rayOpacity})`);
    grad.addColorStop(1, `rgba(${baseColor}, 0)`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = displayAmp * 4;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(centerX, centerY);
    ctx.stroke();

    // Source label
    ctx.fillStyle = `rgba(${baseColor}, 0.8)`;
    ctx.font = `${isMobile ? 9 : 12}px "Noto Sans KR", sans-serif`;
    ctx.textAlign = 'center';
    const labelY = sy + (sy > centerY ? 30 : -20);
    ctx.fillText(src.label, sx, labelY);

    // Amplitude bar
    const barW = 40;
    const barH = 4;
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(sx - barW / 2, labelY + 6, barW, barH);
    ctx.fillStyle = `rgba(${baseColor}, 0.7)`;
    ctx.fillRect(sx - barW / 2, labelY + 6, barW * displayAmp, barH);
  });

  // Clarity indicator
  const clarity = envHAEnabled
    ? Math.min(100, Math.floor((env.voiceLevel * 1.5 / (env.voiceLevel * 1.5 + env.noiseLevel * 0.15)) * 100))
    : Math.floor((env.voiceLevel / (env.voiceLevel + env.noiseLevel)) * 100);

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `bold ${isMobile ? 11 : 14}px "Noto Sans KR", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(`\u{1F50A} \uC74C\uC131 \uBA85\uB8CC\uB3C4: ${clarity}%`, centerX, h - 20);

  const cBarW = 120;
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(centerX - cBarW / 2, h - 14, cBarW, 6);
  const cColor = clarity > 70 ? '#00c8ff' : clarity > 40 ? '#ffcc00' : '#ff4444';
  ctx.fillStyle = cColor;
  ctx.fillRect(centerX - cBarW / 2, h - 14, cBarW * clarity / 100, 6);

  // Environment label
  ctx.fillStyle = env.color;
  ctx.font = `bold ${isMobile ? 12 : 16}px "Noto Sans KR", sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(`\u{1F50A} ${env.label}`, 16, 28);

  // Play status
  if (!envIsPlaying) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = `${isMobile ? 10 : 13}px "Noto Sans KR", sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText('\u{1F50A} \uC18C\uB9AC \uC7AC\uC0DD \uBC84\uD2BC\uC744 \uB20C\uB7EC\uBCF4\uC138\uC694', w - 16, 28);
  }

  envAnimFrame = requestAnimationFrame(drawEnvironmentSim);
}

// ===== START =====
document.addEventListener('DOMContentLoaded', init);
