// AyurvedaCanvas.jsx — Master Story Engine for "Ayurveda: The Science of Life"
// Complete First-Person Laptop 3D & WebXR Immersive Experience with Progressive Discovery
// Research Fidelity: Preserves 7 Stations, 5 Elements (Pancha Mahabhutas), 3 Doshas (Tridosha)
// Fixed: Zero Snapping-Back, Zero Background Hissing Noise, Vibrant Alpine Himalayan Colors,
// Direct Mouse Click & E-Key & VR Controller Trigger Interactions, Non-overlapping Controls Hint

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { eventLogger } from '../../services/EventLogger';
import { formatTime } from '../../services/StoryLoader';
import './PlayerCommon.css';

const PLAYBACK_END_SEC = 110.2;
const GAZE_DWELL_MS = 1400;
const HEAD_ROTATION_SAMPLE_MS = 200;
const INTERACTION_DIST = 4.8;

// ── Research Story Stations ──────────────────────────────────────────────────
const STATIONS = [
  { id: 'st1', label: 'River Bank & Banyan at Dawn',  color: '#f4a261', t: [0, 26]     },
  { id: 'st2', label: 'The Five Elements Ring',        color: '#e9c46a', t: [27, 34]    },
  { id: 'st3', label: 'Herb Garden & Mortar',          color: '#2a9d8f', t: [35, 52]    },
  { id: 'st4', label: 'Three Doshas Sanctuary',        color: '#e76f51', t: [53, 62]    },
  { id: 'st5', label: 'Sunrise River Meditation',      color: '#264653', t: [63, 70]    },
  { id: 'st6', label: 'Therapy & Balance Room',        color: '#6a4c93', t: [71, 80]    },
  { id: 'st7', label: 'Vedic Knowledge Lineage',       color: '#d4a017', t: [81, 110.2] },
];

// ── 5 Pancha Mahabhutas (Five Great Elements) ────────────────────────────────
const ELEMENTS = [
  { id: 'earth', label: 'Prithvi (Earth)', color: 0x8b5a2b, emissive: 0x4a2a00, pos: [-3.2, 1.25, -6.5],
    desc: 'Solid matter and structure. Governs bones, muscles, tissues, and physical stability in living beings.' },
  { id: 'water', label: 'Jala (Water)',    color: 0x0284c7, emissive: 0x002277, pos: [-1.6, 1.5, -7.0],
    desc: 'Fluid cohesion and nourishment. Governs cytoplasm, blood plasma, taste, and hydration throughout the physiology.' },
  { id: 'fire',  label: 'Agni (Fire)',     color: 0xef4444, emissive: 0x881100, pos: [0,    1.8, -7.4],
    desc: 'Transformation and radiance. Governs cellular metabolism, digestive fire (Jatharagni), vision, and body temperature.' },
  { id: 'air',   label: 'Vayu (Air)',      color: 0x818cf8, emissive: 0x221188, pos: [1.6,  1.5, -7.0],
    desc: 'Dynamic movement and pulsation. Governs respiration, heartbeat, motor functions, and nervous impulse transmission.' },
  { id: 'ether', label: 'Akasha (Ether)',  color: 0xfacc15, emissive: 0x775500, pos: [3.2,  1.25, -6.5],
    desc: 'Space, vibration, and non-resistance. The subtle medium through which sound travels and consciousness operates.' },
];

// ── 3 Sacred Doshas (Tridoshas) ──────────────────────────────────────────────
const DOSHAS = [
  { id: 'vata',  label: 'Vata Dosha',  elements: 'Air + Ether', color: 0x38bdf8, emissive: 0x0284c7, pos: [-4.2, 1.9, -9.2],
    desc: 'The principle of movement, governed by Air and Space. Controls breath, muscle movement, and nerve impulses. In balance: creativity and vitality; out of balance: anxiety and dryness.' },
  { id: 'pitta', label: 'Pitta Dosha', elements: 'Fire + Water', color: 0xf97316, emissive: 0xc2410c, pos: [0,    2.3, -10.4],
    desc: 'The principle of transformation, governed by Fire and Water. Controls digestion, metabolism, hunger, and intellect. In balance: sharp intelligence and warmth; out of balance: inflammation and anger.' },
  { id: 'kapha', label: 'Kapha Dosha', elements: 'Water + Earth', color: 0x10b981, emissive: 0x047857, pos: [4.2,  1.9, -9.2],
    desc: 'The principle of cohesion and structure, governed by Earth and Water. Provides bodily strength, immunity, and lubrication. In balance: calm strength and endurance; out of balance: heaviness and lethargy.' },
];

const C3_INTERACTIONS_BASE = [
  {
    id: 'c3_int_1', label: 'Tap the Sacred River',
    active_window: ['0:18', '0:26'], gate: { type: 'hold_at', hold_at: '0:23', max_wait_sec: 7 },
    type: 'tap', prompt: '🌊 Tap the sacred river to begin your Ayurvedic journey', emoji: '🌊', color: '#38bdf8',
  },
  {
    id: 'c3_int_2', label: 'Identify the Element of Transformation',
    active_window: ['0:27', '0:34'], gate: { type: 'hold_at', hold_at: '0:30', max_wait_sec: 7 },
    type: 'select', prompt: '✨ Which element represents transformation and digestion in Ayurveda?',
    options: ['Prithvi (Earth)', 'Jala (Water)', 'Agni (Fire)', 'Vayu (Air)'], correct: 2,
    color: '#ef4444', emoji: '🔥',
  },
  {
    id: 'c3_int_3', label: 'Grind the Herbs',
    active_window: ['0:40', '0:52'], gate: { type: 'hold_at', hold_at: '0:44', max_wait_sec: 7 },
    type: 'hold', prompt: '🌿 Hold to grind the medicinal herbs in the mortar', duration: 2500,
    color: '#10b981', emoji: '🌿',
  },
  {
    id: 'c3_int_4', label: 'Identify Your Dosha',
    active_window: ['0:53', '1:02'], gate: { type: 'hold_at', hold_at: '0:57', max_wait_sec: 7 },
    type: 'select', prompt: '🧬 Which Dosha is associated with the elements Fire and Water?',
    options: ['Vata (Air + Ether)', 'Pitta (Fire + Water)', 'Kapha (Earth + Water)', 'Sama (Balanced)'], correct: 1,
    color: '#f97316', emoji: '🧬',
  },
  {
    id: 'c3_int_5', label: 'Morning Meditation',
    active_window: ['1:03', '1:10'], gate: { type: 'hold_at', hold_at: '1:06', max_wait_sec: 7 },
    type: 'hold', prompt: '🧘 Hold to complete your sunrise meditation ritual', duration: 2000,
    color: '#264653', emoji: '🧘',
  },
  {
    id: 'c3_int_6', label: 'Concept of Balance',
    active_window: ['1:15', '1:20'], gate: { type: 'hold_at', hold_at: '1:16', max_wait_sec: 7 },
    type: 'select', prompt: '⚖️ In Ayurveda, what is the Sanskrit term for the concept of bodily balance?',
    options: ['Prakriti', 'Samadosha', 'Vikriti', 'Sattva'], correct: 1,
    color: '#6a4c93', emoji: '⚖️',
  },
];

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const easeInOut = x => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;

// ── Build 3D Himalayan World ─────────────────────────────────────────────────
function buildAyurvedaWorld(scene, refs) {
  // Radiant Azure Himalayan Sky
  scene.background = new THREE.Color(0x7ec8e3);

  // Soft atmospheric mountain mist
  const fog = new THREE.FogExp2(0xbbe4f7, 0.007);
  scene.fog = fog;
  refs.fog = fog;

  // Crisp Daylight Hemisphere Lighting
  const hemi = new THREE.HemisphereLight(0xffffff, 0x4a7c36, 1.25);
  scene.add(hemi);
  refs.hemi = hemi;

  // Bright Golden Himalayan Sun
  const sun = new THREE.DirectionalLight(0xfff7e6, 2.7);
  sun.position.set(22, 34, -20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -45;
  sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45;
  sun.shadow.camera.bottom = -45;
  scene.add(sun);
  refs.sun = sun;

  // Vibrant Lush Himalayan Meadow
  const groundGeom = new THREE.PlaneGeometry(260, 260, 50, 50);
  const gverts = groundGeom.attributes.position;
  for (let i = 0; i < gverts.count; i++) {
    const x = gverts.getX(i), z = gverts.getZ(i);
    const dist = Math.sqrt(x * x + z * z);
    gverts.setY(i, Math.sin(x * 0.07) * 0.45 + Math.sin(z * 0.05) * 0.35 + (dist > 18 ? (dist - 18) * 0.04 : 0));
  }
  gverts.needsUpdate = true;
  groundGeom.computeVertexNormals();
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x4d7c0f }); // Rich alpine grass
  const ground = new THREE.Mesh(groundGeom, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Sacred Flagstone Path to Altars
  const pathMat = new THREE.MeshLambertMaterial({ color: 0xdfd4bc });
  for (let p = 0; p < 18; p++) {
    const stone = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 1.2), pathMat);
    stone.position.set(Math.sin(p * 0.3) * 0.8, 0.04, 3.5 - p * 0.9);
    stone.receiveShadow = true;
    scene.add(stone);
  }

  // Sacred River (Turquoise Shimmering Waters)
  const riverGeom = new THREE.PlaneGeometry(24, 260, 24, 2);
  const riverMat = new THREE.MeshPhongMaterial({
    color: 0x0284c7, emissive: 0x0369a1, transparent: true, opacity: 0.88, shininess: 160
  });
  const river = new THREE.Mesh(riverGeom, riverMat);
  river.rotation.x = -Math.PI / 2;
  river.position.set(-16, 0.09, 0);
  scene.add(river);
  refs.river = river;

  // River Stone Ghat Banks
  for (const side of [-1, 1]) {
    const bank = new THREE.Mesh(
      new THREE.BoxGeometry(4.5, 0.22, 260),
      new THREE.MeshLambertMaterial({ color: 0xf5e6cb })
    );
    bank.position.set(-16 + side * 13, 0.05, 0);
    scene.add(bank);
  }

  // Stone Ghat Steps Leading to River
  for (let s = 0; s < 6; s++) {
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(9.5, 0.24, 1.3),
      new THREE.MeshLambertMaterial({ color: 0xe2d4b7 })
    );
    step.position.set(-7, s * 0.22, -3 + s * 1.2);
    step.receiveShadow = true;
    scene.add(step);
  }

  // Giant Sacred Banyan Tree
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(1.8, 2.6, 10.5, 20),
    new THREE.MeshLambertMaterial({ color: 0x5c3a21 })
  );
  trunk.position.set(4, 5.2, -12);
  trunk.castShadow = true;
  scene.add(trunk);

  // Vibrant Emerald Banyan Canopy
  [[4, 11, -12, 7.8], [-1, 9, -15, 5.8], [8, 9, -9, 5.8], [4, 14.5, -12, 5.2]].forEach(([x, y, z, r]) => {
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(r, 14, 10),
      new THREE.MeshLambertMaterial({ color: 0x15803d })
    );
    canopy.position.set(x, y, z);
    canopy.castShadow = true;
    scene.add(canopy);
  });

  // Hanging aerial roots
  for (let i = 0; i < 10; i++) {
    const root = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.1, 4.2 + Math.random() * 3, 6),
      new THREE.MeshLambertMaterial({ color: 0x6e472a })
    );
    root.position.set(4 + (Math.random() - 0.5) * 9, 3.5 + Math.random() * 2, -12 + (Math.random() - 0.5) * 9);
    scene.add(root);
  }

  // Sacred Fire Altar (Havan Kund)
  const fireBase = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.38, 1.0),
    new THREE.MeshLambertMaterial({ color: 0x78350f })
  );
  fireBase.position.set(-1.2, 0.19, -3.2);
  scene.add(fireBase);

  const fireLight = new THREE.PointLight(0xf97316, 3.2, 9);
  fireLight.position.set(-1.2, 0.95, -3.2);
  scene.add(fireLight);
  refs.fireLight = fireLight;

  // Fire particles
  const FIRE_COUNT = 90;
  const fPos = new Float32Array(FIRE_COUNT * 3);
  const fPhase = new Float32Array(FIRE_COUNT);
  for (let i = 0; i < FIRE_COUNT; i++) {
    fPos[i * 3] = -1.2 + (Math.random() - 0.5) * 0.4;
    fPos[i * 3 + 1] = 0.35 + Math.random() * 1.1;
    fPos[i * 3 + 2] = -3.2 + (Math.random() - 0.5) * 0.4;
    fPhase[i] = Math.random() * Math.PI * 2;
  }
  const fGeom = new THREE.BufferGeometry();
  fGeom.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
  const firePts = new THREE.Points(fGeom, new THREE.PointsMaterial({
    size: 0.12, color: 0xff6600, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  scene.add(firePts);
  refs.fire = firePts; refs.fPos = fPos; refs.fPhase = fPhase; refs.fGeom = fGeom;

  // ── Sacred Ayurvedic Dhonga (Mortar) Preparation Station ───────────────────
  const table = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 0.75, 1.2),
    new THREE.MeshLambertMaterial({ color: 0x78350f })
  );
  table.position.set(2.8, 0.38, -2.0);
  table.castShadow = true;
  table.receiveShadow = true;
  scene.add(table);
  refs.table = table;

  // Authentic Stone Dhonga Group (Mortar Bowl)
  const dhongaMortar = new THREE.Group();
  dhongaMortar.position.set(2.8, 0.75, -2.0);

  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.85,
    metalness: 0.15
  });

  // Outer tapered stone bowl body
  const outerBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.30, 0.38, 24), stoneMat);
  outerBowl.position.y = 0.19;
  outerBowl.castShadow = true;
  outerBowl.receiveShadow = true;
  dhongaMortar.add(outerBowl);

  // Deep inner cavity
  const cavityMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.95 });
  const innerCavity = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.18, 0.28, 24), cavityMat);
  innerCavity.position.y = 0.26;
  dhongaMortar.add(innerCavity);

  // Sacred bronze/gold decorative rim band
  const brassBandMat = new THREE.MeshStandardMaterial({
    color: 0xd4a017,
    roughness: 0.35,
    metalness: 0.8
  });
  const rimBand = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.018, 12, 32), brassBandMat);
  rimBand.rotation.x = Math.PI / 2;
  rimBand.position.y = 0.375;
  dhongaMortar.add(rimBand);

  // Twin Traditional Brass Hoop Handles on Patila (Side Patila Handles)
  [-1, 1].forEach(side => {
    const handleGroup = new THREE.Group();
    handleGroup.position.set(side * 0.40, 0.28, 0);
    const hoop = new THREE.Mesh(
      new THREE.TorusGeometry(0.075, 0.016, 12, 24, Math.PI),
      brassBandMat
    );
    hoop.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    hoop.rotation.z = Math.PI / 2;
    handleGroup.add(hoop);
    [-0.055, 0.055].forEach(offsetZ => {
      const rivet = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.04, 8), brassBandMat);
      rivet.rotation.x = Math.PI / 2;
      rivet.position.set(0, 0, offsetZ);
      handleGroup.add(rivet);
    });
    dhongaMortar.add(handleGroup);
  });

  // Botanical Herbal Bed inside bowl (transitions from coarse to ground)
  const herbBedMat = new THREE.MeshStandardMaterial({
    color: 0x166534,
    roughness: 0.85
  });
  const herbBed = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.18, 0.06, 20), herbBedMat);
  herbBed.position.y = 0.22;
  dhongaMortar.add(herbBed);
  refs.herbBed = herbBed;
  refs.herbBedMat = herbBedMat;

  // Individual coarse herb leaf flakes scattered inside bowl
  const leafGroup = new THREE.Group();
  for (let i = 0; i < 18; i++) {
    const leafGeom = new THREE.PlaneGeometry(0.045, 0.07);
    const leafMat = new THREE.MeshLambertMaterial({
      color: i % 2 === 0 ? 0x22c55e : 0x15803d,
      side: THREE.DoubleSide
    });
    const leaf = new THREE.Mesh(leafGeom, leafMat);
    const rad = Math.random() * 0.18;
    const ang = Math.random() * Math.PI * 2;
    leaf.position.set(Math.cos(ang) * rad, 0.25 + Math.random() * 0.02, Math.sin(ang) * rad);
    leaf.rotation.set(Math.random() * 0.4, Math.random() * Math.PI, Math.random() * 0.4);
    leafGroup.add(leaf);
  }
  dhongaMortar.add(leafGroup);
  refs.leafFlakes = leafGroup;

  // Contextual Grinding Zone Feedback Ring (pulses green/gold when implement is in valid zone)
  const zoneRing = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.35, 32),
    new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.0, side: THREE.DoubleSide })
  );
  zoneRing.rotation.x = -Math.PI / 2;
  zoneRing.position.y = 0.39;
  dhongaMortar.add(zoneRing);
  refs.grindZoneRing = zoneRing;

  // Rising herbal aroma essence particles from Patila
  const aromaGeom = new THREE.BufferGeometry();
  const aromaCount = 20;
  const aromaPos = new Float32Array(aromaCount * 3);
  const aromaPhase = new Float32Array(aromaCount);
  for (let i = 0; i < aromaCount; i++) {
    aromaPos[i * 3] = (Math.random() - 0.5) * 0.22;
    aromaPos[i * 3 + 1] = 0.24 + Math.random() * 0.35;
    aromaPos[i * 3 + 2] = (Math.random() - 0.5) * 0.22;
    aromaPhase[i] = Math.random() * Math.PI * 2;
  }
  aromaGeom.setAttribute('position', new THREE.BufferAttribute(aromaPos, 3));
  const aromaMat = new THREE.PointsMaterial({
    size: 0.05,
    color: 0x86efac,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const aromaPts = new THREE.Points(aromaGeom, aromaMat);
  dhongaMortar.add(aromaPts);
  refs.aromaPts = aromaPts;
  refs.aromaPos = aromaPos;
  refs.aromaPhase = aromaPhase;
  refs.aromaGeom = aromaGeom;
  refs.aromaMat = aromaMat;

  dhongaMortar.userData = {
    type: 'dhonga_mortar',
    id: 'dhonga_mortar',
    label: 'Sacred Ayurvedic Patila (Dhonga)'
  };
  scene.add(dhongaMortar);
  refs.dhongaMortar = dhongaMortar;
  refs.mortar = dhongaMortar;

  // ── Grinding Implement (Pestle / Musal) ────────────────────────────────────
  const pestleGroup = new THREE.Group();
  // Resting position beside the mortar on the table
  pestleGroup.position.set(2.95, 0.88, -1.82);
  pestleGroup.rotation.set(0.15, 0.1, 0.45);

  // Upper Handle Grip
  const handleMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.42, 16), stoneMat);
  handleMesh.position.y = 0.28;
  handleMesh.castShadow = true;
  pestleGroup.add(handleMesh);

  // Grip brass accent
  const gripAccent = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.012, 8, 20), brassBandMat);
  gripAccent.rotation.x = Math.PI / 2;
  gripAccent.position.y = 0.20;
  pestleGroup.add(gripAccent);

  // Heavy Rounded Grinding Base
  const baseMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.085, 0.28, 16), stoneMat);
  baseMesh.position.y = 0.06;
  baseMesh.castShadow = true;
  pestleGroup.add(baseMesh);

  const roundedHead = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    stoneMat
  );
  roundedHead.rotation.x = Math.PI;
  roundedHead.position.y = -0.08;
  roundedHead.castShadow = true;
  pestleGroup.add(roundedHead);

  // Selection highlight indicator (subtle glow on focus)
  const pestleHighlight = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.12, 0.65, 12),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.0, wireframe: true })
  );
  pestleHighlight.position.y = 0.15;
  pestleGroup.add(pestleHighlight);
  refs.pestleHighlight = pestleHighlight;

  pestleGroup.userData = {
    type: 'dhonga_pestle',
    id: 'dhonga_pestle',
    label: 'Ayurvedic Grinding Pestle'
  };
  scene.add(pestleGroup);
  refs.pestle = pestleGroup;

  // Herb Jars
  refs.herbJars = [];
  [[-0.6, 0xfacc15], [0, 0x22c55e], [0.6, 0xf97316]].forEach(([dx, col]) => {
    const jar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.1, 0.28, 12),
      new THREE.MeshPhongMaterial({ color: col, transparent: true, opacity: 0.9, shininess: 100 })
    );
    jar.position.set(2.8 + dx, 0.92, -2.0);
    scene.add(jar);
    refs.herbJars.push(jar);
  });

  // ── Plinths & Interactive Altars: 5 ELEMENTS ───────────────────────────────
  refs.elementPlinths = [];
  refs.elementOrbs = [];
  ELEMENTS.forEach((el, idx) => {
    // Marble Pedestal
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.6, 0.95, 8),
      new THREE.MeshLambertMaterial({ color: 0xe2e8f0 })
    );
    plinth.position.set(el.pos[0], 0.48, el.pos[2]);
    plinth.receiveShadow = true;
    plinth.userData = { type: 'element', ...el };
    scene.add(plinth);

    // Glowing Rune Ring on top of plinth
    const runeRing = new THREE.Mesh(
      new THREE.RingGeometry(0.38, 0.48, 24),
      new THREE.MeshBasicMaterial({ color: el.color, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    );
    runeRing.rotation.x = -Math.PI / 2;
    runeRing.position.set(el.pos[0], 0.96, el.pos[2]);
    scene.add(runeRing);
    refs[`plinth_rune_${el.id}`] = runeRing;

    // Elemental Orb (Visible as mystical dormant relic, radiant when discovered)
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 24, 18),
      new THREE.MeshPhongMaterial({
        color: el.color, emissive: el.emissive, emissiveIntensity: 0.7, shininess: 130, transparent: true, opacity: 0.85
      })
    );
    orb.position.set(...el.pos);
    orb.scale.set(0.75, 0.75, 0.75);
    orb.visible = true;
    orb.userData = { type: 'element', ...el };
    scene.add(orb);
    refs.elementOrbs.push(orb);

    // Energy halo ring
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.44, 0.56, 32),
      new THREE.MeshBasicMaterial({ color: el.color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
    );
    halo.position.set(...el.pos);
    halo.lookAt(0, el.pos[1], 5);
    halo.visible = false;
    scene.add(halo);
    refs[`halo_el_${idx}`] = halo;
  });

  // ── Plinths & Interactive Altars: 3 DOSHAS ─────────────────────────────────
  refs.doshaPlinths = [];
  refs.doshaObjects = [];
  DOSHAS.forEach((d, idx) => {
    // Grand Sanctuary Altar
    const dPlinth = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.95, 1.3),
      new THREE.MeshLambertMaterial({ color: 0x334155 })
    );
    dPlinth.position.set(d.pos[0], 0.48, d.pos[2]);
    dPlinth.receiveShadow = true;
    dPlinth.userData = { type: 'dosha', ...d };
    scene.add(dPlinth);

    // Altar Rune Emblem
    const dRune = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.62, 6),
      new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
    );
    dRune.rotation.x = -Math.PI / 2;
    dRune.position.set(d.pos[0], 0.96, d.pos[2]);
    scene.add(dRune);
    refs[`plinth_rune_${d.id}`] = dRune;

    // Sacred Crystal Pillar
    const crystMat = new THREE.MeshPhongMaterial({
      color: d.color, emissive: d.emissive, emissiveIntensity: 0.85, transparent: true, opacity: 0.88, shininess: 240
    });
    const crystGroup = new THREE.Group();
    crystGroup.position.set(...d.pos);
    crystGroup.scale.set(0.75, 0.75, 0.75);
    crystGroup.visible = true;

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 1.5, 6), crystMat);
    crystGroup.add(body);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.5, 6), crystMat);
    cap.position.y = 1.0;
    crystGroup.add(cap);

    crystGroup.userData = { type: 'dosha', ...d };
    body.userData = { type: 'dosha', ...d };
    cap.userData = { type: 'dosha', ...d };
    scene.add(crystGroup);
    refs.doshaObjects.push(crystGroup);
  });

  // Majestic Snow-Capped Himalayan Mountain Ranges
  [[-90, 0x64748b, 0xffffff], [-115, 0x475569, 0xf1f5f9], [-140, 0x334155, 0xe2e8f0]].forEach(([mz, baseCol, snowCol], mi) => {
    for (let p = 0; p < 7; p++) {
      const mh = 26 + Math.random() * 28;
      const mountain = new THREE.Mesh(new THREE.ConeGeometry((24 + Math.random() * 16) * 0.5, mh, 6), new THREE.MeshLambertMaterial({ color: baseCol }));
      mountain.position.set(-55 + p * 18, mh * 0.5 - 3, mz - mi * 16);
      scene.add(mountain);

      // Snow Cap
      const snow = new THREE.Mesh(new THREE.ConeGeometry((24 + Math.random() * 16) * 0.22, mh * 0.35, 6), new THREE.MeshBasicMaterial({ color: snowCol }));
      snow.position.set(mountain.position.x, mh - mh * 0.18 - 3, mountain.position.z);
      scene.add(snow);
    }
  });

  // Floating Golden Pollen Particles
  const PC = 380;
  const pPos = new Float32Array(PC * 3), pPhase = new Float32Array(PC), pCol = new Float32Array(PC * 3);
  for (let i = 0; i < PC; i++) {
    pPos[i * 3] = (Math.random() - 0.5) * 50;
    pPos[i * 3 + 1] = Math.random() * 9 + 0.4;
    pPos[i * 3 + 2] = (Math.random() - 0.5) * 50;
    pPhase[i] = Math.random() * Math.PI * 2;
    pCol[i * 3] = 1.0; pCol[i * 3 + 1] = 0.88; pCol[i * 3 + 2] = 0.3;
  }
  const pGeom = new THREE.BufferGeometry();
  pGeom.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeom.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pPts = new THREE.Points(pGeom, new THREE.PointsMaterial({
    size: 0.12, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
  }));
  scene.add(pPts);
  refs.particles = pPts; refs.pPos = pPos; refs.pPhase = pPhase; refs.pGeom = pGeom;
}

// ── World Update & Animation Lifecycle ───────────────────────────────────────
function updateAyurvedaWorld(t, delta, refs, discoveryStates, dhongaState) {
  const now = performance.now() * 0.001;

  if (refs.river) refs.river.position.y = 0.09 + Math.sin(now * 1.4) * 0.015;

  // Fire flicker
  if (refs.fireLight) refs.fireLight.intensity = 2.8 + Math.sin(now * 8.3) * 0.6 + Math.sin(now * 13.7) * 0.3;
  if (refs.fPos && refs.fGeom) {
    const n = refs.fPos.length / 3;
    for (let i = 0; i < n; i++) {
      refs.fPos[i * 3 + 1] += delta * (0.45 + Math.sin(refs.fPhase[i] + now * 3) * 0.3);
      refs.fPos[i * 3] += Math.sin(now * 2.1 + refs.fPhase[i]) * delta * 0.08;
      if (refs.fPos[i * 3 + 1] > 1.9) {
        refs.fPos[i * 3] = -1.2 + (Math.random() - 0.5) * 0.38;
        refs.fPos[i * 3 + 1] = 0.35;
        refs.fPos[i * 3 + 2] = -3.2 + (Math.random() - 0.5) * 0.38;
      }
    }
    refs.fGeom.attributes.position.needsUpdate = true;
  }

  // Floating Pollen drift
  if (refs.pPos && refs.pGeom) {
    const n = refs.pPos.length / 3;
    for (let i = 0; i < n; i++) {
      refs.pPos[i * 3] += Math.sin(now * 0.5 + refs.pPhase[i]) * delta * 0.15;
      refs.pPos[i * 3 + 1] += Math.sin(now * 0.3 + refs.pPhase[i] * 1.3) * delta * 0.1;
      refs.pPos[i * 3 + 2] += Math.cos(now * 0.4 + refs.pPhase[i] * 0.7) * delta * 0.12;
      if (refs.pPos[i * 3 + 1] > 10) refs.pPos[i * 3 + 1] = 0.4;
      if (refs.pPos[i * 3 + 1] < 0.2) refs.pPos[i * 3 + 1] = 0.4;
    }
    refs.pGeom.attributes.position.needsUpdate = true;
  }

  // Rest-only pestle idle oscillation (never overwrites active player manipulation)
  if (refs.pestle && (!dhongaState || dhongaState.status === 'RESTING')) {
    refs.pestle.rotation.z = 0.35 + Math.sin(now * 2.2) * 0.12;
  }
  if (refs.herbJars) refs.herbJars.forEach((j, i) => { j.rotation.y = Math.sin(now * 0.5 + i) * 0.1; });

  // Update rising herbal aroma from Patila (awakens in Station 3 or when grinding)
  if (refs.aromaPos && refs.aromaGeom && refs.aromaMat) {
    const isStation3OrLater = t >= 32 || (dhongaState && dhongaState.progress > 0);
    const targetOpacity = isStation3OrLater ? (0.35 + (dhongaState?.progress || 0) * 0.45) : 0.0;
    refs.aromaMat.opacity = THREE.MathUtils.lerp(refs.aromaMat.opacity, targetOpacity, 0.05);
    if (refs.aromaMat.opacity > 0.02) {
      const n = refs.aromaPos.length / 3;
      for (let i = 0; i < n; i++) {
        refs.aromaPos[i * 3 + 1] += delta * 0.18;
        refs.aromaPos[i * 3] += Math.sin(now * 1.5 + refs.aromaPhase[i]) * delta * 0.04;
        refs.aromaPos[i * 3 + 2] += Math.cos(now * 1.5 + refs.aromaPhase[i]) * delta * 0.04;
        if (refs.aromaPos[i * 3 + 1] > 0.85) {
          refs.aromaPos[i * 3] = (Math.random() - 0.5) * 0.22;
          refs.aromaPos[i * 3 + 1] = 0.24;
          refs.aromaPos[i * 3 + 2] = (Math.random() - 0.5) * 0.22;
        }
      }
      refs.aromaGeom.attributes.position.needsUpdate = true;
    }
  }

  // ── Elements Altar Breathing & Animation (Strict Progressive Bloom) ───────
  if (refs.elementOrbs) {
    const elementsAwakened = t >= 27;
    refs.elementOrbs.forEach((o, i) => {
      const el = ELEMENTS[i];
      const state = (discoveryStates && discoveryStates[el.id]) || 'HIDDEN';
      const rune = refs[`plinth_rune_${el.id}`];
      const halo = refs[`halo_el_${i}`];

      o.position.y = el.pos[1] + Math.sin(now * 0.9 + i * 1.26) * 0.14;
      o.rotation.y += delta * 0.85;

      if (state === 'DISCOVERED' || state === 'UNDERSTOOD') {
        o.scale.lerp(new THREE.Vector3(1.0, 1.0, 1.0), 0.1);
        o.material.opacity = 0.95;
        o.material.emissiveIntensity = 0.9 + Math.sin(now * 2.0 + i) * 0.25;
        if (rune) rune.material.opacity = 0.95;
        if (halo) { halo.visible = true; halo.rotation.z += delta * 0.4; }
      } else if (elementsAwakened) {
        // Station 2 awakened: vibrant glowing invitation to interact
        o.scale.lerp(new THREE.Vector3(0.88, 0.88, 0.88), 0.1);
        o.material.opacity = 0.85;
        o.material.emissiveIntensity = 0.65 + Math.sin(now * 3.0 + i) * 0.25;
        if (rune) rune.material.opacity = 0.8;
        if (halo) halo.visible = false;
      } else {
        // Dormant ancient relic before Station 2: gentle mystical slumber
        o.scale.lerp(new THREE.Vector3(0.55, 0.55, 0.55), 0.1);
        o.material.opacity = 0.35;
        o.material.emissiveIntensity = 0.2 + Math.sin(now * 1.5 + i) * 0.1;
        if (rune) rune.material.opacity = 0.25;
        if (halo) halo.visible = false;
      }
    });
  }

  // ── Dosha Crystals Breathing & Animation ──────────────────────────────────
  if (refs.doshaObjects) {
    const doshasAwakened = t >= 53 || (dhongaState && dhongaState.completed);
    refs.doshaObjects.forEach((c, i) => {
      const d = DOSHAS[i];
      const state = (discoveryStates && discoveryStates[d.id]) || 'HIDDEN';
      const rune = refs[`plinth_rune_${d.id}`];

      c.position.y = d.pos[1] + Math.sin(now * 0.7 + i * 1.8) * 0.12;
      c.rotation.y += delta * (0.5 + i * 0.15);

      if (state === 'DISCOVERED' || state === 'UNDERSTOOD') {
        c.scale.lerp(new THREE.Vector3(1.0, 1.0, 1.0), 0.1);
        c.traverse(child => {
          if (child.isMesh && child.material) {
            child.material.opacity = 0.95;
            child.material.emissiveIntensity = 0.95;
          }
        });
        if (rune) rune.material.opacity = 0.95;
      } else if (doshasAwakened) {
        c.scale.lerp(new THREE.Vector3(0.85, 0.85, 0.85), 0.1);
        c.traverse(child => {
          if (child.isMesh && child.material) {
            child.material.opacity = 0.8;
            child.material.emissiveIntensity = 0.65 + Math.sin(now * 2.8 + i) * 0.2;
          }
        });
        if (rune) rune.material.opacity = 0.75;
      } else {
        // Dormant crystal sanctuary before Station 4
        c.scale.lerp(new THREE.Vector3(0.55, 0.55, 0.55), 0.1);
        c.traverse(child => {
          if (child.isMesh && child.material) {
            child.material.opacity = 0.35;
            child.material.emissiveIntensity = 0.2;
          }
        });
        if (rune) rune.material.opacity = 0.2;
      }
    });
  }
}

// ── Pure Audio Synthesizer (NO Hissing Noise Buffer, Only Sacred Chime) ───────
function buildAyurvedaAudio() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    const ctx = new AudioCtx();
    const master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    // Sacred Singing Bowl / Discovery Chime (528 Hz harmonic resonance)
    const playDiscoveryChime = (baseFreq = 528) => {
      if (!ctx || ctx.state === 'closed') return;
      const now = ctx.currentTime;
      [1, 2, 3].forEach((mult, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = idx === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(baseFreq * mult, now);
        const peakGain = 0.22 / (idx + 1);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(peakGain, now + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
        osc.connect(gain);
        gain.connect(master);
        osc.start(now);
        osc.stop(now + 2.3);
      });
    };

    // Subtle stone-on-stone botanical grinding friction feedback
    let lastGrindTime = 0;
    const playGrindFrictionSound = () => {
      if (!ctx || ctx.state === 'closed') return;
      const now = ctx.currentTime;
      if (now - lastGrindTime < 0.12) return; // Smooth rate limit
      lastGrindTime = now;

      try {
        const bufferSize = Math.floor(ctx.sampleRate * 0.08);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * 0.18;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(320 + Math.random() * 80, now);
        filter.Q.setValueAtTime(2.2, now);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(master);

        noise.start(now);
        noise.stop(now + 0.08);
      } catch (_) {}
    };

    return {
      ctx,
      master,
      playDiscoveryChime,
      playGrindFrictionSound,
      setMuted: (muted) => {
        master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.03);
      },
      close: () => {
        try { ctx.close(); } catch (_) {}
      }
    };
  } catch (e) {
    console.warn('[AyurvedaAudio] init failed:', e);
    return null;
  }
}

// ── C3 Interactive Overlay Component ─────────────────────────────────────────
function C3Panel({ interaction, onComplete }) {
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [tapped, setTapped] = useState(false);
  const holdRef = useRef(null);
  const holdStartRef = useRef(null);
  const DUR = interaction.duration || 2500;

  const startHold = () => {
    if (isHolding) return;
    setIsHolding(true);
    holdStartRef.current = performance.now();
    holdRef.current = setInterval(() => {
      const p = clamp((performance.now() - holdStartRef.current) / DUR, 0, 1);
      setHoldProgress(p);
      if (p >= 1) {
        clearInterval(holdRef.current);
        setIsHolding(false);
        onComplete(interaction.id);
      }
    }, 16);
  };
  const stopHold = () => {
    if (holdRef.current) clearInterval(holdRef.current);
    setIsHolding(false);
    setHoldProgress(0);
  };
  const handleSelect = (idx) => {
    if (feedback) return;
    setSelectedIdx(idx);
    const ok = idx === interaction.correct;
    setFeedback(ok ? 'correct' : 'wrong');
    eventLogger.log('C3_ANSWER', { interactionId: interaction.id, selected: idx, correct: interaction.correct, isCorrect: ok });
    setTimeout(() => {
      if (ok) onComplete(interaction.id);
      else { setFeedback(null); setSelectedIdx(null); }
    }, 1200);
  };
  const handleTap = () => { setTapped(true); setTimeout(() => onComplete(interaction.id), 400); };

  return (
    <div className="c3-panel-overlay" style={{ '--c3accent': interaction.color || '#f4a261' }}>
      <div className="c3-panel-card">
        <div className="c3-panel-emoji">{interaction.emoji || '✨'}</div>
        <p className="c3-panel-prompt">{interaction.prompt}</p>

        {interaction.type === 'tap' && (
          <button className={`c3-tap-btn${tapped ? ' tapped' : ''}`} onClick={handleTap} style={{ background: interaction.color }}>
            {tapped ? '✓ Done!' : '👆 Tap Here'}
          </button>
        )}

        {interaction.type === 'hold' && (
          <div className="c3-hold-area">
            <div className="c3-hold-btn" onPointerDown={startHold} onPointerUp={stopHold} onPointerLeave={stopHold} style={{ background: interaction.color }}>
              <svg viewBox="0 0 100 100" className="c3-hold-ring">
                <circle cx="50" cy="50" r="44" stroke="rgba(255,255,255,0.2)" strokeWidth="6" fill="none" />
                <circle cx="50" cy="50" r="44" stroke="white" strokeWidth="6" fill="none"
                  strokeDasharray={`${holdProgress * 276.46} 276.46`} strokeLinecap="round" transform="rotate(-90 50 50)" />
              </svg>
              <span className="c3-hold-label">{holdProgress >= 1 ? '✓' : isHolding ? `${Math.round(holdProgress * 100)}%` : 'HOLD'}</span>
            </div>
          </div>
        )}

        {interaction.type === 'select' && interaction.options && (
          <div className="c3-options-grid">
            {interaction.options.map((opt, i) => (
              <button
                key={i}
                className={`c3-option-btn${selectedIdx === i ? (feedback === 'correct' ? ' correct' : ' wrong') : ''}${selectedIdx !== null && i === interaction.correct && feedback === 'wrong' ? ' correct-reveal' : ''}`}
                onClick={() => handleSelect(i)}
                disabled={!!feedback}
              >
                <span className="c3-opt-letter">{String.fromCharCode(65 + i)}</span>
                <span className="c3-opt-text">{opt}</span>
              </button>
            ))}
          </div>
        )}

        {feedback && <div className={`c3-feedback-banner ${feedback}`}>{feedback === 'correct' ? '✓ Correct! Well done!' : '✗ Try again…'}</div>}
      </div>
    </div>
  );
}

// ── Master Component ────────────────────────────────────────────────────────
export default function AyurvedaCanvas({ condition = 'C1', storyConfig, onComplete }) {
  const mountRef = useRef(null);
  const videoRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rigRef = useRef(null);
  const worldRefs = useRef({});
  const audioRef = useRef(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [stationIdx, setStationIdx] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isMuted, setIsMuted] = useState(false);

  // Progressive Discovery States: { [id]: 'HIDDEN' | 'DISCOVERABLE' | 'DISCOVERED' | 'UNDERSTOOD' }
  const [discoveryStates, setDiscoveryStates] = useState(() => {
    const init = {};
    ELEMENTS.forEach(el => { init[el.id] = 'HIDDEN'; });
    DOSHAS.forEach(d => { init[d.id] = 'HIDDEN'; });
    return init;
  });

  const [infoPanel, setInfoPanel] = useState(null);
  const [discoveryAlert, setDiscoveryAlert] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isExploring, setIsExploring] = useState(true); // Default true so WASD works immediately
  const [showCodex, setShowCodex] = useState(false);
  const [vrSupported, setVrSupported] = useState(false);
  const [inVR, setInVR] = useState(false);
  const [targetedObject, setTargetedObject] = useState(null);
  const [gazeInfo, setGazeInfo] = useState(null);

  // Condition C3 Interactive Overlay State
  const [activeC3, setActiveC3] = useState(null);
  const [completedC3, setCompletedC3] = useState(new Set());
  const waitingC3 = useRef(false);

  // Shuffle C3 options on mount
  const [c3List] = useState(() => C3_INTERACTIONS_BASE.map(item => {
    if (item.type === 'select' && item.options) {
      const ct = item.options[item.correct];
      const sh = [...item.options].sort(() => Math.random() - 0.5);
      return { ...item, options: sh, correct: sh.indexOf(ct) };
    }
    return { ...item };
  }));

  const currentTimeRef = useRef(0);
  const playingRef = useRef(false);
  const conditionRef = useRef(condition);
  conditionRef.current = condition;

  // Stable Mutable Refs for Three.js Animation Loop (Prevents Snapping-Back!)
  const discoveryStatesRef = useRef(discoveryStates);
  discoveryStatesRef.current = discoveryStates;

  const isExploringRef = useRef(isExploring);
  isExploringRef.current = isExploring;

  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  const targetedObjectRef = useRef(targetedObject);
  targetedObjectRef.current = targetedObject;

  const handleDiscoverConceptRef = useRef(null);

  // First-person laptop movement state
  const keysDown = useRef({});
  const yaw = useRef(0);
  const pitch = useRef(0);
  const isPointerLocked = useRef(false);
  const gazeTimes = useRef({});
  const lastHead = useRef(0);

  // ── Condition C3 Check & Gating ───────────────────────────────────────────
  const checkC3 = useCallback((t) => {
    if (conditionRef.current !== 'C3') return;
    const active = c3List.find(item => {
      const [sm, ss] = item.active_window[0].split(':').map(Number);
      const [em, es] = item.active_window[1].split(':').map(Number);
      return t >= sm * 60 + ss && t <= em * 60 + es && !completedC3.has(item.id);
    });
    setActiveC3(active || null);
    if (active?.gate?.type === 'hold_at') {
      const [hm, hs] = active.gate.hold_at.split(':').map(Number);
      const holdSec = hm * 60 + hs;
      if (t >= holdSec && !completedC3.has(active.id) && !waitingC3.current) {
        waitingC3.current = true;
        if (videoRef.current) videoRef.current.pause();
        setPlaying(false);
        playingRef.current = false;
        eventLogger.log('C3_GATE_OPEN', { videoTimestamp: t, interactionId: active.id });
        setTimeout(() => {
          if (waitingC3.current) {
            waitingC3.current = false;
            eventLogger.log('C3_GATE_TIMEOUT', { interactionId: active.id });
            if (videoRef.current) videoRef.current.play();
            setPlaying(true);
            playingRef.current = true;
          }
        }, (active.gate.max_wait_sec || 7) * 1000);
      }
    }
  }, [c3List, completedC3]);

  const handleC3Complete = useCallback((id) => {
    setCompletedC3(prev => new Set(prev).add(id));
    setActiveC3(null);
    eventLogger.log('C3_COMPLETE', { videoTimestamp: currentTimeRef.current, interactionId: id });
    if (waitingC3.current) {
      waitingC3.current = false;
      if (videoRef.current) videoRef.current.play();
      setPlaying(true);
      playingRef.current = true;
    }
  }, []);

  // ── Discovery State Transitions & Logic ────────────────────────────────────
  const updateProgressiveUnlocks = useCallback((t) => {
    setDiscoveryStates(prev => {
      let changed = false;
      const next = { ...prev };

      // Station 2 (t >= 27s): Elements become DISCOVERABLE
      if (t >= 27) {
        ELEMENTS.forEach(el => {
          if (next[el.id] === 'HIDDEN') {
            next[el.id] = 'DISCOVERABLE';
            changed = true;
            eventLogger.log('CONCEPT_DISCOVERABLE', { conceptId: el.id, type: 'element', timestamp: t });
          }
        });
      }

      // Station 4 (t >= 53s): Doshas become DISCOVERABLE
      if (t >= 53) {
        DOSHAS.forEach(d => {
          if (next[d.id] === 'HIDDEN') {
            next[d.id] = 'DISCOVERABLE';
            changed = true;
            eventLogger.log('CONCEPT_DISCOVERABLE', { conceptId: d.id, type: 'dosha', timestamp: t });
          }
        });
      }

      return changed ? next : prev;
    });
  }, []);

  // Modal & Concept Interaction State Machine Refs
  const infoPanelRef = useRef(infoPanel);
  infoPanelRef.current = infoPanel;
  const dismissedConceptIdRef = useRef(null);
  const popupStateRef = useRef('NONE'); // 'NONE' | 'FOCUSED' | 'OPEN' | 'DISMISSED'

  // Dhonga & Pestle Grinding State
  const [dhongaState, setDhongaState] = useState({
    status: 'RESTING', // 'RESTING' | 'FOCUSED' | 'HELD' | 'GRINDING' | 'COMPLETED'
    progress: 0,
  });
  const dhongaRef = useRef({
    status: 'RESTING',
    progress: 0,
    accumulatedAngle: 0,
    lastAngle: null,
    completed: false,
    holder: null, // 'mouse' | 'controller_0' | 'controller_1'
    heldController: null,
  });
  const heldToolRef = useRef(null);

  // ── Dismissal Guard & State Machine Transition ─────────────────────────────
  const handleDismissPanel = useCallback((e) => {
    if (e) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }
    const cur = infoPanelRef.current;
    if (cur && cur.id) {
      dismissedConceptIdRef.current = cur.id;
      popupStateRef.current = 'DISMISSED';
      eventLogger.log('CONCEPT_PANEL_DISMISSED', {
        conceptId: cur.id,
        videoTimestamp: currentTimeRef.current
      });
    }
    setInfoPanel(null);
    setGazeInfo(null);
    Object.keys(gazeTimes.current).forEach(k => { gazeTimes.current[k] = null; });
  }, []);

  // ── Concept Discovery Action (Deliberate Laptop Click/E & VR Trigger) ──────
  const handleDiscoverConcept = useCallback((concept, isDeliberate = true) => {
    if (!concept || !concept.id) return;

    // Reset dismissal guard on intentional activation
    if (isDeliberate) {
      dismissedConceptIdRef.current = null;
    }

    popupStateRef.current = 'OPEN';

    // Validate & Discover
    setDiscoveryStates(prev => ({ ...prev, [concept.id]: 'DISCOVERED' }));

    // Sound feedback: Harmonic singing bowl ping
    if (audioRef.current?.playDiscoveryChime) {
      const freq = concept.type === 'dosha' ? 660 : 528;
      audioRef.current.playDiscoveryChime(freq);
    }

    // Banner celebration
    setDiscoveryAlert({ label: concept.label, type: concept.type });
    setTimeout(() => setDiscoveryAlert(null), 3600);

    // Event logging
    eventLogger.log('CONCEPT_DISCOVERED', {
      conceptId: concept.id,
      type: concept.type,
      label: concept.label,
      videoTimestamp: currentTimeRef.current,
      deliberate: isDeliberate
    });

    // Open Lore Card
    setInfoPanel({
      id: concept.id,
      label: concept.label,
      desc: concept.desc,
      elements: concept.elements || null,
      type: concept.type,
      color: concept.color
    });
  }, []);
  handleDiscoverConceptRef.current = handleDiscoverConcept;

  // ── Shared Dhonga (Mortar & Pestle) Gameplay Handlers ──────────────────────
  const handleGrabPestle = useCallback((holder = 'mouse') => {
    if (dhongaRef.current.status === 'HELD') return;
    dhongaRef.current.status = 'HELD';
    dhongaRef.current.holder = holder;
    heldToolRef.current = 'pestle';

    setDhongaState(prev => ({ ...prev, status: 'HELD' }));

    if (audioRef.current?.playDiscoveryChime) {
      audioRef.current.playDiscoveryChime(440);
    }

    eventLogger.log('OBJECT_GRABBED', {
      objectId: 'dhonga_pestle',
      holder,
      videoTimestamp: currentTimeRef.current
    });
  }, []);

  const handleReleasePestle = useCallback(() => {
    if (dhongaRef.current.status !== 'HELD' && dhongaRef.current.status !== 'GRINDING') return;

    const completed = dhongaRef.current.completed;
    dhongaRef.current.status = completed ? 'COMPLETED' : 'RESTING';
    dhongaRef.current.holder = null;
    dhongaRef.current.heldController = null;
    dhongaRef.current.lastAngle = null;
    heldToolRef.current = null;

    setDhongaState(prev => ({
      ...prev,
      status: completed ? 'COMPLETED' : 'RESTING'
    }));

    // Smoothly restore pestle to resting posture beside mortar
    if (worldRefs.current.pestle) {
      worldRefs.current.pestle.position.set(2.95, 0.88, -1.82);
      worldRefs.current.pestle.rotation.set(0.15, 0.1, 0.45);
    }
    if (worldRefs.current.grindZoneRing) {
      worldRefs.current.grindZoneRing.material.opacity = 0.0;
    }

    eventLogger.log('OBJECT_RELEASED', {
      objectId: 'dhonga_pestle',
      completed,
      videoTimestamp: currentTimeRef.current
    });
  }, []);

  const handleGrindComplete = useCallback(() => {
    if (dhongaRef.current.completed) return;
    dhongaRef.current.completed = true;
    dhongaRef.current.status = 'COMPLETED';
    dhongaRef.current.progress = 1.0;

    setDhongaState({ status: 'COMPLETED', progress: 1.0 });

    if (audioRef.current?.playDiscoveryChime) {
      audioRef.current.playDiscoveryChime(792); // Radiant completion chord
    }

    eventLogger.log('DHONGA_GRIND_COMPLETE', {
      videoTimestamp: currentTimeRef.current,
      storySegment: 'seg3_plants_preparations'
    });

    // Connect to approved Vata learning content (Station 3 -> Vata Principle of Movement)
    handleDiscoverConcept({
      id: 'vata',
      label: 'Vata Dosha (Air + Ether)',
      desc: 'In traditional Ayurvedic preparation, the physical grinding and warming of herbs balances the dynamic, mobile, and dry qualities of Vata (Air and Space). Vata is the vital principle governing all movement, respiration, and nervous impulses.',
      elements: 'Air + Ether',
      type: 'dosha',
      color: 0x38bdf8
    }, true);
  }, [handleDiscoverConcept]);

  // ── Video Controls ─────────────────────────────────────────────────────────
  const playVideo = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.play().then(() => {
      setPlaying(true);
      playingRef.current = true;
      if (audioRef.current?.ctx?.state === 'suspended') audioRef.current.ctx.resume();
      eventLogger.log('VIDEO_START', { videoTimestamp: currentTimeRef.current, condition: conditionRef.current });
    }).catch(e => console.warn('[AC] play blocked:', e));
  }, []);

  const pauseVideo = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    setPlaying(false);
    playingRef.current = false;
    eventLogger.log('VIDEO_PAUSE', { videoTimestamp: currentTimeRef.current, condition: conditionRef.current });
  }, []);

  const seekVideo = useCallback((time) => {
    const t = clamp(time, 0, PLAYBACK_END_SEC);
    if (videoRef.current) videoRef.current.currentTime = t;
    setCurrentTime(t);
    currentTimeRef.current = t;
    updateProgressiveUnlocks(t);
  }, [updateProgressiveUnlocks]);

  const handleRestart = useCallback(() => {
    seekVideo(0);
    const resetStates = {};
    ELEMENTS.forEach(el => { resetStates[el.id] = 'HIDDEN'; });
    DOSHAS.forEach(d => { resetStates[d.id] = 'HIDDEN'; });
    setDiscoveryStates(resetStates);
    setIsPaused(false);
    setInfoPanel(null);
    if (rigRef.current) rigRef.current.position.set(0, 1.65, 4.0);
    playVideo();
    eventLogger.log('EXPERIENCE_RESTART', { storyId: 'ayurveda_intro_v1' });
  }, [seekVideo, playVideo]);

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime;
    setCurrentTime(t);
    currentTimeRef.current = t;
    const si = STATIONS.findIndex(s => t >= s.t[0] && t <= s.t[1]);
    if (si >= 0) setStationIdx(si);
    updateProgressiveUnlocks(t);
    checkC3(t);

    if (t >= PLAYBACK_END_SEC) {
      videoRef.current.pause();
      setPlaying(false);
      playingRef.current = false;
      eventLogger.log('VIDEO_COMPLETE', { videoTimestamp: PLAYBACK_END_SEC });
      if (onComplete) onComplete();
    }
  };

  // ── First-Person Laptop 3D Engine (C4) — Stable Lifecycle (Mounts Once!) ──
  useEffect(() => {
    if (condition !== 'C4') return;
    const mount = mountRef.current;
    if (!mount) return;

    const w = mount.clientWidth || 960, h = mount.clientHeight || 540;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(78, w / h, 0.05, 500);
    cameraRef.current = camera;

    const rig = new THREE.Group();
    rig.position.set(0, 1.65, 4.0);
    rig.add(camera);
    scene.add(rig);
    rigRef.current = rig;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.xr.enabled = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    try { renderer.outputColorSpace = THREE.SRGBColorSpace; } catch (_) {}
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    if (navigator.xr) {
      navigator.xr.isSessionSupported('immersive-vr')
        .then(s => setVrSupported(s))
        .catch(() => {});
    }

    buildAyurvedaWorld(scene, worldRefs.current);

    // Explainer Video Floating Tablet
    if (videoRef.current) {
      const vt = new THREE.VideoTexture(videoRef.current);
      try { vt.colorSpace = THREE.SRGBColorSpace; } catch (_) {}
      const vp = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.47), new THREE.MeshBasicMaterial({ map: vt }));
      vp.position.set(0, 2.7, -5.8);
      scene.add(vp);
      worldRefs.current.vidPlane = vp;

      const fg = new THREE.EdgesGeometry(new THREE.BoxGeometry(4.55, 2.62, 0.04));
      const fl = new THREE.LineSegments(fg, new THREE.LineBasicMaterial({ color: 0xd4a017 }));
      fl.position.set(0, 2.7, -5.8);
      scene.add(fl);
    }

    // VR Gaze Reticle
    const reticle = new THREE.Group();
    reticle.add(new THREE.Mesh(
      new THREE.RingGeometry(0.018, 0.026, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthTest: false })
    ));
    reticle.position.set(0, 0, -1.5);
    camera.add(reticle);
    worldRefs.current.reticle = reticle;

    // Gaze progress arc
    const gArcMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthTest: false });
    const gArc = new THREE.Mesh(new THREE.RingGeometry(0.028, 0.034, 32), gArcMat);
    gArc.scale.setScalar(0);
    reticle.add(gArc);
    worldRefs.current.gazeArc = gArc;

    // ── Shared Grinding Physics & Gesture Validation Function ──────────────
    const performGrind = (pestlePos, dt, source = 'mouse') => {
      const mortarCenter = new THREE.Vector3(2.8, 1.15, -2.0);
      const dx = pestlePos.x - mortarCenter.x;
      const dz = pestlePos.z - mortarCenter.z;
      const dist2D = Math.hypot(dx, dz);
      const inZone = dist2D <= 0.35 && pestlePos.y >= 0.85 && pestlePos.y <= 1.55;

      if (worldRefs.current.grindZoneRing) {
        worldRefs.current.grindZoneRing.material.opacity = inZone ? 0.75 : 0.0;
      }

      if (inZone) {
        const curAngle = Math.atan2(dz, dx);
        if (dhongaRef.current.lastAngle !== null) {
          let dTheta = curAngle - dhongaRef.current.lastAngle;
          if (dTheta > Math.PI) dTheta -= 2 * Math.PI;
          if (dTheta < -Math.PI) dTheta += 2 * Math.PI;
          const absD = Math.abs(dTheta);
          // Require valid circular stroke movement inside mortar cavity
          if (absD > 0.035 && absD < 1.2 && dist2D > 0.04) {
            dhongaRef.current.accumulatedAngle += absD;
            // 3.0 full circular rotations required (approx 18.8 radians)
            const prog = Math.min(1.0, dhongaRef.current.accumulatedAngle / (Math.PI * 2 * 3.0));
            dhongaRef.current.progress = prog;

            setDhongaState({
              status: prog >= 1.0 ? 'COMPLETED' : 'GRINDING',
              progress: prog
            });

            // Swirl botanical herb leaves & crush into powder
            if (worldRefs.current.leafFlakes) {
              worldRefs.current.leafFlakes.rotation.y += dTheta * 0.9;
              const s = Math.max(0.12, 1.0 - prog * 0.78);
              worldRefs.current.leafFlakes.scale.set(s, Math.max(0.08, 1.0 - prog * 0.9), s);
            }
            if (worldRefs.current.herbBedMat) {
              worldRefs.current.herbBedMat.color.setHex(prog > 0.5 ? 0x14532d : 0x166534);
            }

            // Audio: subtle stone-on-stone botanical friction
            if (audioRef.current?.playGrindFrictionSound) {
              audioRef.current.playGrindFrictionSound();
            }

            // VR Haptic pulse on gamepad if available
            if (source && source.gamepad?.hapticActuators?.[0]) {
              try { source.gamepad.hapticActuators[0].pulse(0.4, 25); } catch (_) {}
            }

            if (prog >= 1.0 && !dhongaRef.current.completed) {
              handleGrindComplete();
            }
          }
        }
        dhongaRef.current.lastAngle = curAngle;
      } else {
        dhongaRef.current.lastAngle = null;
      }
    };

    // ── WebXR 6DOF Controllers with Grab & Ray Interaction ──────────────────
    renderer.xr.addEventListener('sessionstart', () => {
      [0, 1].forEach(i => {
        const ctrl = renderer.xr.getController(i);
        scene.add(ctrl);

        const laserGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -8)]);
        const laser = new THREE.Line(laserGeom, new THREE.LineBasicMaterial({ color: i === 0 ? 0xf59e0b : 0x38bdf8 }));
        ctrl.add(laser);

        const handleXRTrigger = () => {
          // Check proximity grab to pestle
          if (worldRefs.current.pestle) {
            const ctrlPos = new THREE.Vector3();
            ctrl.getWorldPosition(ctrlPos);
            const pestlePos = new THREE.Vector3();
            worldRefs.current.pestle.getWorldPosition(pestlePos);

            if (ctrlPos.distanceTo(pestlePos) < 0.45) {
              // Attach pestle to controller
              ctrl.attach(worldRefs.current.pestle);
              dhongaRef.current.heldController = ctrl;
              handleGrabPestle(`vr_controller_${i}`);
              return;
            }
          }

          // Raycast for altar interaction
          const ray = new THREE.Raycaster();
          const tm = new THREE.Matrix4();
          tm.identity().extractRotation(ctrl.matrixWorld);
          ray.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
          ray.ray.direction.set(0, 0, -1).applyMatrix4(tm);

          // Check direct pestle ray hit
          if (worldRefs.current.pestle) {
            const pestleHits = ray.intersectObject(worldRefs.current.pestle, true);
            if (pestleHits.length > 0) {
              ctrl.attach(worldRefs.current.pestle);
              dhongaRef.current.heldController = ctrl;
              handleGrabPestle(`vr_controller_${i}`);
              return;
            }
          }

          const interactables = [...(worldRefs.current.elementOrbs || []), ...(worldRefs.current.doshaObjects || [])];
          const hits = ray.intersectObjects(interactables, true);
          if (hits.length > 0) {
            let hitObj = hits[0].object;
            while (hitObj && !hitObj.userData?.id && hitObj.parent) hitObj = hitObj.parent;
            if (hitObj?.userData?.id && handleDiscoverConceptRef.current) {
              const uData = hitObj.userData;
              const curT = currentTimeRef.current;
              // Progressive story gating in VR
              if (uData.type === 'element' && curT < 27) {
                setDiscoveryAlert({
                  label: `${uData.label} is currently Dormant — Awakens in Station 2 (The Five Elements Ring)`,
                  type: 'dormant'
                });
                setTimeout(() => setDiscoveryAlert(null), 3600);
                return;
              }
              if (uData.type === 'dosha' && curT < 53 && !dhongaRef.current.completed) {
                setDiscoveryAlert({
                  label: `${uData.label} Sanctuary is Dormant — Awakens in Station 4 (or unlock by grinding herbs)`,
                  type: 'dormant'
                });
                setTimeout(() => setDiscoveryAlert(null), 3600);
                return;
              }
              handleDiscoverConceptRef.current(uData, true);
              eventLogger.log('XR_SELECT', { objectId: uData.id, type: uData.type });
            }
          }
        };

        const handleXRRelease = () => {
          if (dhongaRef.current.heldController === ctrl) {
            scene.attach(worldRefs.current.pestle);
            handleReleasePestle();
          }
        };

        ctrl.addEventListener('selectstart', handleXRTrigger);
        ctrl.addEventListener('squeezestart', handleXRTrigger);
        ctrl.addEventListener('selectend', handleXRRelease);
        ctrl.addEventListener('squeezeend', handleXRRelease);
      });
    });

    // ── Main Rendering & Locomotion Animation Loop ───────────────────────────
    let lastTime = performance.now();
    const animate = () => {
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.08);
      lastTime = now;
      const t = currentTimeRef.current;

      // Update 3D world meshes & discovery states
      updateAyurvedaWorld(t, dt, worldRefs.current, discoveryStatesRef.current, dhongaRef.current);
      if (worldRefs.current.vidPlane && videoRef.current) {
        worldRefs.current.vidPlane.material.map.needsUpdate = true;
      }

      // If pestle is held by VR controller, evaluate grinding gesture in real-time
      if (dhongaRef.current.status === 'HELD' && dhongaRef.current.heldController && worldRefs.current.pestle) {
        const pestleWorldPos = new THREE.Vector3();
        worldRefs.current.pestle.getWorldPosition(pestleWorldPos);
        performGrind(pestleWorldPos, dt, 'vr_controller');
      }

      // Laptop First-Person Locomotion (WASD) — Smooth, Zero Snapping!
      if (!isPausedRef.current) {
        const speed = (keysDown.current['Shift'] ? 6.5 : 3.8) * dt;
        const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw.current);
        const side = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw.current);
        const moveDir = new THREE.Vector3();

        if (keysDown.current['w'] || keysDown.current['W']) moveDir.add(forward);
        if (keysDown.current['s'] || keysDown.current['S']) moveDir.sub(forward);
        if (keysDown.current['d'] || keysDown.current['D']) moveDir.add(side);
        if (keysDown.current['a'] || keysDown.current['A']) moveDir.sub(side);

        // Arrow keys & Q/E camera turning
        if (keysDown.current['ArrowLeft']) {
          yaw.current += 2.4 * dt;
          rig.rotation.set(0, yaw.current, 0);
        }
        if (keysDown.current['ArrowRight']) {
          yaw.current -= 2.4 * dt;
          rig.rotation.set(0, yaw.current, 0);
        }
        if (keysDown.current['ArrowUp']) {
          pitch.current = clamp(pitch.current + 1.8 * dt, -1.35, 1.35);
          camera.rotation.set(pitch.current, 0, 0);
        }
        if (keysDown.current['ArrowDown']) {
          pitch.current = clamp(pitch.current - 1.8 * dt, -1.35, 1.35);
          camera.rotation.set(pitch.current, 0, 0);
        }

        if (moveDir.lengthSq() > 0) {
          moveDir.normalize();
          rig.position.x += moveDir.x * speed;
          rig.position.z += moveDir.z * speed;

          // Boundary collision (radius 32m)
          const distFromCenter = Math.hypot(rig.position.x, rig.position.z);
          if (distFromCenter > 32) {
            rig.position.x = (rig.position.x / distFromCenter) * 32;
            rig.position.z = (rig.position.z / distFromCenter) * 32;
          }
        }
      }

      // WebXR Thumbstick Locomotion (when in VR)
      const session = renderer.xr.getSession();
      if (session) {
        for (const source of session.inputSources) {
          if (source.gamepad && source.gamepad.axes.length >= 4) {
            const axes = source.gamepad.axes;
            if (source.handedness === 'left') {
              const xrMove = new THREE.Vector3(axes[2], 0, axes[3]);
              if (xrMove.lengthSq() > 0.05) {
                const headRot = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
                xrMove.applyAxisAngle(new THREE.Vector3(0, 1, 0), headRot.y);
                rig.position.x += xrMove.x * 3.5 * dt;
                rig.position.z += xrMove.z * 3.5 * dt;
              }
            } else if (source.handedness === 'right') {
              if (Math.abs(axes[2]) > 0.7 && !source.__snapDebounce) {
                source.__snapDebounce = true;
                rig.rotation.y -= Math.sign(axes[2]) * (Math.PI / 6);
                setTimeout(() => { source.__snapDebounce = false; }, 280);
              }
            }
          }
        }
      }

      // Center Raycast & Proximity Detection (STRICT Progressive Narrative Gating)
      const candidateList = [];

      // Elements awaken only when Station 2 arrives (t >= 27) OR already discovered
      const hasDiscoveredElements = Object.keys(discoveryStatesRef.current).some(
        k => ['earth', 'water', 'fire', 'air', 'ether'].includes(k) && discoveryStatesRef.current[k] !== 'HIDDEN'
      );
      if (t >= 27 || hasDiscoveredElements) {
        candidateList.push(...(ELEMENTS || []));
      }

      // Sacred Patila & Pestle awakens in Station 3 (t >= 32) OR when near table
      const distToTable = rig.position.distanceTo(new THREE.Vector3(2.8, 1.0, -2.0));
      if ((t >= 32 || distToTable <= 3.8) && dhongaRef.current.status !== 'COMPLETED') {
        candidateList.push({
          id: 'dhonga_pestle',
          label: dhongaRef.current.status === 'HELD' ? 'Grinding Herbs (Move in circles in Patila)' : 'Sacred Patila & Pestle',
          type: 'tool',
          pos: [2.8, 1.0, -2.0]
        });
      }

      // Doshas awaken in Station 4 (t >= 53) OR if unlocked by completing herb grinding
      const hasDiscoveredDoshas = Object.keys(discoveryStatesRef.current).some(
        k => ['vata', 'pitta', 'kapha'].includes(k) && discoveryStatesRef.current[k] !== 'HIDDEN'
      );
      if (t >= 53 || dhongaRef.current.status === 'COMPLETED' || hasDiscoveredDoshas) {
        candidateList.push(...(DOSHAS || []));
      }

      let nearestCandidate = null;
      let minDistance = 999;

      candidateList.forEach(cand => {
        const candPos = new THREE.Vector3(...cand.pos);
        const dist = rig.position.distanceTo(candPos);
        if (dist < minDistance && dist <= INTERACTION_DIST) {
          minDistance = dist;
          nearestCandidate = cand;
        }
      });

      setTargetedObject(nearestCandidate);

      // Check if nearestCandidate was explicitly dismissed by user
      const isDismissed = nearestCandidate && (nearestCandidate.id === dismissedConceptIdRef.current);

      // Gaze Dwell for VR (ONLY in active VR session, and NEVER for dismissed objects or desktop)
      const sessionActive = !!renderer.xr.getSession();
      if (sessionActive && nearestCandidate && !isDismissed && nearestCandidate.type !== 'tool') {
        const id = nearestCandidate.id;
        if (!gazeTimes.current[id]) gazeTimes.current[id] = now;
        const prog = clamp((now - gazeTimes.current[id]) / GAZE_DWELL_MS, 0, 1);
        setGazeInfo({ id, progress: prog, label: nearestCandidate.label });
        if (worldRefs.current.gazeArc) {
          worldRefs.current.gazeArc.scale.setScalar(1);
          worldRefs.current.gazeArc.rotation.z = -Math.PI / 2;
        }
        if (prog >= 1) {
          gazeTimes.current[id] = null;
          if (handleDiscoverConceptRef.current) {
            handleDiscoverConceptRef.current(nearestCandidate, true);
          }
          setGazeInfo(null);
        }
      } else {
        Object.keys(gazeTimes.current).forEach(k => { gazeTimes.current[k] = null; });
        setGazeInfo(null);
        if (worldRefs.current.gazeArc) worldRefs.current.gazeArc.scale.setScalar(0);
      }

      // If player physically walked away from dismissed target (> 3.6m), reset dismissal guard
      if (dismissedConceptIdRef.current) {
        const allItems = [...ELEMENTS, ...DOSHAS, { id: 'dhonga_pestle', pos: [2.8, 1.0, -2.0] }];
        const dismissedItem = allItems.find(item => item.id === dismissedConceptIdRef.current);
        if (dismissedItem) {
          const distToDismissed = rig.position.distanceTo(new THREE.Vector3(...dismissedItem.pos));
          if (distToDismissed > INTERACTION_DIST + 1.6) {
            dismissedConceptIdRef.current = null;
          }
        } else {
          dismissedConceptIdRef.current = null;
        }
      }

      // Head Rotation Logging
      if (now - lastHead.current > HEAD_ROTATION_SAMPLE_MS && playingRef.current) {
        lastHead.current = now;
        eventLogger.log('HEAD_ROTATION', {
          videoTimestamp: t,
          extra: { yaw: (yaw.current * 180 / Math.PI).toFixed(1), pitch: (pitch.current * 180 / Math.PI).toFixed(1) }
        });
      }

      renderer.render(scene, camera);
    };
    renderer.setAnimationLoop(animate);

    // ── Input Listeners for Desktop First-Person ─────────────────────────────
    const onKeyDown = (e) => {
      keysDown.current[e.key] = true;
      if (['w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        setIsExploring(true);
      }

      // Deliberate E Key: Pick up/put down pestle OR inspect focused concept
      if (e.key === 'e' || e.key === 'E') {
        if (targetedObjectRef.current?.id === 'dhonga_pestle') {
          if (dhongaRef.current.status === 'HELD') {
            handleReleasePestle();
          } else {
            handleGrabPestle('mouse');
          }
          return;
        }

        if (targetedObjectRef.current && handleDiscoverConceptRef.current) {
          handleDiscoverConceptRef.current(targetedObjectRef.current, true);
        }
      }

      // Q Key: Put down held pestle
      if ((e.key === 'q' || e.key === 'Q') && dhongaRef.current.status === 'HELD') {
        handleReleasePestle();
      }

      if (e.key === 'Escape') {
        setIsPaused(p => !p);
      }
    };

    const onKeyUp = (e) => {
      keysDown.current[e.key] = false;
    };

    let isDragging = false;
    let prevPointer = { x: 0, y: 0 };
    let pointerDownPos = { x: 0, y: 0, time: 0 };

    const onPointerDown = (e) => {
      // Prevent canvas from intercepting clicks on modal overlay / cards / close buttons
      if (e.target.closest && (
        e.target.closest('.c4-info-overlay') ||
        e.target.closest('.c4-info-card') ||
        e.target.closest('.c4-pause-modal-overlay') ||
        e.target.closest('.c4-pause-card') ||
        e.target.closest('.c4-vr-toolbar')
      )) {
        return;
      }

      // Right-click releases held pestle
      if (e.button === 2 && dhongaRef.current.status === 'HELD') {
        handleReleasePestle();
        return;
      }

      pointerDownPos = { x: e.clientX, y: e.clientY, time: performance.now() };

      // If pestle is currently held, mouse clicks manipulate the tool inside Patila, so do not drag camera
      if (dhongaRef.current.status === 'HELD') {
        return;
      }

      // Normal camera drag initiation
      isDragging = true;
      prevPointer = { x: e.clientX, y: e.clientY };
      mount.style.cursor = 'grabbing';
    };

    const onPointerMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(nx, ny), camera);

      // If pestle is held on laptop, project ray onto mortar table plane to move implement
      if (dhongaRef.current.status === 'HELD' && dhongaRef.current.holder === 'mouse' && worldRefs.current.pestle) {
        // Table plane at mortar cavity height (y = 1.15)
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.15);
        const hitPt = new THREE.Vector3();
        ray.ray.intersectPlane(plane, hitPt);

        if (hitPt) {
          // Constrain movement to table work area
          const cx = clamp(hitPt.x, 2.3, 3.3);
          const cz = clamp(hitPt.z, -2.5, -1.5);
          worldRefs.current.pestle.position.set(cx, 1.15, cz);

          // Tilt pestle slightly towards mortar center (2.8, -2.0)
          const dx = cx - 2.8, dz = cz - (-2.0);
          worldRefs.current.pestle.rotation.set(dz * 0.4, 0, -dx * 0.4);

          // Perform grinding logic
          performGrind(worldRefs.current.pestle.position, 0.016, 'mouse');
        }
        return;
      }

      // Highlight pestle on hover
      if (worldRefs.current.pestle && worldRefs.current.pestleHighlight) {
        const pestleHits = ray.intersectObject(worldRefs.current.pestle, true);
        worldRefs.current.pestleHighlight.material.opacity = pestleHits.length > 0 ? 0.5 : 0.0;
      }

      const isLocked = !!(document.pointerLockElement && (document.pointerLockElement === mount || document.pointerLockElement === renderer.domElement));

      if (isLocked) {
        // Continuous pointer lock look
        const dx = e.movementX || 0;
        const dy = e.movementY || 0;
        yaw.current -= dx * 0.0024;
        pitch.current = clamp(pitch.current - dy * 0.0024, -1.35, 1.35);
        camera.rotation.set(pitch.current, 0, 0);
        rig.rotation.set(0, yaw.current, 0);
      } else if (isDragging) {
        // Smooth drag-to-look
        const dx = e.clientX - prevPointer.x;
        const dy = e.clientY - prevPointer.y;
        yaw.current -= dx * 0.0035;
        pitch.current = clamp(pitch.current - dy * 0.0035, -1.35, 1.35);
        camera.rotation.set(pitch.current, 0, 0);
        rig.rotation.set(0, yaw.current, 0);
        prevPointer = { x: e.clientX, y: e.clientY };
      }
    };

    const onPointerUp = (e) => {
      isDragging = false;
      mount.style.cursor = 'grab';

      // Discriminate deliberate click from camera rotation drag
      const dx = Math.abs(e.clientX - pointerDownPos.x);
      const dy = Math.abs(e.clientY - pointerDownPos.y);
      const elapsed = performance.now() - pointerDownPos.time;
      const isDeliberateClick = dx < 6 && dy < 6 && elapsed < 450;

      if (!isDeliberateClick) return;

      // Raycast for deliberate 3D click on pestle or altar
      const rect = renderer.domElement.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(nx, ny), camera);

      // Check pestle click (pick up / put down)
      if (worldRefs.current.pestle) {
        const pestleHits = ray.intersectObject(worldRefs.current.pestle, true);
        if (pestleHits.length > 0) {
          if (dhongaRef.current.status === 'HELD') {
            handleReleasePestle();
          } else {
            handleGrabPestle('mouse');
          }
          return;
        }
      }

      // If pestle is held, clicks don't activate distant altars
      if (dhongaRef.current.status === 'HELD') {
        return;
      }

      // Check altar orbs & crystals
      const interactables = [...(worldRefs.current.elementOrbs || []), ...(worldRefs.current.doshaObjects || [])];
      const hits = ray.intersectObjects(interactables, true);
      if (hits.length > 0) {
        let hitObj = hits[0].object;
        while (hitObj && !hitObj.userData?.id && hitObj.parent) hitObj = hitObj.parent;
        if (hitObj?.userData?.id && handleDiscoverConceptRef.current) {
          const uData = hitObj.userData;
          const curT = currentTimeRef.current;

          // Progressive Story Gating
          if (uData.type === 'element' && curT < 27) {
            setDiscoveryAlert({
              label: `${uData.label} is currently Dormant — Awakens in Station 2 (The Five Elements Ring)`,
              type: 'dormant'
            });
            setTimeout(() => setDiscoveryAlert(null), 3600);
            return;
          }

          if (uData.type === 'dosha' && curT < 53 && !dhongaRef.current.completed) {
            setDiscoveryAlert({
              label: `${uData.label} Sanctuary is Dormant — Awakens in Station 4 (or unlock by grinding herbs)`,
              type: 'dormant'
            });
            setTimeout(() => setDiscoveryAlert(null), 3600);
            return;
          }

          handleDiscoverConceptRef.current(uData, true);
        }
      }
    };

    const onContextMenu = (e) => {
      // Prevent context menu when right-clicking to release pestle
      if (dhongaRef.current.status === 'HELD') {
        e.preventDefault();
        handleReleasePestle();
      }
    };

    const onPointerLockChange = () => {
      isPointerLocked.current = !!(document.pointerLockElement && (document.pointerLockElement === mount || document.pointerLockElement === renderer.domElement));
    };

    const onWheel = (e) => {
      camera.fov = clamp(camera.fov + e.deltaY * 0.04, 45, 90);
      camera.updateProjectionMatrix();
    };

    mount.style.cursor = 'grab';
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    mount.addEventListener('contextmenu', onContextMenu);
    mount.addEventListener('pointerdown', onPointerDown);
    mount.addEventListener('wheel', onWheel, { passive: true });
    document.addEventListener('pointerlockchange', onPointerLockChange);

    const onResize = () => {
      const nw = mount.clientWidth, nh = mount.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', onResize);

    return () => {
      renderer.setAnimationLoop(null);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      mount.removeEventListener('contextmenu', onContextMenu);
      mount.removeEventListener('pointerdown', onPointerDown);
      mount.removeEventListener('wheel', onWheel);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      window.removeEventListener('resize', onResize);
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [condition]); // Stable mount: only runs once on condition mount!

  // ── WebXR Session Entry ───────────────────────────────────────────────────
  const handleEnterVR = async () => {
    if (!rendererRef.current || !navigator.xr) return;
    try {
      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
      });
      rendererRef.current.xr.setSession(session);
      setInVR(true);
      eventLogger.log('VR_ENTER', { sessionType: 'immersive-vr', storyId: 'ayurveda_intro_v1' });

      session.addEventListener('end', () => {
        setInVR(false);
        eventLogger.log('VR_EXIT', { sessionType: 'immersive-vr' });
      });
    } catch (e) {
      console.warn('[AC] WebXR launch failed:', e);
    }
  };

  // ── Audio Lifecycle & Unlock ──────────────────────────────────────────────
  useEffect(() => {
    const unlockAudio = () => {
      if (!audioRef.current) {
        audioRef.current = buildAyurvedaAudio();
      }
    };
    document.addEventListener('pointerdown', unlockAudio, { once: true });
    return () => {
      document.removeEventListener('pointerdown', unlockAudio);
      if (audioRef.current) audioRef.current.close();
    };
  }, []);

  const toggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    if (audioRef.current) audioRef.current.setMuted(nextMute);
    if (videoRef.current) videoRef.current.muted = nextMute;
  };

  const startExploring = () => {
    const mount = mountRef.current;
    if (mount) {
      try { mount.requestPointerLock(); } catch (_) {}
    }
    setIsExploring(true);
    setIsPaused(false);
    playVideo();
  };

  // Discovery count metrics for HUD
  const discoveredCount = useMemo(() => {
    let count = 0;
    ELEMENTS.forEach(el => { if (discoveryStates[el.id] === 'DISCOVERED' || discoveryStates[el.id] === 'UNDERSTOOD') count++; });
    DOSHAS.forEach(d => { if (discoveryStates[d.id] === 'DISCOVERED' || discoveryStates[d.id] === 'UNDERSTOOD') count++; });
    return count;
  }, [discoveryStates]);

  const pct = (currentTime / PLAYBACK_END_SEC) * 100;
  const station = STATIONS[stationIdx] || STATIONS[0];

  return (
    <div className="player-container ayurveda-player" onMouseEnter={() => setShowControls(true)} onMouseLeave={() => setShowControls(false)}>

      {/* Research Compliance Disclaimer */}
      <div className="ayurveda-disclaimer-banner">
        <span>⚠️ This experience presents a traditional Vedic knowledge system and is not medical advice.</span>
      </div>

      {/* Top Experience HUD */}
      <div className="ayurveda-hud">
        <span className="hud-dot" style={{ background: station.color }} />
        <span className="hud-label">{station.label}</span>
        <span className="hud-condition">Codex: {discoveredCount}/8 Discovered</span>
        <button className="hud-audio-btn" onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1rem', marginLeft: '8px' }}>
          {isMuted ? '🔇' : '🔊'}
        </button>
      </div>

      {/* Primary Video Element (Flat in C1-C3, Hidden Texture in C4) */}
      <video
        ref={videoRef}
        src="/videos/ayurveda_explainer.mp4"
        className={`player-canvas${condition === 'C4' ? ' video-hidden' : ''}`}
        playsInline
        muted={isMuted}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => { setPlaying(false); if (onComplete) onComplete(); }}
      />

      {/* 3D WebGL / WebXR Viewport */}
      {condition === 'C4' && (
        <div className="c4-canvas-wrapper">
          <div ref={mountRef} className="c4-mount" />

          {/* First-person crosshair */}
          <div className={`c4-crosshair${targetedObject ? ' active' : ''}`} />

          {/* Contextual Interaction Indicator (Clickable button!) */}
          {targetedObject && (
            <div
              className="c4-interaction-prompt"
              onClick={(e) => {
                e.stopPropagation();
                if (targetedObject.id === 'dhonga_pestle') {
                  if (dhongaState.status === 'HELD') handleReleasePestle();
                  else handleGrabPestle('mouse');
                } else {
                  handleDiscoverConcept(targetedObject, true);
                }
              }}
            >
              <span className="c4-prompt-key">E</span>
              <span className="c4-prompt-text">
                {targetedObject.id === 'dhonga_pestle'
                  ? (dhongaState.status === 'HELD' ? 'Put Down Pestle (Q / Right-Click)' : 'Pick Up Pestle & Grind Herbs')
                  : (discoveryStates[targetedObject.id] === 'DISCOVERED'
                    ? `Inspect ${targetedObject.label}`
                    : `Discover ${targetedObject.label}`)}
              </span>
            </div>
          )}

          {/* Real Dhonga Grinding Gesture & Progress HUD */}
          {(dhongaState.status === 'HELD' || dhongaState.status === 'GRINDING') && (
            <div className="c4-grind-hud">
              <div className="c4-grind-header">
                <span className="c4-grind-icon">🌿</span>
                <span className="c4-grind-title">Ayurvedic Herb Preparation</span>
              </div>
              <div className="c4-grind-desc">
                Move pestle in a steady circular motion inside the Dhonga bowl to crush and grind medicinal leaves.
              </div>
              <div className="c4-grind-bar-wrapper">
                <div className="c4-grind-bar-fill" style={{ width: `${Math.round(dhongaState.progress * 100)}%` }} />
              </div>
              <div className="c4-grind-meta">
                <span>Grinding Progress: <strong>{Math.round(dhongaState.progress * 100)}%</strong></span>
                <button className="c4-grind-release-btn" onClick={handleReleasePestle}>
                  Put Down Pestle [Q]
                </button>
              </div>
            </div>
          )}

          {/* Discovery Celebration / Progressive Dormant Alert */}
          {discoveryAlert && (
            <div className={`c4-discovery-banner ${discoveryAlert.type === 'dormant' ? 'c4-dormant-banner' : ''}`}>
              <div className="c4-banner-icon">
                {discoveryAlert.type === 'dormant' ? '⏳' : (discoveryAlert.type === 'dosha' ? '💎' : '✨')}
              </div>
              <div className="c4-banner-content">
                <h4>{discoveryAlert.type === 'dormant' ? 'Story Progression Gated' : 'Sacred Discovery Unlocked'}</h4>
                <h3>{discoveryAlert.label}</h3>
              </div>
            </div>
          )}

          {/* In-VR Gaze Progress HUD */}
          {gazeInfo && (
            <div className="c4-gaze-hud">
              <div className="c4-gaze-label">{gazeInfo.label}</div>
              <div className="c4-gaze-bar"><div className="c4-gaze-fill" style={{ width: `${gazeInfo.progress * 100}%` }} /></div>
              <div className="c4-gaze-hint">Keep gazing to discover…</div>
            </div>
          )}

          {/* Laptop Controls Hint (Top-Right, Never Overlaps Timeline!) */}
          <div className="c4-desktop-controls-hint">
            <span><span className="c4-key-badge">Drag Mouse</span> or <span className="c4-key-badge">←</span><span className="c4-key-badge">→</span> Look</span>
            <span><span className="c4-key-badge">W</span><span className="c4-key-badge">A</span><span className="c4-key-badge">S</span><span className="c4-key-badge">D</span> Walk</span>
            <span><span className="c4-key-badge">Click</span> or <span className="c4-key-badge">E</span> Pick Up / Interact</span>
            <span><span className="c4-key-badge">Esc</span> Pause</span>
          </div>

          {/* Bottom Toolbar */}
          <div className="c4-vr-toolbar">
            {vrSupported && (
              <button className="c4-enter-vr-btn" onClick={handleEnterVR}>
                {inVR ? '🥽 In VR' : '🥽 Enter VR'}
              </button>
            )}
            <button className="c4-play-btn" onClick={playing ? pauseVideo : playVideo}>
              {playing ? '⏸ Pause' : '▶ Play'}
            </button>
            <button className="c4-play-btn" onClick={() => { yaw.current += Math.PI / 4; if (rigRef.current) rigRef.current.rotation.set(0, yaw.current, 0); }} title="Turn camera 45° Left">
              ⟲ Turn Left
            </button>
            <button className="c4-play-btn" onClick={() => { yaw.current -= Math.PI / 4; if (rigRef.current) rigRef.current.rotation.set(0, yaw.current, 0); }} title="Turn camera 45° Right">
              Turn Right ⟳
            </button>
            <button className="c4-play-btn" onClick={() => setShowCodex(true)}>
              📖 Codex ({discoveredCount}/8)
            </button>
            <button className="c4-play-btn" onClick={() => setIsPaused(true)}>
              ⚙️ Menu
            </button>
          </div>
        </div>
      )}

      {/* Lore Info Popup Modal — Edge-Triggered & Dismissal Guarded */}
      {infoPanel && (
        <div
          className="c4-info-overlay"
          onPointerDown={e => e.stopPropagation()}
          onClick={handleDismissPanel}
        >
          <div
            className="c4-info-card"
            onPointerDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          >
            <button
              className="c4-info-close"
              onPointerDown={e => e.stopPropagation()}
              onClick={handleDismissPanel}
              aria-label="Close information panel"
            >
              ✕
            </button>
            <div className="c4-info-icon">{infoPanel.type === 'dosha' ? '💎' : '🌐'}</div>
            <h3 className="c4-info-title">{infoPanel.label}</h3>
            {infoPanel.elements && (
              <div style={{ color: '#f59e0b', fontSize: '0.88rem', fontWeight: '700', marginBottom: '8px' }}>
                Constituent Elements: {infoPanel.elements}
              </div>
            )}
            <p className="c4-info-desc">{infoPanel.desc}</p>
            <button
              className="c4-info-btn"
              onPointerDown={e => e.stopPropagation()}
              onClick={handleDismissPanel}
              style={{ marginTop: '16px', padding: '10px 24px', background: '#f59e0b', color: '#111', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}
            >
              Got It
            </button>
          </div>
        </div>
      )}

      {/* Ayurvedic Discovery Codex (Journal) Modal */}
      {showCodex && (
        <div className="c4-pause-modal-overlay" onClick={() => setShowCodex(false)}>
          <div className="c4-pause-card" onClick={e => e.stopPropagation()}>
            <div className="c4-pause-header">
              <h2>📖 Ayurvedic Discovery Codex</h2>
              <button onClick={() => setShowCodex(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.86rem' }}>
              Progressively unlock all 5 Great Elements and 3 Sacred Doshas by exploring the sanctuary during the narrative.
            </p>

            <h4 style={{ margin: '14px 0 6px', color: '#38bdf8' }}>Pancha Mahabhutas (Five Elements)</h4>
            <div className="c4-codex-grid">
              {ELEMENTS.map(el => {
                const isDisc = discoveryStates[el.id] === 'DISCOVERED' || discoveryStates[el.id] === 'UNDERSTOOD';
                return (
                  <div key={el.id} className={`c4-codex-item${isDisc ? ' discovered' : ' hidden-item'}`} style={{ '--item-color': `#${el.color.toString(16)}` }}>
                    <div className="c4-codex-icon">{isDisc ? '🌐' : '❓'}</div>
                    <div className="c4-codex-name">{isDisc ? el.label.split(' ')[0] : '???'}</div>
                    <div className="c4-codex-status">{isDisc ? 'Discovered' : 'Hidden'}</div>
                  </div>
                );
              })}
            </div>

            <h4 style={{ margin: '14px 0 6px', color: '#e76f51' }}>Tridoshas (Three Bodily Principles)</h4>
            <div className="c4-codex-grid">
              {DOSHAS.map(d => {
                const isDisc = discoveryStates[d.id] === 'DISCOVERED' || discoveryStates[d.id] === 'UNDERSTOOD';
                return (
                  <div key={d.id} className={`c4-codex-item${isDisc ? ' discovered' : ' hidden-item'}`} style={{ '--item-color': `#${d.color.toString(16)}` }}>
                    <div className="c4-codex-icon">{isDisc ? '💎' : '❓'}</div>
                    <div className="c4-codex-name">{isDisc ? d.label : '???'}</div>
                    <div className="c4-codex-status">{isDisc ? d.elements : 'Hidden'}</div>
                  </div>
                );
              })}
            </div>

            <div className="c4-pause-actions">
              <button className="c4-pause-btn primary" onClick={() => setShowCodex(false)}>
                Return to Exploration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pause Menu Modal */}
      {isPaused && (
        <div className="c4-pause-modal-overlay">
          <div className="c4-pause-card">
            <div className="c4-pause-header">
              <h2>⏸ Experience Paused</h2>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>
              Current Station: <strong>{station.label}</strong> ({formatTime(currentTime)} / {formatTime(PLAYBACK_END_SEC)})
            </p>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', margin: '16px 0' }}>
              <span>Audio:</span>
              <button className="c4-pause-btn secondary" onClick={toggleMute}>
                {isMuted ? '🔇 Unmute Sound' : '🔊 Mute Sound'}
              </button>
            </div>
            <div className="c4-pause-actions">
              <button className="c4-pause-btn primary" onClick={() => setIsPaused(false)}>
                Resume Exploration
              </button>
              <button className="c4-pause-btn secondary" onClick={() => setShowCodex(true)}>
                View Codex
              </button>
              <button className="c4-pause-btn secondary" onClick={handleRestart}>
                🔄 Restart Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Condition C3 Rich Action-Gated Interactive Overlays */}
      {condition === 'C3' && activeC3 && (
        <C3Panel interaction={activeC3} onComplete={handleC3Complete} />
      )}

      {/* Timeline Controls (C1 - C3) */}
      <div className={`player-controls${showControls ? ' visible' : ''}`}>
        <div className="ayurveda-station-track">
          {STATIONS.map((s, i) => (
            <div
              key={s.id}
              className="ayurveda-station-block"
              onClick={() => seekVideo(s.t[0])}
              title={s.label}
              style={{
                left: `${(s.t[0] / PLAYBACK_END_SEC) * 100}%`,
                width: `${((s.t[1] - s.t[0]) / PLAYBACK_END_SEC) * 100}%`,
                background: s.color,
                opacity: i === stationIdx ? 0.9 : 0.4
              }}
            />
          ))}
          <div className="ayurveda-playhead" style={{ left: `${pct}%` }} />
          {condition !== 'C4' && (
            <input
              type="range"
              className="seek-slider"
              min="0"
              max={PLAYBACK_END_SEC}
              step="0.1"
              value={currentTime}
              onChange={e => seekVideo(Number(e.target.value))}
            />
          )}
        </div>
        <div className="controls-row">
          {condition !== 'C4' && (
            <>
              <button className="control-btn" onClick={() => seekVideo(Math.max(0, currentTime - 10))}>⏪</button>
              <button className="control-btn play-btn" onClick={playing ? pauseVideo : playVideo}>
                {playing ? '⏸' : '▶'}
              </button>
              <button className="control-btn" onClick={() => seekVideo(Math.min(PLAYBACK_END_SEC, currentTime + 10))}>⏩</button>
              <button className="control-btn" onClick={toggleMute}>{isMuted ? '🔇' : '🔊'}</button>
            </>
          )}
          <span className="time-display">{formatTime(currentTime)} / {formatTime(PLAYBACK_END_SEC)}</span>
          <span className="station-label-inline" style={{ color: station.color }}>{station.label}</span>
        </div>
      </div>
    </div>
  );
}
