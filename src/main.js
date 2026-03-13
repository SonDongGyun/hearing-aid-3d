import * as THREE from 'three';
import { gsap } from 'gsap';

// ===== GLOBALS =====
let scene, camera, renderer;
let hearingAidGroup, particleSystem, soundWaveRings = [];
let handCanvas, handCtx;
let handX = 0.5, handY = 0.5, handOpen = true, handActive = false;
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

  // Hand interaction canvas
  handCanvas = document.getElementById('hand-canvas');
  handCtx = handCanvas.getContext('2d');

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

  // Start camera button
  document.getElementById('start-camera').addEventListener('click', startHandTracking);
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

// ===== HAND TRACKING =====
async function startHandTracking() {
  const overlay = document.getElementById('hand-overlay');
  const video = document.getElementById('webcam');
  const cursor = document.getElementById('hand-cursor');

  try {
    const camWidth = isMobile ? 320 : 640;
    const camHeight = isMobile ? 240 : 360;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: camWidth, height: camHeight, facingMode: 'user' }
    });
    video.srcObject = stream;
    await video.play();

    overlay.classList.add('hidden');

    // Resize canvas
    handCanvas.width = handCanvas.clientWidth;
    handCanvas.height = handCanvas.clientHeight;

    // Load MediaPipe Hands
    const { Hands } = await import('@mediapipe/hands');
    const { Camera } = await import('@mediapipe/camera_utils');

    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: isMobile ? 0 : 1, // lighter model on mobile
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5
    });

    hands.onResults((results) => {
      handCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);

      // Draw camera feed (mirrored)
      handCtx.save();
      handCtx.scale(-1, 1);
      handCtx.drawImage(video, -handCanvas.width, 0, handCanvas.width, handCanvas.height);
      handCtx.restore();

      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        handActive = true;
        cursor.classList.add('active');

        // Get palm center
        const palm = landmarks[9]; // middle finger base
        handX = 1 - palm.x; // mirror
        handY = palm.y;

        // Update cursor position
        const canvasRect = handCanvas.getBoundingClientRect();
        cursor.style.left = `${canvasRect.left + handX * canvasRect.width}px`;
        cursor.style.top = `${canvasRect.top + handY * canvasRect.height}px`;

        // Detect open/closed hand (distance between fingertips and palm)
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const pinkyTip = landmarks[20];
        const wrist = landmarks[0];

        const avgFingerDist = (
          distance(indexTip, wrist) +
          distance(pinkyTip, wrist) +
          distance(thumbTip, wrist)
        ) / 3;

        handOpen = avgFingerDist > 0.25;

        // Draw hand skeleton
        drawHandLandmarks(landmarks);

        // Draw sound waves on canvas
        drawSoundWaveEffect(handX, handY, handOpen);
      } else {
        handActive = false;
        cursor.classList.remove('active');
      }
    });

    const mpCamera = new Camera(video, {
      onFrame: async () => {
        await hands.send({ image: video });
      },
      width: camWidth,
      height: camHeight
    });
    mpCamera.start();

  } catch (err) {
    console.error('Camera access failed:', err);
    overlay.innerHTML = `
      <p style="color: #ff6666;">카메라 접근이 거부되었습니다.</p>
      <p class="hand-hint">브라우저 설정에서 카메라 권한을 허용해주세요.</p>
    `;
  }
}

function distance(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

function drawHandLandmarks(landmarks) {
  const w = handCanvas.width;
  const h = handCanvas.height;

  // Connections
  const connections = [
    [0,1],[1,2],[2,3],[3,4],    // thumb
    [0,5],[5,6],[6,7],[7,8],    // index
    [0,9],[9,10],[10,11],[11,12], // middle
    [0,13],[13,14],[14,15],[15,16], // ring
    [0,17],[17,18],[18,19],[19,20], // pinky
    [5,9],[9,13],[13,17]          // palm
  ];

  handCtx.strokeStyle = 'rgba(0, 200, 255, 0.6)';
  handCtx.lineWidth = 2;

  connections.forEach(([a, b]) => {
    const pa = landmarks[a];
    const pb = landmarks[b];
    handCtx.beginPath();
    handCtx.moveTo((1 - pa.x) * w, pa.y * h);
    handCtx.lineTo((1 - pb.x) * w, pb.y * h);
    handCtx.stroke();
  });

  // Joints
  landmarks.forEach((lm, i) => {
    const x = (1 - lm.x) * w;
    const y = lm.y * h;
    const isFingertip = [4, 8, 12, 16, 20].includes(i);

    handCtx.beginPath();
    handCtx.arc(x, y, isFingertip ? 6 : 3, 0, Math.PI * 2);

    if (isFingertip) {
      const gradient = handCtx.createRadialGradient(x, y, 0, x, y, 10);
      gradient.addColorStop(0, 'rgba(0, 200, 255, 1)');
      gradient.addColorStop(1, 'rgba(123, 97, 255, 0)');
      handCtx.fillStyle = gradient;
    } else {
      handCtx.fillStyle = 'rgba(0, 200, 255, 0.8)';
    }
    handCtx.fill();
  });
}

function drawSoundWaveEffect(x, y, isOpen) {
  const w = handCanvas.width;
  const h = handCanvas.height;
  const cx = x * w;
  const cy = y * h;
  const time = performance.now() * 0.003;

  if (isOpen) {
    // Expanding sound waves
    for (let i = 0; i < 5; i++) {
      const radius = 30 + i * 40 + Math.sin(time + i) * 15;
      const opacity = 0.4 - i * 0.07;

      handCtx.beginPath();
      handCtx.arc(cx, cy, radius, 0, Math.PI * 2);
      handCtx.strokeStyle = `rgba(0, 200, 255, ${opacity})`;
      handCtx.lineWidth = 2;
      handCtx.stroke();

      // Frequency visualization
      handCtx.beginPath();
      for (let a = 0; a < Math.PI * 2; a += 0.05) {
        const waveR = radius + Math.sin(a * 8 + time * 3) * (5 + i * 3);
        const px = cx + Math.cos(a) * waveR;
        const py = cy + Math.sin(a) * waveR;
        if (a === 0) handCtx.moveTo(px, py);
        else handCtx.lineTo(px, py);
      }
      handCtx.closePath();
      handCtx.strokeStyle = `rgba(123, 97, 255, ${opacity * 0.5})`;
      handCtx.lineWidth = 1;
      handCtx.stroke();
    }
  } else {
    // Converging particles
    for (let i = 0; i < 30; i++) {
      const angle = (i / 30) * Math.PI * 2 + time;
      const dist = 20 + Math.sin(time * 2 + i) * 10;
      const px = cx + Math.cos(angle) * dist;
      const py = cy + Math.sin(angle) * dist;

      handCtx.beginPath();
      handCtx.arc(px, py, 3, 0, Math.PI * 2);
      const gradient = handCtx.createRadialGradient(px, py, 0, px, py, 5);
      gradient.addColorStop(0, 'rgba(0, 200, 255, 0.9)');
      gradient.addColorStop(1, 'rgba(123, 97, 255, 0)');
      handCtx.fillStyle = gradient;
      handCtx.fill();
    }

    // Center glow
    const glow = handCtx.createRadialGradient(cx, cy, 0, cx, cy, 30);
    glow.addColorStop(0, 'rgba(0, 200, 255, 0.5)');
    glow.addColorStop(0.5, 'rgba(123, 97, 255, 0.2)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    handCtx.beginPath();
    handCtx.arc(cx, cy, 30, 0, Math.PI * 2);
    handCtx.fillStyle = glow;
    handCtx.fill();
  }

  // DB level text
  const db = isOpen ? Math.floor(40 + Math.sin(time) * 15) : Math.floor(20 + Math.sin(time) * 5);
  handCtx.font = 'bold 16px "Noto Sans KR", sans-serif';
  handCtx.fillStyle = 'rgba(0, 200, 255, 0.9)';
  handCtx.textAlign = 'center';
  handCtx.fillText(`${db} dB`, cx, cy - 80);
  handCtx.font = '12px "Noto Sans KR", sans-serif';
  handCtx.fillStyle = 'rgba(255,255,255,0.5)';
  handCtx.fillText(isOpen ? '음파 확산 모드' : '음파 집중 모드', cx, cy - 60);
}

// ===== START =====
document.addEventListener('DOMContentLoaded', init);
