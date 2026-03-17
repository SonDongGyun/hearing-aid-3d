import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { gsap } from 'gsap';

// ===== GLOBALS =====
let scene, camera, renderer;
let hearingAidGroup, hearingAidParts = {}, particleSystem, soundWaveRings = [];
let handActive = false;
let scrollY = 0, targetScrollY = 0;
const clock = new THREE.Clock();
const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  || (window.innerWidth <= 768);
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// ===== MOBILE AUDIO UNLOCK =====
// iOS/Android require AudioContext to be created & unlocked during a user gesture.
// We create a shared context and unlock it on first touch/click.
let sharedAudioCtx = null;
let audioUnlocked = false;

function getSharedAudioCtx() {
  if (!sharedAudioCtx) {
    sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return sharedAudioCtx;
}

// Safari-compatible decodeAudioData (callback-based fallback)
function decodeAudio(ctx, arrayBuffer) {
  return new Promise((resolve, reject) => {
    // Safari may not support promise-based decodeAudioData
    ctx.decodeAudioData(arrayBuffer, resolve, reject);
  });
}

async function unlockAudio() {
  if (audioUnlocked) return;
  const ctx = getSharedAudioCtx();
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch(e) {}
  }
  // iOS requires playing actual audio in gesture context
  try {
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch(e) {}
  audioUnlocked = true;
}

// Unlock audio on first user interaction
['touchstart', 'touchend', 'click', 'keydown'].forEach(evt => {
  document.addEventListener(evt, unlockAudio, { once: false, passive: true });
});

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
  setupPartInteraction();
  setupVirtualFitting();

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
  hearingAidGroup.rotation.set(0.3, 0, 0.2);
  scene.add(hearingAidGroup);

  const loader = new GLTFLoader();
  loader.load('/models/hearing-aid.glb', (gltf) => {
    const model = gltf.scene;

    // Scale to match previous model size (~4 units tall)
    model.scale.setScalar(1.8);

    // Upgrade all materials to PBR Physical for clearcoat/shine
    model.traverse((child) => {
      if (child.isMesh) {
        // Store reference by name for individual animation
        hearingAidParts[child.name] = child;

        const oldMat = child.material;
        if (child.name === 'body' || child.name === 'battery_door') {
          child.material = new THREE.MeshPhysicalMaterial({
            color: oldMat.color,
            metalness: oldMat.metalness || 0.4,
            roughness: oldMat.roughness || 0.2,
            clearcoat: 1.0,
            clearcoatRoughness: 0.1,
            envMapIntensity: 1.5
          });
        } else if (child.name === 'brand_ring') {
          child.material = new THREE.MeshBasicMaterial({
            color: 0x00c8ff,
            transparent: true,
            opacity: 0.85
          });
        } else if (child.name === 'led_indicator') {
          child.material = new THREE.MeshBasicMaterial({
            color: 0x00ff88,
            transparent: true,
            opacity: 0.9
          });
        } else if (child.name === 'ear_hook' || child.name === 'sound_tube') {
          child.material = new THREE.MeshPhysicalMaterial({
            color: oldMat.color,
            metalness: 0.0,
            roughness: 0.1,
            transparent: true,
            opacity: 0.85,
            clearcoat: 0.5
          });
        } else if (child.name === 'ear_tip') {
          child.material = new THREE.MeshPhysicalMaterial({
            color: oldMat.color,
            metalness: 0.0,
            roughness: 0.6,
            clearcoat: 0.2
          });
        } else if (child.name === 'mic_grille') {
          child.material = new THREE.MeshPhysicalMaterial({
            color: oldMat.color,
            metalness: 0.8,
            roughness: 0.3
          });
        }
      }
    });

    hearingAidGroup.add(model);

    // Add wireframe overlay for tech aesthetic
    const wireGeo = new THREE.IcosahedronGeometry(3, 1);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x00c8ff,
      wireframe: true,
      transparent: true,
      opacity: 0.05
    });
    const wireframe = new THREE.Mesh(wireGeo, wireMat);
    hearingAidGroup.add(wireframe);
  }, undefined, (err) => {
    console.warn('GLB load failed, using fallback geometry:', err);
    createHearingAidFallback();
  });
}

// Fallback if GLB fails to load
function createHearingAidFallback() {
  const bodyPoints = [];
  for (let i = 0; i < 20; i++) {
    const t = i / 19;
    const r = 1.8 * Math.sin(t * Math.PI) * (1 + 0.3 * Math.sin(t * Math.PI * 3));
    bodyPoints.push(new THREE.Vector2(r, t * 4 - 2));
  }
  const bodyGeo = new THREE.LatheGeometry(bodyPoints, 32);
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0xd0d5e0, metalness: 0.6, roughness: 0.15,
    clearcoat: 1.0, clearcoatRoughness: 0.1
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.scale.set(0.8, 1, 0.8);
  hearingAidGroup.add(body);

  const tipGeo = new THREE.CylinderGeometry(0.3, 0.5, 1.5, 16);
  const tipMat = new THREE.MeshPhysicalMaterial({
    color: 0x00c8ff, metalness: 0.8, roughness: 0.1,
    emissive: 0x003344, emissiveIntensity: 0.5
  });
  const tip = new THREE.Mesh(tipGeo, tipMat);
  tip.position.set(0, -2.5, 0);
  hearingAidGroup.add(tip);

  const ringGeo = new THREE.TorusGeometry(1.2, 0.08, 16, 64);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x00c8ff, transparent: true, opacity: 0.8 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.5;
  ring.rotation.x = Math.PI / 2;
  hearingAidGroup.add(ring);

  const ledGeo = new THREE.SphereGeometry(0.15, 16, 16);
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.9 });
  const led = new THREE.Mesh(ledGeo, ledMat);
  led.position.set(0.8, 1.2, 1);
  hearingAidGroup.add(led);
}

// ===== PART INTERACTION =====
const PART_INFO = {
  body: {
    tag: 'DESIGN',
    title: '초경량 하우징',
    desc: '의료용 티타늄 합금으로 제작된 2.1g 초경량 본체. 인체공학적 곡면 설계로 귀 뒤에 완벽히 밀착됩니다.'
  },
  ear_hook: {
    tag: 'COMFORT',
    title: '플렉시블 이어훅',
    desc: '형상기억 합금 와이어로 어떤 귀 형태에도 맞게 자유롭게 조절됩니다. 안경과 함께 착용해도 편안합니다.'
  },
  sound_tube: {
    tag: 'ACOUSTIC',
    title: '음향 전달 튜브',
    desc: '의료용 실리콘 튜브로 고음질 사운드를 왜곡 없이 귀 안으로 전달합니다. 항균 코팅 적용.'
  },
  ear_tip: {
    tag: 'FIT',
    title: '오픈형 이어돔',
    desc: '3가지 사이즈의 소프트 실리콘 돔. 외이도를 막지 않는 오픈형 설계로 자연스러운 소리를 유지합니다.'
  },
  mic_grille: {
    tag: 'AI NOISE CANCEL',
    title: '듀얼 마이크 어레이',
    desc: '전/후면 듀얼 마이크가 360° 소리를 수집. AI가 실시간으로 소음은 제거하고 음성만 증폭합니다.'
  },
  button_volume: {
    tag: 'CONTROL',
    title: '멀티 펑션 버튼',
    desc: '볼륨 조절, 프로그램 전환, 전화 받기를 한 버튼으로. 장갑을 끼고도 조작 가능한 촉각 설계.'
  },
  led_indicator: {
    tag: 'STATUS',
    title: 'LED 상태 표시등',
    desc: '배터리 잔량, 연결 상태, 충전 상태를 색상으로 직관적으로 알려줍니다.'
  },
  battery_door: {
    tag: 'BATTERY',
    title: '충전식 배터리',
    desc: '1회 충전으로 48시간 연속 사용. Qi 무선 충전 호환. 배터리 교체 없이 3년 이상 사용 가능.'
  },
  brand_ring: {
    tag: 'TECH',
    title: 'SoundClear 시그니처 링',
    desc: '블루투스 5.3 안테나가 내장된 디자인 요소. 스마트폰, TV와 끊김 없이 연결됩니다.'
  }
};

let raycaster, mouse;
let hoveredPart = null;
let selectedPart = null;
let originalMaterials = {};

function setupPartInteraction() {
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  const canvas = renderer.domElement;

  canvas.addEventListener('mousemove', onPartHover);
  canvas.addEventListener('click', onPartClick);
  canvas.addEventListener('touchend', onPartTouch);
}

function getIntersectedPart(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // Collect all meshes from hearingAidGroup
  const meshes = [];
  if (hearingAidGroup) {
    hearingAidGroup.traverse((child) => {
      if (child.isMesh && PART_INFO[child.name]) {
        meshes.push(child);
      }
    });
  }

  const intersects = raycaster.intersectObjects(meshes, false);
  if (intersects.length > 0) {
    return intersects[0].object;
  }
  return null;
}

function onPartHover(e) {
  const part = getIntersectedPart(e.clientX, e.clientY);

  if (part !== hoveredPart) {
    // Reset previous hover
    if (hoveredPart && hoveredPart !== selectedPart) {
      resetPartMaterial(hoveredPart);
    }

    hoveredPart = part;

    if (hoveredPart && hoveredPart !== selectedPart) {
      highlightPart(hoveredPart, 0.3);
    }

    // Change cursor
    renderer.domElement.style.cursor = hoveredPart ? 'pointer' : '';
  }

  // Move tooltip near cursor
  if (hoveredPart || selectedPart) {
    const activePart = selectedPart || hoveredPart;
    const tooltip = document.getElementById('part-tooltip');
    if (tooltip.style.display !== 'none') {
      tooltip.style.left = (e.clientX + 20) + 'px';
      tooltip.style.top = (e.clientY - 10) + 'px';
    }
  }
}

function onPartClick(e) {
  const part = getIntersectedPart(e.clientX, e.clientY);

  // Reset previous selection
  if (selectedPart) {
    resetPartMaterial(selectedPart);
    selectedPart = null;
  }

  if (part && PART_INFO[part.name]) {
    selectedPart = part;
    highlightPart(part, 0.6);
    showPartTooltip(part.name, e.clientX, e.clientY);
  } else {
    hidePartTooltip();
  }
}

function onPartTouch(e) {
  if (e.changedTouches.length > 0) {
    const touch = e.changedTouches[0];
    const part = getIntersectedPart(touch.clientX, touch.clientY);

    if (selectedPart) {
      resetPartMaterial(selectedPart);
      selectedPart = null;
    }

    if (part && PART_INFO[part.name]) {
      selectedPart = part;
      highlightPart(part, 0.6);
      showPartTooltip(part.name, touch.clientX, touch.clientY);
    } else {
      hidePartTooltip();
    }
  }
}

function highlightPart(mesh, intensity) {
  // Store original material if not already stored
  if (!originalMaterials[mesh.name]) {
    originalMaterials[mesh.name] = mesh.material.clone();
  }

  // Add emissive highlight
  if (mesh.material.emissive) {
    mesh.material.emissive.setHex(0x00c8ff);
    mesh.material.emissiveIntensity = intensity;
  } else {
    mesh.material = mesh.material.clone();
    mesh.material.color.lerp(new THREE.Color(0x00c8ff), intensity * 0.5);
  }
}

function resetPartMaterial(mesh) {
  if (originalMaterials[mesh.name]) {
    mesh.material.copy(originalMaterials[mesh.name]);
  }
}

function showPartTooltip(partName, x, y) {
  const info = PART_INFO[partName];
  if (!info) return;

  const tooltip = document.getElementById('part-tooltip');
  document.getElementById('part-tooltip-tag').textContent = info.tag;
  document.getElementById('part-tooltip-title').textContent = info.title;
  document.getElementById('part-tooltip-desc').textContent = info.desc;

  // Position tooltip, keep on screen
  const tipWidth = 280;
  const tipHeight = 150;
  let tx = x + 20;
  let ty = y - 10;
  if (tx + tipWidth > window.innerWidth) tx = x - tipWidth - 20;
  if (ty + tipHeight > window.innerHeight) ty = window.innerHeight - tipHeight - 10;
  if (ty < 10) ty = 10;

  tooltip.style.left = tx + 'px';
  tooltip.style.top = ty + 'px';
  tooltip.style.display = 'block';
}

function hidePartTooltip() {
  document.getElementById('part-tooltip').style.display = 'none';
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
    const led = hearingAidParts['led_indicator'];
    if (led && led.material) {
      led.material.opacity = 0.5 + Math.sin(time * 3) * 0.5;
    }

    // Brand ring glow pulse
    const ring = hearingAidParts['brand_ring'];
    if (ring && ring.material) {
      ring.material.opacity = 0.6 + Math.sin(time * 2) * 0.25;
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
    hidePartTooltip();
    if (selectedPart) {
      resetPartMaterial(selectedPart);
      selectedPart = null;
    }
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
let noiseMicPeakFilter = null; // peaking EQ for mic clarity
let noiseVoicePeak1k = null; // peaking EQ at 1kHz for voice warmth
let noiseVoicePeak2_5k = null; // peaking EQ at 2.5kHz for consonant clarity
let noiseVoiceCompressor = null; // WDRC compressor for voice path

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
    // WAV-based: modulate noise vs voice gain with dramatic difference
    if (noiseNoiseGainNode) {
      noiseNoiseGainNode.gain.linearRampToValueAtTime(
        noiseFilterEnabled ? 0.05 : 1.0, t + 0.3
      );
    }
    if (noiseVoiceGainNode) {
      noiseVoiceGainNode.gain.linearRampToValueAtTime(
        noiseFilterEnabled ? 2.0 : 1.0, t + 0.3
      );
    }
    // Speech enhancement EQ (peaking filters on voice path)
    if (noiseVoicePeak1k) {
      noiseVoicePeak1k.gain.linearRampToValueAtTime(
        noiseFilterEnabled ? 3 : 0, t + 0.3
      );
    }
    if (noiseVoicePeak2_5k) {
      noiseVoicePeak2_5k.gain.linearRampToValueAtTime(
        noiseFilterEnabled ? 6 : 0, t + 0.3
      );
    }
    // Compressor on voice path (threshold change)
    if (noiseVoiceCompressor) {
      noiseVoiceCompressor.threshold.linearRampToValueAtTime(
        noiseFilterEnabled ? -20 : 0, t + 0.3
      );
    }
  } else if (noiseDemoMode === 'mic') {
    // Mic mode: wider bandpass + clarity boost
    if (noiseBandpassFilter) {
      if (noiseFilterEnabled) {
        noiseBandpassFilter.frequency.linearRampToValueAtTime(1200, t + 0.2);
        noiseBandpassFilter.Q.linearRampToValueAtTime(0.35, t + 0.2);
      } else {
        // Wide open = essentially no filter
        noiseBandpassFilter.frequency.linearRampToValueAtTime(5000, t + 0.2);
        noiseBandpassFilter.Q.linearRampToValueAtTime(0.01, t + 0.2);
      }
    }
    if (noiseMicPeakFilter) {
      noiseMicPeakFilter.gain.linearRampToValueAtTime(
        noiseFilterEnabled ? 6 : 0, t + 0.2
      );
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
  noiseMicPeakFilter = null;
  noiseVoicePeak1k = null;
  noiseVoicePeak2_5k = null;
  noiseVoiceCompressor = null;

  // Don't close shared audio context, just release reference
  noiseAudioCtx = null;

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

  // Check if getUserMedia is available (requires HTTPS)
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    overlay.innerHTML = `
      <p style="color:#ff6666;">이 브라우저에서 마이크를 사용할 수 없습니다.</p>
      <p class="hand-hint">HTTPS 환경에서 접속하거나, 시뮬레이션 모드를 사용해주세요.</p>
      <button class="btn-secondary" onclick="startSimulatedNoise()" style="margin-top:12px;">
        <span>🔊</span> 시뮬레이션으로 체험
      </button>
    `;
    return;
  }

  // iOS-safe: create/resume AudioContext synchronously in gesture context
  noiseAudioCtx = getSharedAudioCtx();
  noiseAudioCtx.resume(); // kick off synchronously, don't await

  try {
    noiseMicStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    console.warn('Mic access error:', err.name, err.message);
    // Show specific error instead of silently falling back
    const msg = err.name === 'NotAllowedError'
      ? '마이크 권한이 거부되었습니다.<br>브라우저 설정에서 마이크 권한을 허용해주세요.'
      : err.name === 'NotFoundError'
        ? '마이크 장치를 찾을 수 없습니다.'
        : `마이크 접근 오류: ${err.message}`;
    overlay.innerHTML = `
      <p style="color:#ff6666;">${msg}</p>
      <button class="btn-secondary" onclick="startSimulatedNoise()" style="margin-top:12px;">
        <span>🔊</span> 시뮬레이션으로 체험하기
      </button>
    `;
    return;
  }

  // Mic access granted — proceed
  overlay.classList.add('hidden');
  document.getElementById('noise-stop-wrap').style.display = 'block';
  noiseDemoMode = 'mic';

  // Ensure resumed after async getUserMedia
  if (noiseAudioCtx.state === 'suspended') await noiseAudioCtx.resume();
  const source = noiseAudioCtx.createMediaStreamSource(noiseMicStream);

  // Bandpass filter for AI noise cancellation effect
  noiseBandpassFilter = noiseAudioCtx.createBiquadFilter();
  noiseBandpassFilter.type = 'bandpass';
  noiseBandpassFilter.frequency.value = 5000; // wide = no filter initially
  noiseBandpassFilter.Q.value = 0.01;

  // Peaking EQ at 2.5kHz for consonant clarity when filter is ON
  noiseMicPeakFilter = noiseAudioCtx.createBiquadFilter();
  noiseMicPeakFilter.type = 'peaking';
  noiseMicPeakFilter.frequency.value = 2500;
  noiseMicPeakFilter.Q.value = 1.0;
  noiseMicPeakFilter.gain.value = 0; // starts flat

  noiseAnalyser = noiseAudioCtx.createAnalyser();
  noiseAnalyser.fftSize = 2048;
  noiseAnalyser.smoothingTimeConstant = 0.8;

  source.connect(noiseBandpassFilter);
  noiseBandpassFilter.connect(noiseMicPeakFilter);
  noiseMicPeakFilter.connect(noiseAnalyser);

  noiseDataArray = new Uint8Array(noiseAnalyser.frequencyBinCount);

  const canvas = document.getElementById('noise-canvas');
  canvas.width = canvas.clientWidth * (isMobile ? 1 : 2);
  canvas.height = canvas.clientHeight * (isMobile ? 1 : 2);

  drawNoiseVisualization(canvas);
}

// Expose for inline onclick in error fallback
window.startSimulatedNoise = startSimulatedNoise;

async function startSimulatedNoise() {
  const overlay = document.getElementById('noise-overlay');
  overlay.classList.add('hidden');
  document.getElementById('noise-stop-wrap').style.display = 'block';
  noiseDemoMode = 'simulated';

  // iOS-safe: create/resume AudioContext synchronously in gesture context
  noiseAudioCtx = getSharedAudioCtx();
  noiseAudioCtx.resume(); // kick off synchronously, don't await
  const ctx = noiseAudioCtx;

  // Load cafe audio sample (realistic ambient with voices)
  try {
    const response = await fetch('/audio/cafe.wav');
    const arrayBuffer = await response.arrayBuffer();

    // Ensure resumed before decoding
    if (ctx.state === 'suspended') await ctx.resume();
    const audioBuffer = await decodeAudio(ctx, arrayBuffer);

    // Play the full mix as a loop
    const fullSource = ctx.createBufferSource();
    fullSource.buffer = audioBuffer;
    fullSource.loop = true;
    noiseSimNodes.push(fullSource);

    // === NOISE PATH: multi-stage filtering for aggressive noise reduction ===
    // Low rumble path
    const noiseLP = ctx.createBiquadFilter();
    noiseLP.type = 'lowpass';
    noiseLP.frequency.value = 250;
    noiseLP.Q.value = 0.7;

    // High hiss path
    const noiseHP = ctx.createBiquadFilter();
    noiseHP.type = 'highpass';
    noiseHP.frequency.value = 3500;
    noiseHP.Q.value = 0.7;

    // Notch filter at common noise frequency
    const noiseNotch = ctx.createBiquadFilter();
    noiseNotch.type = 'notch';
    noiseNotch.frequency.value = 180;
    noiseNotch.Q.value = 2.0;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 1.0;
    noiseNoiseGainNode = noiseGain;

    // Route: source → lowpass → notch → noiseGain (low rumble)
    //        source → highpass → noiseGain (high noise)
    fullSource.connect(noiseLP);
    noiseLP.connect(noiseNotch);
    noiseNotch.connect(noiseGain);
    fullSource.connect(noiseHP);
    noiseHP.connect(noiseGain);

    // === VOICE PATH: speech enhancement chain ===
    // Wider bandpass 250Hz-4000Hz
    const voiceBP = ctx.createBiquadFilter();
    voiceBP.type = 'bandpass';
    voiceBP.frequency.value = 1000;
    voiceBP.Q.value = 0.2; // wider Q for 250-4000Hz coverage

    // Peaking EQ at 1kHz (+3dB) - vowel warmth
    const voicePeak1k = ctx.createBiquadFilter();
    voicePeak1k.type = 'peaking';
    voicePeak1k.frequency.value = 1000;
    voicePeak1k.Q.value = 1.0;
    voicePeak1k.gain.value = 0; // starts flat, activated by applyNoiseFilter
    noiseVoicePeak1k = voicePeak1k;

    // Peaking EQ at 2.5kHz (+6dB) - consonant clarity
    const voicePeak2_5k = ctx.createBiquadFilter();
    voicePeak2_5k.type = 'peaking';
    voicePeak2_5k.frequency.value = 2500;
    voicePeak2_5k.Q.value = 1.0;
    voicePeak2_5k.gain.value = 0; // starts flat
    noiseVoicePeak2_5k = voicePeak2_5k;

    // WDRC compressor for voice
    const voiceCompressor = ctx.createDynamicsCompressor();
    voiceCompressor.threshold.value = 0; // starts inactive
    voiceCompressor.ratio.value = 3;
    voiceCompressor.attack.value = 0.005;
    voiceCompressor.release.value = 0.05;
    voiceCompressor.knee.value = 6;
    noiseVoiceCompressor = voiceCompressor;

    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 1.0;
    noiseVoiceGainNode = voiceGain;

    // Chain: source → bandpass → peak1k → peak2.5k → compressor → voiceGain
    fullSource.connect(voiceBP);
    voiceBP.connect(voicePeak1k);
    voicePeak1k.connect(voicePeak2_5k);
    voicePeak2_5k.connect(voiceCompressor);
    voiceCompressor.connect(voiceGain);

    // === MIX & ANALYSE ===
    noiseAnalyser = ctx.createAnalyser();
    noiseAnalyser.fftSize = 2048;
    noiseAnalyser.smoothingTimeConstant = 0.8;

    const masterGain = ctx.createGain();
    masterGain.gain.value = 1.5;

    noiseGain.connect(noiseAnalyser);
    voiceGain.connect(noiseAnalyser);
    noiseAnalyser.connect(masterGain);
    masterGain.connect(ctx.destination);

    fullSource.start();

    noiseDataArray = new Uint8Array(noiseAnalyser.frequencyBinCount);

    const canvas = document.getElementById('noise-canvas');
    canvas.width = canvas.clientWidth * (isMobile ? 1 : 2);
    canvas.height = canvas.clientHeight * (isMobile ? 1 : 2);

    applyNoiseFilter();
    drawNoiseVisualization(canvas);
  } catch (err) {
    console.error('Failed to load audio sample:', err);
    overlay.classList.remove('hidden');
    overlay.innerHTML = `
      <p style="color:#ff6666;">오디오 샘플을 불러올 수 없습니다.</p>
      <p class="hand-hint">네트워크 연결을 확인해주세요.</p>
    `;
  }
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

        // Dramatic noise cancellation visualization
        if (!isVoice) {
          val *= 0.03; // Near-zero noise bars (97% reduction)
        } else {
          val = Math.min(1, val * 1.5); // Noticeable boost to voice
        }

        const barH = val * h * 0.8;
        const x = i * barWidth;
        // Voice bars in bright blue, noise remnants in dim purple
        ctx.fillStyle = isVoice
          ? `rgba(100, 180, 255, ${0.5 + val * 0.5})`
          : `rgba(123, 97, 255, ${0.2 + val * 0.3})`;
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

  // iOS-safe: create/resume AudioContext synchronously in gesture context
  if (!hearingAudioCtx) {
    hearingAudioCtx = getSharedAudioCtx();
  }
  hearingAudioCtx.resume(); // kick off synchronously

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

// --- WAV-based Audio Engine ---
const envAudioBuffers = {}; // cached decoded audio buffers

async function loadEnvAudioBuffer(envKey) {
  if (envAudioBuffers[envKey]) return envAudioBuffers[envKey];
  try {
    const response = await fetch(`/audio/${envKey}.wav`);
    const arrayBuffer = await response.arrayBuffer();
    if (!envAudioCtx) {
      envAudioCtx = getSharedAudioCtx();
    }
    envAudioBuffers[envKey] = await decodeAudio(envAudioCtx, arrayBuffer);
    return envAudioBuffers[envKey];
  } catch (err) {
    console.error(`Failed to load audio for ${envKey}:`, err);
    throw err;
  }
}

async function buildEnvAudio(envKey) {
  stopEnvAudio();

  // iOS-safe: create/resume AudioContext synchronously in gesture context
  if (!envAudioCtx) {
    envAudioCtx = getSharedAudioCtx();
  }
  envAudioCtx.resume(); // kick off synchronously, don't await
  const ctx = envAudioCtx;

  try {
    const buffer = await loadEnvAudioBuffer(envKey);

    // Ensure resumed after async fetch
    if (ctx.state === 'suspended') await ctx.resume();

    // Play the WAV file on loop
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // === NOISE PATH: hearing loss simulation + noise isolation ===
    // Lowpass at 250Hz to catch rumble
    const noiseLP = ctx.createBiquadFilter();
    noiseLP.type = 'lowpass';
    noiseLP.frequency.value = 250;
    noiseLP.Q.value = 0.7;

    // Highpass at 3500Hz to catch hiss
    const noiseHP = ctx.createBiquadFilter();
    noiseHP.type = 'highpass';
    noiseHP.frequency.value = 3500;
    noiseHP.Q.value = 0.7;

    // Hearing loss simulation filter (lowpass at 2000Hz when HA is OFF)
    // Simulates age-related high-frequency hearing loss
    const hearingLossLP = ctx.createBiquadFilter();
    hearingLossLP.type = 'lowpass';
    hearingLossLP.frequency.value = 2000; // starts with hearing loss active
    hearingLossLP.Q.value = 0.5;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 1.0;

    // Route: source → hearingLossLP → noiseLP → noiseGain (low rumble with hearing loss)
    //        source → hearingLossLP → noiseHP → noiseGain (high noise with hearing loss)
    source.connect(hearingLossLP);
    hearingLossLP.connect(noiseLP);
    noiseLP.connect(noiseGain);
    hearingLossLP.connect(noiseHP);
    noiseHP.connect(noiseGain);

    // === VOICE PATH: speech enhancement chain ===
    // Wider bandpass 250Hz-4000Hz
    const voiceBP = ctx.createBiquadFilter();
    voiceBP.type = 'bandpass';
    voiceBP.frequency.value = 1000;
    voiceBP.Q.value = 0.2;

    // Peaking EQ at 1kHz - vowel warmth (inactive by default)
    const voicePeak1k = ctx.createBiquadFilter();
    voicePeak1k.type = 'peaking';
    voicePeak1k.frequency.value = 1000;
    voicePeak1k.Q.value = 1.0;
    voicePeak1k.gain.value = 0;

    // Peaking EQ at 2.5kHz - consonant clarity (inactive by default)
    const voicePeak2_5k = ctx.createBiquadFilter();
    voicePeak2_5k.type = 'peaking';
    voicePeak2_5k.frequency.value = 2500;
    voicePeak2_5k.Q.value = 1.0;
    voicePeak2_5k.gain.value = 0;

    // WDRC compressor (inactive by default)
    const voiceCompressor = ctx.createDynamicsCompressor();
    voiceCompressor.threshold.value = 0;
    voiceCompressor.ratio.value = 3;
    voiceCompressor.attack.value = 0.005;
    voiceCompressor.release.value = 0.05;
    voiceCompressor.knee.value = 6;

    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 1.0;

    // Chain: source → bandpass → peak1k → peak2.5k → compressor → voiceGain
    source.connect(voiceBP);
    voiceBP.connect(voicePeak1k);
    voicePeak1k.connect(voicePeak2_5k);
    voicePeak2_5k.connect(voiceCompressor);
    voiceCompressor.connect(voiceGain);

    // === OUTPUT ===
    const masterGain = ctx.createGain();
    masterGain.gain.value = 1.5;

    noiseGain.connect(masterGain);
    voiceGain.connect(masterGain);
    masterGain.connect(ctx.destination);

    source.start();

    envAudioNodes.push({
      gain: noiseGain,
      isVoice: false,
      baseGain: 1.0,
      sources: [source],
      hearingLossLP: hearingLossLP
    });
    envAudioNodes.push({
      gain: voiceGain,
      isVoice: true,
      baseGain: 1.0,
      sources: [],
      voicePeak1k: voicePeak1k,
      voicePeak2_5k: voicePeak2_5k,
      voiceCompressor: voiceCompressor
    });

    envIsPlaying = true;
    updateEnvAudioGains();
  } catch (err) {
    console.error('Failed to load env audio:', err);
  }
}

function updateEnvAudioGains() {
  if (!envAudioCtx || !envIsPlaying) return;
  const t = envAudioCtx.currentTime;

  envAudioNodes.forEach(nodes => {
    let targetGain = nodes.baseGain;

    if (envHAEnabled) {
      // === HEARING AID ON: clear speech, suppressed noise ===
      if (nodes.isVoice) {
        targetGain = nodes.baseGain * 2.0; // Boost voice (not 2.5 to avoid distortion)

        // Activate speech enhancement EQ
        if (nodes.voicePeak1k) {
          nodes.voicePeak1k.gain.linearRampToValueAtTime(3, t + 0.3); // +3dB vowel warmth
        }
        if (nodes.voicePeak2_5k) {
          nodes.voicePeak2_5k.gain.linearRampToValueAtTime(6, t + 0.3); // +6dB consonant clarity
        }
        // Activate WDRC compressor
        if (nodes.voiceCompressor) {
          nodes.voiceCompressor.threshold.linearRampToValueAtTime(-20, t + 0.3);
        }
      } else {
        targetGain = nodes.baseGain * 0.05; // 95% noise reduction

        // Bypass hearing loss filter (open up frequency range)
        if (nodes.hearingLossLP) {
          nodes.hearingLossLP.frequency.linearRampToValueAtTime(20000, t + 0.3);
        }
      }
    } else {
      // === HEARING AID OFF: simulate hearing loss ===
      if (nodes.isVoice) {
        targetGain = nodes.baseGain; // normal voice gain

        // Deactivate speech enhancement EQ
        if (nodes.voicePeak1k) {
          nodes.voicePeak1k.gain.linearRampToValueAtTime(0, t + 0.3);
        }
        if (nodes.voicePeak2_5k) {
          nodes.voicePeak2_5k.gain.linearRampToValueAtTime(0, t + 0.3);
        }
        // Deactivate compressor
        if (nodes.voiceCompressor) {
          nodes.voiceCompressor.threshold.linearRampToValueAtTime(0, t + 0.3);
        }
      } else {
        targetGain = nodes.baseGain; // normal noise gain

        // Apply hearing loss filter (lowpass at 2000Hz)
        if (nodes.hearingLossLP) {
          nodes.hearingLossLP.frequency.linearRampToValueAtTime(2000, t + 0.3);
        }
      }
    }

    nodes.gain.gain.linearRampToValueAtTime(targetGain, t + 0.3);
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
      // Reset hearing aid toggle to OFF
      envHAEnabled = false;
      const haToggle = document.getElementById('env-ha-toggle');
      if (haToggle) {
        haToggle.classList.remove('active');
        haToggle.querySelector('.toggle-text').textContent = '보청기 OFF';
      }
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

// ======================================================
// 4. VIRTUAL FITTING (AR with Face Tracking)
// ======================================================
let fittingStream = null;
let fittingVideo = null;
let fittingCanvas = null;
let fittingCtx = null;
let fittingAnimFrame = null;
let fittingFacingMode = 'user';
let fittingColor = 'silver';
let fittingEar = 'right';
let fittingPosX = 0, fittingPosY = 0, fittingScale = 1;
let faceMesh = null;
let fittingCameraUtil = null;
let lastFaceLandmarks = null;
let faceDetected = false;
let fittingActive = false;

const FITTING_COLORS = {
  silver: { body: '#d0d5e0', hook: '#c8cdd8', ring: '#00c8ff', shadow: 'rgba(0,0,0,0.15)' },
  black: { body: '#2a2a2e', hook: '#222226', ring: '#00c8ff', shadow: 'rgba(0,0,0,0.25)' },
  beige: { body: '#d4c5a9', hook: '#c4b599', ring: '#00c8ff', shadow: 'rgba(0,0,0,0.12)' },
  rose: { body: '#e8b4b4', hook: '#d89999', ring: '#ffaacc', shadow: 'rgba(0,0,0,0.12)' }
};

// MediaPipe Face Mesh landmark indices for ear positioning
// Reference: https://github.com/google/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model_uv_visualization.png
// 234 = right tragion (right ear opening), 454 = left tragion (left ear opening)
// 10 = forehead top center, 152 = chin bottom
// 132 = right face edge (jaw near ear), 361 = left face edge (jaw near ear)
const LANDMARKS = {
  rightEar: 234,          // right tragion — the actual ear position
  leftEar: 454,           // left tragion — the actual ear position
  foreheadTop: 10,
  chinBottom: 152,
  noseTip: 1,
  rightJawEar: 132,       // right jawline near ear
  leftJawEar: 361,        // left jawline near ear
  rightFaceEdge: 177,     // right face contour upper
  leftFaceEdge: 401       // left face contour upper
};

function setupVirtualFitting() {
  fittingVideo = document.getElementById('fitting-video');
  fittingCanvas = document.getElementById('fitting-canvas');
  fittingCtx = fittingCanvas.getContext('2d');

  document.getElementById('fitting-start-btn').addEventListener('click', startFitting);
  document.getElementById('fitting-stop').addEventListener('click', stopFitting);

  document.getElementById('fitting-flip').addEventListener('click', async () => {
    fittingFacingMode = fittingFacingMode === 'user' ? 'environment' : 'user';
    if (fittingActive) {
      stopFitting();
      await startFitting();
    }
  });

  document.getElementById('fitting-capture').addEventListener('click', captureFitting);

  document.querySelectorAll('.fitting-color').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.fitting-color').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      fittingColor = btn.dataset.color;
    });
  });

  document.querySelectorAll('.fitting-ear-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.fitting-ear-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      fittingEar = btn.dataset.ear;
    });
  });

  document.getElementById('fitting-pos-x').addEventListener('input', (e) => {
    fittingPosX = parseInt(e.target.value);
  });
  document.getElementById('fitting-pos-y').addEventListener('input', (e) => {
    fittingPosY = parseInt(e.target.value);
  });
  document.getElementById('fitting-scale').addEventListener('input', (e) => {
    fittingScale = parseInt(e.target.value) / 100;
  });

  document.getElementById('fitting-download').addEventListener('click', downloadFittingImage);

  document.getElementById('fitting-retry').addEventListener('click', () => {
    document.getElementById('fitting-result').style.display = 'none';
    startFitting();
  });
}

async function initFaceMesh() {
  if (faceMesh) return;

  // Check if MediaPipe is loaded
  if (typeof window.FaceMesh === 'undefined') {
    console.warn('MediaPipe FaceMesh not loaded, falling back to manual mode');
    return;
  }

  faceMesh = new window.FaceMesh({
    locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
    }
  });

  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  faceMesh.onResults(onFaceMeshResults);
}

function onFaceMeshResults(results) {
  if (!fittingActive) return;

  const ctx = fittingCtx;
  const w = fittingCanvas.width;
  const h = fittingCanvas.height;

  ctx.clearRect(0, 0, w, h);

  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    lastFaceLandmarks = results.multiFaceLandmarks[0];
    faceDetected = true;

    const statusEl = document.getElementById('fitting-status');
    if (statusEl) statusEl.textContent = '얼굴 인식됨 — AR 피팅 활성화';

    // Hide the guide oval once face is detected
    const guideOval = document.querySelector('.fitting-guide-oval');
    if (guideOval) guideOval.style.opacity = '0.2';

    const colors = FITTING_COLORS[fittingColor];
    const time = performance.now() * 0.001;
    const landmarks = lastFaceLandmarks;

    if (fittingEar === 'right' || fittingEar === 'both') {
      drawARHearingAid(ctx, w, h, 'right', landmarks, colors, time);
    }
    if (fittingEar === 'left' || fittingEar === 'both') {
      drawARHearingAid(ctx, w, h, 'left', landmarks, colors, time);
    }
  } else {
    faceDetected = false;
    lastFaceLandmarks = null;

    const statusEl = document.getElementById('fitting-status');
    if (statusEl) statusEl.textContent = '얼굴을 카메라에 맞춰주세요...';

    const guideOval = document.querySelector('.fitting-guide-oval');
    if (guideOval) guideOval.style.opacity = '1';
  }
}

function drawARHearingAid(ctx, w, h, ear, landmarks, colors, time) {
  const isRight = ear === 'right';

  // Core landmarks
  const rightEdge = landmarks[LANDMARKS.rightEar];  // face edge near right ear
  const leftEdge = landmarks[LANDMARKS.leftEar];     // face edge near left ear
  const forehead = landmarks[LANDMARKS.foreheadTop];
  const chin = landmarks[LANDMARKS.chinBottom];
  const nose = landmarks[LANDMARKS.noseTip];

  // Face dimensions
  const faceHeight = (chin.y - forehead.y) * h;
  const faceWidth = Math.abs(rightEdge.x - leftEdge.x) * w;
  const faceCenterX = (rightEdge.x + leftEdge.x) / 2 * w;
  const baseScale = faceHeight / 280;

  // The face edge landmark (234/454) is at the TEMPLE, not the actual ear.
  // Real ear position:
  //   X: further outward from face center than the landmark
  //   Y: about 50-55% down from forehead to chin (nose/mouth level, NOT eye level)
  const edgeLandmark = isRight ? rightEdge : leftEdge;
  const edgeX = edgeLandmark.x * w;

  // Direction from face center to this edge
  const dirFromCenter = edgeX - faceCenterX;
  const dirSign = dirFromCenter > 0 ? 1 : -1;

  // Push X beyond face edge toward actual ear (12% of face width further out)
  const posX = edgeX + dirSign * faceWidth * 0.12 + fittingPosX * baseScale * 0.3;

  // Ear Y: 52% down from forehead to chin (NOT landmark Y which is at temple/eye level)
  const earY = (forehead.y + (chin.y - forehead.y) * 0.52) * h;
  const posY = earY + fittingPosY * baseScale * 0.3;

  const scale = baseScale * fittingScale;

  // Head tilt (roll) from ear-to-ear angle
  const headTilt = Math.atan2(
    (rightEdge.y - leftEdge.y) * h,
    (rightEdge.x - leftEdge.x) * w
  );

  // Head yaw: nose offset from face center (normalized)
  // Raw selfie camera: user's right = image left
  // headYaw < 0 → nose moved left in image → user turned head to THEIR right → right ear hidden
  // headYaw > 0 → nose moved right in image → user turned head to THEIR left → left ear hidden
  const headYaw = (nose.x * w - faceCenterX) / (faceWidth * 0.5);

  let visibility = 1;
  if (isRight && headYaw < -0.35) {
    // User turned right → right ear goes behind head → hide right hearing aid
    visibility = Math.max(0, 1 - (-headYaw - 0.35) * 2.5);
  } else if (!isRight && headYaw > 0.35) {
    // User turned left → left ear goes behind head → hide left hearing aid
    visibility = Math.max(0, 1 - (headYaw - 0.35) * 2.5);
  }

  if (visibility <= 0) return;

  ctx.save();
  ctx.globalAlpha = visibility;
  ctx.translate(posX, posY);
  ctx.rotate(headTilt);
  ctx.scale(scale, scale);

  // Mirror drawing for the ear on the opposite side
  // Drawing assumes right-ear orientation (hook curves left)
  // In raw selfie: right ear = left of image (dirFromCenter < 0) → no mirror needed
  //                left ear = right of image (dirFromCenter > 0) → mirror
  if (dirFromCenter > 0) {
    ctx.scale(-1, 1);
  }

  // === Draw shadow first ===
  ctx.save();
  ctx.filter = 'blur(4px)';
  ctx.beginPath();
  ctx.moveTo(2, -28);
  ctx.bezierCurveTo(14, -30, 20, -18, 20, -3);
  ctx.bezierCurveTo(20, 17, 16, 30, 10, 37);
  ctx.bezierCurveTo(6, 42, -2, 42, -6, 37);
  ctx.bezierCurveTo(-12, 30, -16, 17, -16, -3);
  ctx.bezierCurveTo(-16, -18, -10, -30, 2, -28);
  ctx.closePath();
  ctx.fillStyle = colors.shadow;
  ctx.fill();
  ctx.restore();

  // === Main body ===
  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.bezierCurveTo(12, -32, 18, -20, 18, -5);
  ctx.bezierCurveTo(18, 15, 14, 28, 8, 35);
  ctx.bezierCurveTo(4, 40, -4, 40, -8, 35);
  ctx.bezierCurveTo(-14, 28, -18, 15, -18, -5);
  ctx.bezierCurveTo(-18, -20, -12, -32, 0, -30);
  ctx.closePath();

  const bodyGrad = ctx.createLinearGradient(-18, -30, 18, 40);
  bodyGrad.addColorStop(0, lightenColor(colors.body, 10));
  bodyGrad.addColorStop(0.3, colors.body);
  bodyGrad.addColorStop(1, shadeColor(colors.body, -25));
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  ctx.strokeStyle = shadeColor(colors.body, -35);
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // === Subtle body highlight (3D effect) ===
  ctx.beginPath();
  ctx.moveTo(-2, -28);
  ctx.bezierCurveTo(6, -30, 12, -22, 12, -10);
  ctx.bezierCurveTo(12, 0, 8, 8, 4, 12);
  ctx.bezierCurveTo(0, 6, -6, -5, -6, -15);
  ctx.bezierCurveTo(-6, -22, -4, -28, -2, -28);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fill();

  // === Brand ring ===
  ctx.beginPath();
  ctx.ellipse(0, 2, 14, 2.5, 0, 0, Math.PI * 2);
  ctx.strokeStyle = colors.ring;
  ctx.lineWidth = 2;
  ctx.shadowColor = colors.ring;
  ctx.shadowBlur = 6 + Math.sin(time * 2) * 3;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // === LED ===
  const ledGlow = 0.5 + Math.sin(time * 3) * 0.5;
  ctx.beginPath();
  ctx.arc(8, -18, 2, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(0, 255, 136, ${ledGlow})`;
  ctx.shadowColor = '#00ff88';
  ctx.shadowBlur = 8 * ledGlow;
  ctx.fill();
  ctx.shadowBlur = 0;

  // === Mic grille ===
  ctx.fillStyle = shadeColor(colors.body, -45);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 2; j++) {
      ctx.beginPath();
      ctx.arc(-3 + j * 6, -24 + i * 3, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // === Volume button ===
  ctx.beginPath();
  ctx.roundRect(10, -4, 5, 10, 2);
  ctx.fillStyle = shadeColor(colors.body, -10);
  ctx.fill();
  ctx.strokeStyle = shadeColor(colors.body, -25);
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // === Ear hook (curves over the ear) ===
  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.bezierCurveTo(-5, -44, -22, -50, -32, -42);
  ctx.bezierCurveTo(-40, -36, -44, -22, -40, -8);
  ctx.strokeStyle = colors.hook;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  // Hook highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // === Sound tube ===
  ctx.beginPath();
  ctx.moveTo(-40, -8);
  ctx.bezierCurveTo(-38, 8, -34, 18, -30, 25);
  ctx.strokeStyle = colors.hook;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // === Ear tip (dome) ===
  ctx.beginPath();
  ctx.ellipse(-30, 27, 7, 9, -0.2, 0, Math.PI * 2);
  const tipGrad = ctx.createRadialGradient(-30, 27, 0, -30, 27, 9);
  tipGrad.addColorStop(0, 'rgba(210, 210, 205, 0.85)');
  tipGrad.addColorStop(0.7, 'rgba(190, 190, 185, 0.7)');
  tipGrad.addColorStop(1, 'rgba(170, 170, 165, 0.5)');
  ctx.fillStyle = tipGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,150,145,0.4)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  ctx.restore();
}

function lightenColor(color, percent) {
  return shadeColor(color, Math.abs(percent));
}

function shadeColor(color, percent) {
  const num = parseInt(color.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, Math.max(0, (num >> 16) + amt));
  const G = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amt));
  const B = Math.min(255, Math.max(0, (num & 0x0000FF) + amt));
  return `rgb(${R},${G},${B})`;
}

async function startFitting() {
  const overlay = document.getElementById('fitting-overlay');

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    overlay.innerHTML = `
      <p style="color:#ff6666;">이 브라우저에서 카메라를 사용할 수 없습니다.</p>
      <p class="hand-hint">HTTPS 환경에서 접속해주세요.</p>
    `;
    return;
  }

  // Show loading state
  overlay.innerHTML = `
    <div class="loader-ring" style="width:40px;height:40px;margin:0 auto 12px;"></div>
    <p class="hand-hint">카메라 및 얼굴 인식 모델 로딩 중...</p>
  `;

  try {
    // Initialize face mesh
    await initFaceMesh();

    // Start camera
    fittingStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: fittingFacingMode,
        width: { ideal: 640 },
        height: { ideal: 480 }
      }
    });
    fittingVideo.srcObject = fittingStream;
    await fittingVideo.play();

    fittingCanvas.width = fittingVideo.videoWidth || 640;
    fittingCanvas.height = fittingVideo.videoHeight || 480;

    fittingActive = true;

    overlay.classList.add('hidden');
    document.getElementById('fitting-guide').style.display = 'flex';
    document.getElementById('fitting-controls-overlay').style.display = 'flex';

    if (faceMesh) {
      // Use MediaPipe Camera utility for smooth frame processing
      if (typeof window.Camera !== 'undefined') {
        fittingCameraUtil = new window.Camera(fittingVideo, {
          onFrame: async () => {
            if (fittingActive && faceMesh) {
              await faceMesh.send({ image: fittingVideo });
            }
          },
          width: 640,
          height: 480
        });
        fittingCameraUtil.start();
      } else {
        // Fallback: manual frame sending
        sendFittingFrame();
      }
    } else {
      // No face mesh available — fall back to manual positioning
      drawFittingFallback();
    }
  } catch (err) {
    console.warn('Fitting error:', err);
    overlay.classList.remove('hidden');
    overlay.innerHTML = `
      <p style="color:#ff6666;">카메라 접근이 거부되었습니다.</p>
      <p class="hand-hint">브라우저 설정에서 카메라 권한을 허용해주세요.</p>
      <button class="btn-primary" id="fitting-start-btn" style="margin-top:12px;">
        <span>📷</span> 다시 시도
      </button>
    `;
    const retryBtn = document.getElementById('fitting-start-btn');
    if (retryBtn) retryBtn.addEventListener('click', startFitting);
  }
}

function sendFittingFrame() {
  if (!fittingActive || !faceMesh) return;
  faceMesh.send({ image: fittingVideo }).then(() => {
    if (fittingActive) {
      fittingAnimFrame = requestAnimationFrame(sendFittingFrame);
    }
  });
}

// Fallback when MediaPipe is not available
function drawFittingFallback() {
  if (!fittingActive) return;

  const ctx = fittingCtx;
  const w = fittingCanvas.width;
  const h = fittingCanvas.height;
  ctx.clearRect(0, 0, w, h);

  const colors = FITTING_COLORS[fittingColor];
  const time = performance.now() * 0.001;
  const isSelfie = fittingFacingMode === 'user';

  // Estimated positions without face detection
  const drawSide = (ear) => {
    const isRight = ear === 'right';
    const screenSide = isSelfie ? !isRight : isRight;
    const baseX = screenSide ? w * 0.78 : w * 0.22;
    const baseY = h * 0.38;
    const posX = baseX + fittingPosX * (w / 500);
    const posY = baseY + fittingPosY * (h / 500);
    const scale = fittingScale * (h / 500);

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.translate(posX, posY);
    ctx.scale(scale, scale);
    if (!screenSide) ctx.scale(-1, 1);

    // Reuse the same drawing code (simplified call)
    drawHearingAidShape(ctx, colors, time);

    ctx.restore();
  };

  if (fittingEar === 'right' || fittingEar === 'both') drawSide('right');
  if (fittingEar === 'left' || fittingEar === 'both') drawSide('left');

  // Show hint that face detection is unavailable
  ctx.fillStyle = 'rgba(255,200,0,0.7)';
  ctx.font = `${w < 400 ? 10 : 13}px "Noto Sans KR", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('얼굴 인식 로딩 중... 수동 조절 모드', w / 2, h - 16);

  fittingAnimFrame = requestAnimationFrame(drawFittingFallback);
}

function drawHearingAidShape(ctx, colors, time) {
  // Body
  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.bezierCurveTo(12, -32, 18, -20, 18, -5);
  ctx.bezierCurveTo(18, 15, 14, 28, 8, 35);
  ctx.bezierCurveTo(4, 40, -4, 40, -8, 35);
  ctx.bezierCurveTo(-14, 28, -18, 15, -18, -5);
  ctx.bezierCurveTo(-18, -20, -12, -32, 0, -30);
  ctx.closePath();
  const bodyGrad = ctx.createLinearGradient(-18, -30, 18, 40);
  bodyGrad.addColorStop(0, lightenColor(colors.body, 10));
  bodyGrad.addColorStop(0.3, colors.body);
  bodyGrad.addColorStop(1, shadeColor(colors.body, -25));
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.strokeStyle = shadeColor(colors.body, -35);
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Brand ring
  ctx.beginPath();
  ctx.ellipse(0, 2, 14, 2.5, 0, 0, Math.PI * 2);
  ctx.strokeStyle = colors.ring;
  ctx.lineWidth = 2;
  ctx.shadowColor = colors.ring;
  ctx.shadowBlur = 6 + Math.sin(time * 2) * 3;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // LED
  const ledGlow = 0.5 + Math.sin(time * 3) * 0.5;
  ctx.beginPath();
  ctx.arc(8, -18, 2, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(0, 255, 136, ${ledGlow})`;
  ctx.shadowColor = '#00ff88';
  ctx.shadowBlur = 8 * ledGlow;
  ctx.fill();
  ctx.shadowBlur = 0;

  // Ear hook
  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.bezierCurveTo(-5, -44, -22, -50, -32, -42);
  ctx.bezierCurveTo(-40, -36, -44, -22, -40, -8);
  ctx.strokeStyle = colors.hook;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Sound tube
  ctx.beginPath();
  ctx.moveTo(-40, -8);
  ctx.bezierCurveTo(-38, 8, -34, 18, -30, 25);
  ctx.strokeStyle = colors.hook;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Ear tip
  ctx.beginPath();
  ctx.ellipse(-30, 27, 7, 9, -0.2, 0, Math.PI * 2);
  const tipGrad = ctx.createRadialGradient(-30, 27, 0, -30, 27, 9);
  tipGrad.addColorStop(0, 'rgba(210, 210, 205, 0.85)');
  tipGrad.addColorStop(1, 'rgba(170, 170, 165, 0.5)');
  ctx.fillStyle = tipGrad;
  ctx.fill();
}

function stopFitting() {
  fittingActive = false;

  if (fittingAnimFrame) {
    cancelAnimationFrame(fittingAnimFrame);
    fittingAnimFrame = null;
  }

  if (fittingCameraUtil) {
    fittingCameraUtil.stop();
    fittingCameraUtil = null;
  }

  if (fittingStream) {
    fittingStream.getTracks().forEach(t => t.stop());
    fittingStream = null;
  }

  if (fittingVideo) fittingVideo.srcObject = null;

  lastFaceLandmarks = null;
  faceDetected = false;

  const overlay = document.getElementById('fitting-overlay');
  overlay.classList.remove('hidden');
  overlay.innerHTML = `
    <button class="btn-primary" id="fitting-start-btn">
      <span>📷</span> AR 피팅 시작
    </button>
    <p class="hand-hint">얼굴을 인식하여 보청기 착용 모습을<br/>실시간으로 확인할 수 있습니다</p>
  `;
  document.getElementById('fitting-start-btn').addEventListener('click', startFitting);

  document.getElementById('fitting-guide').style.display = 'none';
  document.getElementById('fitting-controls-overlay').style.display = 'none';

  // Reset guide oval opacity
  const guideOval = document.querySelector('.fitting-guide-oval');
  if (guideOval) guideOval.style.opacity = '1';
}

function captureFitting() {
  const captureCanvas = document.createElement('canvas');
  captureCanvas.width = fittingCanvas.width;
  captureCanvas.height = fittingCanvas.height;
  const captureCtx = captureCanvas.getContext('2d');

  // Draw video frame
  captureCtx.drawImage(fittingVideo, 0, 0, captureCanvas.width, captureCanvas.height);

  // Draw overlay
  captureCtx.drawImage(fittingCanvas, 0, 0);

  // Add watermark
  captureCtx.fillStyle = 'rgba(255,255,255,0.5)';
  captureCtx.font = '12px "Noto Sans KR", sans-serif';
  captureCtx.textAlign = 'right';
  captureCtx.fillText('SoundClear Virtual Fitting', captureCanvas.width - 10, captureCanvas.height - 10);

  const resultDiv = document.getElementById('fitting-result');
  const resultImg = document.getElementById('fitting-result-img');
  resultImg.src = captureCanvas.toDataURL('image/png');
  resultDiv.style.display = 'block';

  stopFitting();
}

function downloadFittingImage() {
  const img = document.getElementById('fitting-result-img');
  const link = document.createElement('a');
  link.download = 'soundclear-fitting.png';
  link.href = img.src;
  link.click();
}

// ===== START =====
document.addEventListener('DOMContentLoaded', init);
