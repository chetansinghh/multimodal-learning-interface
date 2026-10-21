// AyurvedaCanvas.jsx — Unified Story Engine for "Ayurveda: The Science of Life"
// C1: Clean video + original audio  |  C2: Video + HRTF Spatial Audio
// C3: Video + Action-gated rich interaction overlays
// C4: Full 3D Himalayan River Valley WebXR World — particles, god-rays, gaze-dwell, XR controllers

import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { eventLogger } from '../../services/EventLogger';
import { formatTime } from '../../services/StoryLoader';
import { InteractionRenderer } from '../interactions/InteractionVerbs';
import './PlayerCommon.css';

const PLAYBACK_END_SEC = 110.2;
const GAZE_DWELL_MS = 1400;
const HEAD_ROTATION_SAMPLE_MS = 200;

const STATIONS = [
  { id: 'st1', label: 'River Bank & Banyan at Dawn',  color: '#f4a261', t: [0, 26]     },
  { id: 'st2', label: 'The Five Elements Ring',        color: '#e9c46a', t: [27, 34]    },
  { id: 'st3', label: 'Herb Garden & Mortar',          color: '#2a9d8f', t: [35, 52]    },
  { id: 'st4', label: 'Three Doshas Sanctuary',        color: '#e76f51', t: [53, 62]    },
  { id: 'st5', label: 'Sunrise River Meditation',      color: '#264653', t: [63, 70]    },
  { id: 'st6', label: 'Therapy & Balance Room',        color: '#6a4c93', t: [71, 80]    },
  { id: 'st7', label: 'Vedic Knowledge Lineage',       color: '#d4a017', t: [81, 110.2] },
];

const ELEMENTS = [
  { id: 'earth', label: 'Prithvi (Earth)', color: 0x8b5a2b, emissive: 0x3d1a00, pos: [-2.4, 1.2, -4.5], desc: 'Solid form. Governs structure and stability in the body.' },
  { id: 'water', label: 'Jala (Water)',    color: 0x3b82f6, emissive: 0x001a5e, pos: [-1.1, 1.5, -4.8], desc: 'Fluid cohesion. Governs flow, taste, and circulation.' },
  { id: 'fire',  label: 'Agni (Fire)',     color: 0xef4444, emissive: 0x6b0000, pos: [0,    1.8, -5.1], desc: 'Transformation. Governs digestion, vision, and metabolism.' },
  { id: 'air',   label: 'Vayu (Air)',      color: 0xa5b4fc, emissive: 0x1a006b, pos: [1.1,  1.5, -4.8], desc: 'Movement. Governs breath, nervous system, and circulation.' },
  { id: 'ether', label: 'Akasha (Ether)',  color: 0xfacc15, emissive: 0x5a4500, pos: [2.4,  1.2, -4.5], desc: 'Space and sound. Governs communication and consciousness.' },
];

const DOSHAS = [
  { id: 'vata',  label: 'Vata',  color: 0x7ed6df, emissive: 0x003840, pos: [-3.5, 1.8, -6], desc: 'Air + Ether. Controls movement, breath, and the nervous system.' },
  { id: 'pitta', label: 'Pitta', color: 0xff7979, emissive: 0x600000, pos: [0,    2.2, -7], desc: 'Fire + Water. Controls digestion, metabolism, and intelligence.' },
  { id: 'kapha', label: 'Kapha', color: 0x55efc4, emissive: 0x004433, pos: [3.5,  1.8, -6], desc: 'Earth + Water. Controls structure, immunity, and lubrication.' },
];

const C3_INTERACTIONS_BASE = [
  {
    id: 'c3_int_1', label: 'Tap the Sacred River',
    active_window: ['0:18', '0:26'], gate: { type: 'hold_at', hold_at: '0:23', max_wait_sec: 7 },
    type: 'tap', prompt: '🌊 Tap the sacred river to begin your Ayurvedic journey', emoji: '🌊', color: '#3b82f6',
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
    color: '#2a9d8f', emoji: '🌿',
  },
  {
    id: 'c3_int_4', label: 'Identify Your Dosha',
    active_window: ['0:53', '1:02'], gate: { type: 'hold_at', hold_at: '0:57', max_wait_sec: 7 },
    type: 'select', prompt: '🧬 Which Dosha is associated with the elements Fire and Water?',
    options: ['Vata (Air + Ether)', 'Pitta (Fire + Water)', 'Kapha (Earth + Water)', 'Sama (Balanced)'], correct: 1,
    color: '#e76f51', emoji: '🧬',
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

// ── Build 3D World ────────────────────────────────────────────────────────────
function buildAyurvedaWorld(scene, refs) {
  scene.background = new THREE.Color(0x1a0a2e);

  const hemi = new THREE.HemisphereLight(0xfff4e0, 0x2a1a00, 0.6);
  scene.add(hemi);
  refs.hemi = hemi;

  const sun = new THREE.DirectionalLight(0xffb347, 2.2);
  sun.position.set(18, 28, -22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  scene.add(sun);
  refs.sun = sun;

  // Ground with subtle displacement
  const groundGeom = new THREE.PlaneGeometry(200, 200, 40, 40);
  const gverts = groundGeom.attributes.position;
  for (let i = 0; i < gverts.count; i++) {
    const x = gverts.getX(i), z = gverts.getZ(i);
    const dist = Math.sqrt(x * x + z * z);
    gverts.setY(i, Math.sin(x * 0.08) * 0.5 + Math.sin(z * 0.06) * 0.4 + (dist > 20 ? (dist - 20) * 0.04 : 0));
  }
  gverts.needsUpdate = true;
  groundGeom.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeom, new THREE.MeshLambertMaterial({ color: 0xc4a47c }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Sacred River
  const river = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 200, 20, 2),
    new THREE.MeshPhongMaterial({ color: 0x5b9dc9, emissive: 0x0a2a40, transparent: true, opacity: 0.82, shininess: 120 })
  );
  river.rotation.x = -Math.PI / 2;
  river.position.set(-14, 0.08, 0);
  scene.add(river);
  refs.river = river;

  // River banks
  for (const side of [-1, 1]) {
    const bank = new THREE.Mesh(
      new THREE.BoxGeometry(3.5, 0.18, 200),
      new THREE.MeshLambertMaterial({ color: 0xe8d5b0 })
    );
    bank.position.set(-14 + side * 10, 0.04, 0);
    scene.add(bank);
  }

  // Giant Banyan trunk
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 2.2, 9, 18),
    new THREE.MeshLambertMaterial({ color: 0x4a2e12 })
  );
  trunk.position.set(3, 4.5, -10);
  trunk.castShadow = true;
  scene.add(trunk);

  // Banyan canopy layers
  [[0, 10, -10, 7], [-4, 8, -13, 5], [4, 8, -7, 5], [0, 13, -10, 4.5]].forEach(([x, y, z, r]) => {
    const c = new THREE.Mesh(
      new THREE.SphereGeometry(r, 14, 10),
      new THREE.MeshLambertMaterial({ color: 0x2d5a1b })
    );
    c.position.set(x, y, z);
    c.castShadow = true;
    scene.add(c);
  });

  // Aerial roots
  for (let i = 0; i < 8; i++) {
    const r = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.09, 3 + Math.random() * 3, 6),
      new THREE.MeshLambertMaterial({ color: 0x5a3d22 })
    );
    r.position.set(3 + (Math.random() - 0.5) * 8, 3 + Math.random() * 2, -10 + (Math.random() - 0.5) * 8);
    scene.add(r);
  }

  // Temple Ghat steps
  for (let s = 0; s < 5; s++) {
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(8, 0.22, 1.2),
      new THREE.MeshLambertMaterial({ color: 0xd4c5a0 })
    );
    step.position.set(-6, s * 0.22, -2 + s * 1.2);
    step.receiveShadow = true;
    scene.add(step);
  }

  // Herb plants
  refs.herbs = [];
  for (let i = 0; i < 12; i++) {
    const h = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 0.6 + Math.random() * 0.5, 6),
      new THREE.MeshLambertMaterial({ color: 0x228b22 })
    );
    h.position.set(4 + (Math.random() - 0.5) * 5, 0.4, 2 + (Math.random() - 0.5) * 4);
    scene.add(h);
    refs.herbs.push(h);
  }

  // Wooden table
  const table = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.7, 1.0),
    new THREE.MeshLambertMaterial({ color: 0x7a4f2f })
  );
  table.position.set(2, 0.35, -1.5);
  table.castShadow = true;
  scene.add(table);

  // Mortar
  const mortarMat = new THREE.MeshPhongMaterial({ color: 0x6b6b7b, shininess: 60 });
  const mortar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.28, 0.35, 16), mortarMat);
  mortar.position.set(2, 1.05, -1.5);
  mortar.castShadow = true;
  scene.add(mortar);
  refs.mortar = mortar;
  const pestle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 0.8, 8), mortarMat);
  pestle.position.set(2.15, 1.45, -1.45);
  pestle.rotation.z = 0.4;
  scene.add(pestle);
  refs.pestle = pestle;

  // Herb jars
  refs.herbJars = [];
  [[-0.55, 0xe8c547], [0, 0x5bc47c], [0.55, 0xe87d4e]].forEach(([dx, col], i) => {
    const jar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.08, 0.22, 10),
      new THREE.MeshPhongMaterial({ color: col, transparent: true, opacity: 0.82, shininess: 80 })
    );
    jar.position.set(2 + dx, 0.82, -1.5);
    scene.add(jar);
    refs.herbJars.push(jar);
  });

  // Lotus pond
  const pond = new THREE.Mesh(
    new THREE.CircleGeometry(3.5, 32),
    new THREE.MeshPhongMaterial({ color: 0x3d7dbf, emissive: 0x001a2e, transparent: true, opacity: 0.78, shininess: 90 })
  );
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(7, 0.06, 3);
  scene.add(pond);
  refs.pond = pond;

  // Lotus flowers
  refs.lotuses = [];
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2;
    const lotus = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffb7c5 })
    );
    lotus.position.set(7 + Math.cos(ang) * 2.2, 0.14, 3 + Math.sin(ang) * 2.2);
    scene.add(lotus);
    refs.lotuses.push(lotus);
  }

  // 5 Elemental Orbs (interactive)
  refs.elementOrbs = [];
  ELEMENTS.forEach((el, idx) => {
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 22, 16),
      new THREE.MeshPhongMaterial({ color: el.color, emissive: el.emissive, emissiveIntensity: 0.6, shininess: 100, transparent: true, opacity: 0.92 })
    );
    orb.position.set(...el.pos);
    orb.userData = { type: 'element', ...el };
    scene.add(orb);
    refs.elementOrbs.push(orb);

    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.38, 0.48, 32),
      new THREE.MeshBasicMaterial({ color: el.color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
    );
    halo.position.set(...el.pos);
    halo.lookAt(0, el.pos[1], 5);
    scene.add(halo);
    refs[`halo_el_${idx}`] = halo;
  });

  // 3 Dosha crystals (interactive)
  refs.doshaObjects = [];
  DOSHAS.forEach((d) => {
    const crystMat = new THREE.MeshPhongMaterial({ color: d.color, emissive: d.emissive, emissiveIntensity: 0.8, transparent: true, opacity: 0.85, shininess: 200 });
    const cryst = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 1.4, 6), crystMat);
    cryst.position.set(...d.pos);
    cryst.userData = { type: 'dosha', ...d };
    scene.add(cryst);
    refs.doshaObjects.push(cryst);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 6), crystMat);
    cap.position.set(d.pos[0], d.pos[1] + 0.9, d.pos[2]);
    scene.add(cap);
  });

  // Sacred fire (Havan Kund)
  const fireBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.25, 0.6),
    new THREE.MeshLambertMaterial({ color: 0x5a4a3a })
  );
  fireBase.position.set(-1, 0.13, -2.5);
  scene.add(fireBase);
  const fireLight = new THREE.PointLight(0xff6600, 2.5, 6);
  fireLight.position.set(-1, 0.8, -2.5);
  scene.add(fireLight);
  refs.fireLight = fireLight;

  // Fire particles
  const FIRE_COUNT = 80;
  const fPos = new Float32Array(FIRE_COUNT * 3);
  const fPhase = new Float32Array(FIRE_COUNT);
  for (let i = 0; i < FIRE_COUNT; i++) {
    fPos[i*3] = -1 + (Math.random()-.5)*.3; fPos[i*3+1] = .3+Math.random()*.9; fPos[i*3+2] = -2.5+(Math.random()-.5)*.3;
    fPhase[i] = Math.random()*Math.PI*2;
  }
  const fGeom = new THREE.BufferGeometry();
  fGeom.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
  const firePts = new THREE.Points(fGeom, new THREE.PointsMaterial({ size: 0.09, color: 0xff7700, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(firePts);
  refs.fire = firePts; refs.fPos = fPos; refs.fPhase = fPhase; refs.fGeom = fGeom;

  // Firefly / pollen particles
  const PC = 420;
  const pPos = new Float32Array(PC*3), pPhase = new Float32Array(PC), pCol = new Float32Array(PC*3);
  for (let i = 0; i < PC; i++) {
    pPos[i*3]=(Math.random()-.5)*40; pPos[i*3+1]=Math.random()*8+.3; pPos[i*3+2]=(Math.random()-.5)*40;
    pPhase[i]=Math.random()*Math.PI*2;
    const g = Math.random() > .5;
    pCol[i*3]=g?1:.6; pCol[i*3+1]=g?.85:1; pCol[i*3+2]=g?.2:.4;
  }
  const pGeom = new THREE.BufferGeometry();
  pGeom.setAttribute('position', new THREE.BufferAttribute(pPos,3));
  pGeom.setAttribute('color', new THREE.BufferAttribute(pCol,3));
  const pPts = new THREE.Points(pGeom, new THREE.PointsMaterial({ size:.12, vertexColors:true, transparent:true, opacity:.8, depthWrite:false, blending:THREE.AdditiveBlending, sizeAttenuation:true }));
  scene.add(pPts);
  refs.particles=pPts; refs.pPos=pPos; refs.pPhase=pPhase; refs.pGeom=pGeom;

  // Smoke wisps
  const SC = 30;
  const sPos = new Float32Array(SC*3);
  for (let i = 0; i < SC; i++) { sPos[i*3]=(Math.random()-.5)*2; sPos[i*3+1]=1.1+Math.random()*3; sPos[i*3+2]=-1+(Math.random()-.5); }
  const sGeom = new THREE.BufferGeometry();
  sGeom.setAttribute('position', new THREE.BufferAttribute(sPos,3));
  const smokePts = new THREE.Points(sGeom, new THREE.PointsMaterial({ color:0xffeedd, size:.22, transparent:true, opacity:.18, depthWrite:false, blending:THREE.AdditiveBlending }));
  scene.add(smokePts);
  refs.smoke=smokePts; refs.sPos=sPos; refs.sGeom=sGeom;

  // Distant mountains
  [[-80, 0x9ba8c2], [-100, 0x7a88a6], [-120, 0x5d6f88]].forEach(([mz, mc], mi) => {
    for (let p = 0; p < 5; p++) {
      const mh = 20+Math.random()*25;
      const mt = new THREE.Mesh(new THREE.ConeGeometry((20+Math.random()*15)*.5, mh, 6), new THREE.MeshBasicMaterial({ color: mc }));
      mt.position.set(-40+p*20, mh*.5-3, mz-mi*15);
      scene.add(mt);
    }
  });

  // Stars
  const STAR_COUNT = 800;
  const starPos = new Float32Array(STAR_COUNT*3);
  for (let i = 0; i < STAR_COUNT; i++) {
    const theta=Math.random()*Math.PI*2, phi=Math.acos(2*Math.random()-1), r=150;
    starPos[i*3]=r*Math.sin(phi)*Math.cos(theta); starPos[i*3+1]=r*Math.sin(phi)*Math.sin(theta); starPos[i*3+2]=r*Math.cos(phi);
  }
  const starGeom = new THREE.BufferGeometry();
  starGeom.setAttribute('position', new THREE.BufferAttribute(starPos,3));
  const stars = new THREE.Points(starGeom, new THREE.PointsMaterial({ color:0xffffff, size:.45, transparent:true, opacity:.7, depthWrite:false }));
  scene.add(stars);
  refs.stars = stars;
}

// ── Animate World ─────────────────────────────────────────────────────────────
function updateAyurvedaWorld(t, delta, refs) {
  const now = performance.now() * .001;
  const sky = clamp(t / 110, 0, 1);

  if (refs.hemi) {
    refs.hemi.color.lerpColors(new THREE.Color(0x1a0a2e), new THREE.Color(0xfff4c2), easeInOut(sky));
  }
  if (refs.sun) {
    refs.sun.intensity = 0.8 + easeInOut(sky) * 1.8;
    refs.sun.position.set(18 - sky * 30, 28 * easeInOut(clamp((sky-.05)/.7,0,1)), -22 + sky*10);
  }
  if (refs.river) refs.river.position.y = 0.08 + Math.sin(now*1.4)*0.015;
  if (refs.pond)  refs.pond.position.y  = 0.06 + Math.sin(now*0.8+1.2)*0.01;
  if (refs.lotuses) refs.lotuses.forEach((l,i) => { l.position.y = 0.14+Math.sin(now*.7+i*1.2)*.03; });
  if (refs.elementOrbs) refs.elementOrbs.forEach((o,i) => {
    o.position.y = ELEMENTS[i].pos[1]+Math.sin(now*.8+i*1.26)*.18;
    o.rotation.y += delta*.9;
    o.material.emissiveIntensity = .5+Math.sin(now*2+i*1.26)*.3;
  });
  if (refs.doshaObjects) refs.doshaObjects.forEach((c,i) => {
    c.rotation.y += delta*(.4+i*.15);
    c.material.emissiveIntensity = .6+Math.sin(now*1.5+i*2.1)*.35;
  });
  if (refs.herbJars) refs.herbJars.forEach((j,i) => { j.rotation.y = Math.sin(now*.5+i)*.12; });
  if (refs.pestle) refs.pestle.rotation.z = 0.4+Math.sin(now*2.5)*.15;
  if (refs.fireLight) refs.fireLight.intensity = 2+Math.sin(now*8.3)*.6+Math.sin(now*13.7)*.3;

  if (refs.fPos && refs.fGeom) {
    const n = refs.fPos.length/3;
    for (let i = 0; i < n; i++) {
      refs.fPos[i*3+1] += delta*(.4+Math.sin(refs.fPhase[i]+now*3)*.3);
      refs.fPos[i*3]   += Math.sin(now*2.1+refs.fPhase[i])*delta*.08;
      if (refs.fPos[i*3+1]>1.8){ refs.fPos[i*3]=-1+(Math.random()-.5)*.28; refs.fPos[i*3+1]=.28; refs.fPos[i*3+2]=-2.5+(Math.random()-.5)*.28; }
    }
    refs.fGeom.attributes.position.needsUpdate=true;
  }
  if (refs.pPos && refs.pGeom) {
    const n = refs.pPos.length/3;
    for (let i = 0; i < n; i++) {
      refs.pPos[i*3]   += Math.sin(now*.5+refs.pPhase[i])*delta*.15;
      refs.pPos[i*3+1] += Math.sin(now*.3+refs.pPhase[i]*1.3)*delta*.1;
      refs.pPos[i*3+2] += Math.cos(now*.4+refs.pPhase[i]*.7)*delta*.12;
      if (refs.pPos[i*3+1]>10) refs.pPos[i*3+1]=.3;
      if (refs.pPos[i*3+1]<.2) refs.pPos[i*3+1]=.3;
    }
    refs.pGeom.attributes.position.needsUpdate=true;
  }
  if (refs.sPos && refs.sGeom) {
    const n = refs.sPos.length/3;
    for (let i = 0; i < n; i++) {
      refs.sPos[i*3+1]+=delta*.25;
      refs.sPos[i*3]+=Math.sin(now+i)*delta*.04;
      if (refs.sPos[i*3+1]>5.5){ refs.sPos[i*3]=(Math.random()-.5)*1.5; refs.sPos[i*3+1]=1; refs.sPos[i*3+2]=-1.2+(Math.random()-.5)*.6; }
    }
    refs.sGeom.attributes.position.needsUpdate=true;
  }
  if (refs.stars) refs.stars.material.opacity = clamp(.7-sky*1.5,0,.7);
}

// ── Spatial Audio Engine (C2 + C4) ───────────────────────────────────────────
function buildAudioEngine() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const master = ctx.createGain(); master.gain.value=.5; master.connect(ctx.destination);

    // Reverb
    const rl=ctx.sampleRate*2.5, rb=ctx.createBuffer(2,rl,ctx.sampleRate);
    for(let ch=0;ch<2;ch++){const d=rb.getChannelData(ch);for(let i=0;i<rl;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/rl,2.5);}
    const rev=ctx.createConvolver(); rev.buffer=rb;
    const rg=ctx.createGain(); rg.gain.value=.28; rev.connect(rg); rg.connect(master);

    // River
    const nb=ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate);
    {const d=nb.getChannelData(0);for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;}
    const rs=ctx.createBufferSource(); rs.buffer=nb; rs.loop=true;
    const rf=ctx.createBiquadFilter(); rf.type='bandpass'; rf.frequency.value=800; rf.Q.value=.4;
    const rg2=ctx.createGain(); rg2.gain.value=.22;
    const rp=ctx.createStereoPanner?ctx.createStereoPanner():null; if(rp) rp.pan.value=-.7;
    rs.connect(rf); rf.connect(rg2);
    if(rp){rg2.connect(rp);rp.connect(master);rp.connect(rev);}else rg2.connect(master);
    rs.start();

    // Wind
    const ws=ctx.createBufferSource(); ws.buffer=nb; ws.loop=true;
    const wf=ctx.createBiquadFilter(); wf.type='lowpass'; wf.frequency.value=250;
    const wg=ctx.createGain(); wg.gain.value=.12;
    const wp=ctx.createStereoPanner?ctx.createStereoPanner():null; if(wp) wp.pan.value=.4;
    ws.connect(wf); wf.connect(wg);
    if(wp){wg.connect(wp);wp.connect(master);}else wg.connect(master);
    ws.start();

    // Singing bowl 528Hz
    const bo1=ctx.createOscillator(), bo2=ctx.createOscillator();
    bo1.type='triangle'; bo1.frequency.value=528;
    bo2.type='sine'; bo2.frequency.value=1056;
    const bg=ctx.createGain(); bg.gain.value=.06;
    bo1.connect(bg); bo2.connect(bg); bg.connect(master); bg.connect(rev);
    bo1.start(); bo2.start();

    // Stochastic bird chirps
    const chirp=()=>{
      if(!ctx||ctx.state==='closed') return;
      const o=ctx.createOscillator(), g=ctx.createGain();
      const f=1800+Math.random()*1200;
      o.type='sine'; o.frequency.setValueAtTime(f,ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(f*1.3,ctx.currentTime+.08);
      o.frequency.exponentialRampToValueAtTime(f*.9,ctx.currentTime+.2);
      g.gain.setValueAtTime(0,ctx.currentTime);
      g.gain.linearRampToValueAtTime(.08,ctx.currentTime+.03);
      g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.25);
      o.connect(g); g.connect(master); o.start(ctx.currentTime); o.stop(ctx.currentTime+.28);
      setTimeout(chirp,1800+Math.random()*4000);
    };
    chirp();

    return { ctx, master };
  } catch(e) { console.warn('[AyurvedaAudio]',e); return null; }
}

// ── C3 Panel UI ───────────────────────────────────────────────────────────────
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
      const p = clamp((performance.now()-holdStartRef.current)/DUR,0,1);
      setHoldProgress(p);
      if (p >= 1) { clearInterval(holdRef.current); setIsHolding(false); onComplete(interaction.id); }
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
    setFeedback(ok?'correct':'wrong');
    eventLogger.log('C3_ANSWER',{interactionId:interaction.id,selected:idx,correct:interaction.correct,isCorrect:ok});
    setTimeout(()=>{if(ok) onComplete(interaction.id); else{setFeedback(null);setSelectedIdx(null);}},1200);
  };
  const handleTap = () => { setTapped(true); setTimeout(()=>onComplete(interaction.id),400); };

  return (
    <div className="c3-panel-overlay" style={{'--c3accent':interaction.color||'#f4a261'}}>
      <div className="c3-panel-card">
        <div className="c3-panel-emoji">{interaction.emoji||'✨'}</div>
        <p className="c3-panel-prompt">{interaction.prompt}</p>

        {interaction.type==='tap'&&(
          <button className={`c3-tap-btn${tapped?' tapped':''}`} onClick={handleTap} style={{background:interaction.color}}>
            {tapped?'✓ Done!':'👆 Tap Here'}
          </button>
        )}

        {interaction.type==='hold'&&(
          <div className="c3-hold-area">
            <div className="c3-hold-btn" onPointerDown={startHold} onPointerUp={stopHold} onPointerLeave={stopHold} style={{background:interaction.color}}>
              <svg viewBox="0 0 100 100" className="c3-hold-ring">
                <circle cx="50" cy="50" r="44" stroke="rgba(255,255,255,0.2)" strokeWidth="6" fill="none"/>
                <circle cx="50" cy="50" r="44" stroke="white" strokeWidth="6" fill="none"
                  strokeDasharray={`${holdProgress*276.46} 276.46`} strokeLinecap="round" transform="rotate(-90 50 50)"/>
              </svg>
              <span className="c3-hold-label">{holdProgress>=1?'✓':isHolding?`${Math.round(holdProgress*100)}%`:'HOLD'}</span>
            </div>
          </div>
        )}

        {interaction.type==='select'&&interaction.options&&(
          <div className="c3-options-grid">
            {interaction.options.map((opt,i)=>(
              <button key={i} className={`c3-option-btn${selectedIdx===i?(feedback==='correct'?' correct':' wrong'):''}${selectedIdx!==null&&i===interaction.correct&&feedback==='wrong'?' correct-reveal':''}`}
                onClick={()=>handleSelect(i)} disabled={!!feedback}>
                <span className="c3-opt-letter">{String.fromCharCode(65+i)}</span>
                <span className="c3-opt-text">{opt}</span>
              </button>
            ))}
          </div>
        )}

        {feedback&&<div className={`c3-feedback-banner ${feedback}`}>{feedback==='correct'?'✓ Correct! Well done!':'✗ Try again…'}</div>}
      </div>
    </div>
  );
}

// ── C4 Info Popup ─────────────────────────────────────────────────────────────
function C4InfoPanel({ info, onClose }) {
  if (!info) return null;
  return (
    <div className="c4-info-overlay" onClick={onClose}>
      <div className="c4-info-card" onClick={e=>e.stopPropagation()}>
        <button className="c4-info-close" onClick={onClose}>✕</button>
        <div className="c4-info-icon">{info.type==='element'?'🌐':'💎'}</div>
        <h3 className="c4-info-title">{info.label}</h3>
        <p className="c4-info-desc">{info.desc}</p>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AyurvedaCanvas({ condition='C1', storyConfig, onComplete }) {
  const mountRef  = useRef(null);
  const videoRef  = useRef(null);
  const rendererRef = useRef(null);
  const camRef    = useRef(null);
  const worldRefs = useRef({});
  const audioRef  = useRef(null);
  const gazeTimes = useRef({});
  const lastHead  = useRef(0);
  const isDown    = useRef(false);
  const prevPtr   = useRef({x:0,y:0});
  const yaw       = useRef(0);
  const pitch     = useRef(0);

  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying]         = useState(false);
  const [isMuted, setIsMuted]         = useState(false);
  const [vrSupported, setVrSupported] = useState(false);
  const [inVR, setInVR]               = useState(false);
  const [stationIdx, setStationIdx]   = useState(0);
  const [gazeInfo, setGazeInfo]       = useState(null);
  const [infoPanel, setInfoPanel]     = useState(null);
  const [showControls, setShowControls] = useState(true);
  const [activeC3, setActiveC3]       = useState(null);
  const [completedC3, setCompletedC3] = useState(new Set());

  const currentTimeRef = useRef(0);
  const playingRef     = useRef(false);
  const conditionRef   = useRef(condition);
  const waitingC3      = useRef(false);
  conditionRef.current = condition;

  // Shuffle C3 options on mount
  const [c3List] = useState(() => C3_INTERACTIONS_BASE.map(item => {
    if (item.type==='select'&&item.options) {
      const ct = item.options[item.correct];
      const sh = [...item.options].sort(()=>Math.random()-.5);
      return {...item, options:sh, correct:sh.indexOf(ct)};
    }
    return {...item};
  }));

  // ── Video helpers ──────────────────────────────────────────────────────────
  const playVideo = useCallback(()=>{
    if(!videoRef.current) return;
    videoRef.current.play().then(()=>{
      setPlaying(true); playingRef.current=true;
      if(audioRef.current?.ctx?.state==='suspended') audioRef.current.ctx.resume();
      eventLogger.log('VIDEO_START',{videoTimestamp:currentTimeRef.current,condition:conditionRef.current});
    }).catch(e=>console.warn('[AC] play blocked:',e));
  },[]);

  const pauseVideo = useCallback(()=>{
    if(!videoRef.current) return;
    videoRef.current.pause(); setPlaying(false); playingRef.current=false;
    eventLogger.log('VIDEO_PAUSE',{videoTimestamp:currentTimeRef.current,condition:conditionRef.current});
  },[]);

  const seekVideo = useCallback((time)=>{
    const t=clamp(time,0,PLAYBACK_END_SEC);
    if(videoRef.current) videoRef.current.currentTime=t;
    setCurrentTime(t); currentTimeRef.current=t;
  },[]);

  // ── C3 Check ──────────────────────────────────────────────────────────────
  const checkC3 = useCallback((t)=>{
    if(conditionRef.current!=='C3') return;
    const active = c3List.find(item=>{
      const [sm,ss]=item.active_window[0].split(':').map(Number);
      const [em,es]=item.active_window[1].split(':').map(Number);
      return t>=sm*60+ss && t<=em*60+es && !completedC3.has(item.id);
    });
    setActiveC3(active||null);
    if(active?.gate?.type==='hold_at'){
      const [hm,hs]=active.gate.hold_at.split(':').map(Number);
      const holdSec=hm*60+hs;
      if(t>=holdSec&&!completedC3.has(active.id)&&!waitingC3.current){
        waitingC3.current=true;
        if(videoRef.current) videoRef.current.pause();
        setPlaying(false); playingRef.current=false;
        eventLogger.log('C3_GATE_OPEN',{videoTimestamp:t,interactionId:active.id});
        setTimeout(()=>{
          if(waitingC3.current){
            waitingC3.current=false;
            eventLogger.log('C3_GATE_TIMEOUT',{interactionId:active.id});
            if(videoRef.current) videoRef.current.play();
            setPlaying(true); playingRef.current=true;
          }
        },(active.gate.max_wait_sec||7)*1000);
      }
    }
  },[c3List,completedC3]);

  const handleC3Complete = useCallback((id)=>{
    setCompletedC3(prev=>new Set(prev).add(id)); setActiveC3(null);
    eventLogger.log('C3_COMPLETE',{videoTimestamp:currentTimeRef.current,interactionId:id});
    if(waitingC3.current){ waitingC3.current=false; if(videoRef.current) videoRef.current.play(); setPlaying(true); playingRef.current=true; }
  },[]);

  // ── Time Update ───────────────────────────────────────────────────────────
  const handleTimeUpdate = ()=>{
    if(!videoRef.current) return;
    const t=videoRef.current.currentTime;
    setCurrentTime(t); currentTimeRef.current=t;
    const si=STATIONS.findIndex(s=>t>=s.t[0]&&t<=s.t[1]); if(si>=0) setStationIdx(si);
    checkC3(t);
    if(t>=PLAYBACK_END_SEC){
      videoRef.current.pause(); setPlaying(false); playingRef.current=false;
      eventLogger.log('VIDEO_COMPLETE',{videoTimestamp:PLAYBACK_END_SEC}); if(onComplete) onComplete();
    }
  };

  // ── C4 Three.js Scene ─────────────────────────────────────────────────────
  useEffect(()=>{
    if(condition!=='C4') return;
    const mount=mountRef.current; if(!mount) return;
    const w=mount.clientWidth||960, h=mount.clientHeight||540;

    const scene=new THREE.Scene();
    scene.fog=new THREE.FogExp2(0x4a2a0a,.018);

    const camera=new THREE.PerspectiveCamera(80,w/h,.05,600);
    const rig=new THREE.Group(); rig.position.set(0,1.62,4); rig.add(camera); scene.add(rig);
    camRef.current=camera;

    const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    renderer.setSize(w,h); renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    renderer.xr.enabled=true; renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.18;
    try { renderer.outputColorSpace=THREE.SRGBColorSpace; } catch(_) {}
    mount.appendChild(renderer.domElement); rendererRef.current=renderer;

    if(navigator.xr) navigator.xr.isSessionSupported('immersive-vr').then(s=>setVrSupported(s)).catch(()=>{});

    buildAyurvedaWorld(scene, worldRefs.current);

    // Video texture panel
    if(videoRef.current){
      const vt=new THREE.VideoTexture(videoRef.current);
      try { vt.colorSpace=THREE.SRGBColorSpace; } catch(_) {}
      const vp=new THREE.Mesh(new THREE.PlaneGeometry(4.2,2.36), new THREE.MeshBasicMaterial({map:vt}));
      vp.position.set(0,2.6,-5.5); scene.add(vp); worldRefs.current.vidPlane=vp;

      // Gold frame
      const fg=new THREE.EdgesGeometry(new THREE.BoxGeometry(4.4,2.56,.05));
      const fl=new THREE.LineSegments(fg, new THREE.LineBasicMaterial({color:0xd4a017}));
      fl.position.set(0,2.6,-5.5); scene.add(fl);

      [[2.2,1.3],[-2.2,1.3],[2.2,-1.3],[-2.2,-1.3]].forEach(([cx,cy])=>{
        const d=new THREE.Mesh(new THREE.SphereGeometry(.06,8,6),new THREE.MeshBasicMaterial({color:0xffd700}));
        d.position.set(cx,2.6+cy,-5.48); scene.add(d);
      });
    }

    // Gaze reticle
    const reticle=new THREE.Group();
    reticle.add(new THREE.Mesh(new THREE.RingGeometry(.018,.026,48),new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,transparent:true,opacity:.9,depthTest:false})));
    reticle.add(new THREE.Mesh(new THREE.CircleGeometry(.005,16),new THREE.MeshBasicMaterial({color:0xffd700,depthTest:false})));
    reticle.position.set(0,0,-1.5); camera.add(reticle); worldRefs.current.reticle=reticle;

    // Gaze progress arc mesh
    const gArcMat=new THREE.MeshBasicMaterial({color:0x22ffaa,side:THREE.DoubleSide,transparent:true,opacity:.95,depthTest:false});
    const gArc=new THREE.Mesh(new THREE.RingGeometry(.028,.034,48),gArcMat);
    gArc.scale.setScalar(0); reticle.add(gArc); worldRefs.current.gazeArc=gArc; worldRefs.current.gazeArcMat=gArcMat;

    const interactables=[...(worldRefs.current.elementOrbs||[]),...(worldRefs.current.doshaObjects||[])];
    worldRefs.current.interactables=interactables;

    // XR controllers with laser beams
    renderer.xr.addEventListener('sessionstart',()=>{
      [0,1].forEach(i=>{
        const ctrl=renderer.xr.getController(i); scene.add(ctrl);
        const laserGeom=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),new THREE.Vector3(0,0,-8)]);
        ctrl.add(new THREE.Line(laserGeom,new THREE.LineBasicMaterial({color:i===0?0xff6600:0x00aaff})));
        ctrl.addEventListener('selectstart',()=>{
          const ray=new THREE.Raycaster();
          const tm=new THREE.Matrix4(); tm.identity().extractRotation(ctrl.matrixWorld);
          ray.ray.origin.setFromMatrixPosition(ctrl.matrixWorld); ray.ray.direction.set(0,0,-1).applyMatrix4(tm);
          const hits=ray.intersectObjects(interactables,false);
          if(hits.length>0&&hits[0].object.userData?.id){
            const ud=hits[0].object.userData;
            eventLogger.log('XR_SELECT',{objectId:ud.id,type:ud.type});
            setInfoPanel({label:ud.label,desc:ud.desc,type:ud.type});
          }
        });
      });
    });

    let last=performance.now();
    const animate=()=>{
      const now=performance.now(), d=Math.min((now-last)/1000,.08); last=now;
      const t=currentTimeRef.current;
      updateAyurvedaWorld(t,d,worldRefs.current);
      if(worldRefs.current.vidPlane&&videoRef.current) worldRefs.current.vidPlane.material.map.needsUpdate=true;

      // Gaze raycasting
      const ray=new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(0,0),camera);
      const hits=ray.intersectObjects(interactables,false);
      if(hits.length>0){
        const obj=hits[0].object; const id=obj.userData?.id;
        if(id){
          if(!gazeTimes.current[id]) gazeTimes.current[id]=now;
          const prog=clamp((now-gazeTimes.current[id])/GAZE_DWELL_MS,0,1);
          setGazeInfo({id,progress:prog,label:obj.userData.label});
          if(worldRefs.current.gazeArc){ worldRefs.current.gazeArc.scale.setScalar(1); worldRefs.current.gazeArc.rotation.z=-Math.PI/2; }
          if(prog>=1){
            gazeTimes.current[id]=null;
            eventLogger.log('GAZE_DWELL',{objectId:id,type:obj.userData.type,videoTimestamp:t});
            setInfoPanel({label:obj.userData.label,desc:obj.userData.desc,type:obj.userData.type});
            setGazeInfo(null);
          }
        }
      } else {
        Object.keys(gazeTimes.current).forEach(k=>{ gazeTimes.current[k]=null; });
        setGazeInfo(null);
        if(worldRefs.current.gazeArc) worldRefs.current.gazeArc.scale.setScalar(0);
      }

      // Head rotation log
      if(now-lastHead.current>HEAD_ROTATION_SAMPLE_MS&&playingRef.current){
        lastHead.current=now;
        eventLogger.log('HEAD_ROTATION',{videoTimestamp:t,extra:{yaw:(yaw.current*180/Math.PI).toFixed(1),pitch:(pitch.current*180/Math.PI).toFixed(1)}});
      }
      renderer.render(scene,camera);
    };
    renderer.setAnimationLoop(animate);

    const onResize=()=>{ const nw=mount.clientWidth,nh=mount.clientHeight; camera.aspect=nw/nh; camera.updateProjectionMatrix(); renderer.setSize(nw,nh); };
    window.addEventListener('resize',onResize);

    // Click interaction (desktop)
    const onClick=(e)=>{
      const rect=mount.getBoundingClientRect();
      const nx=((e.clientX-rect.left)/rect.width)*2-1, ny=-((e.clientY-rect.top)/rect.height)*2+1;
      const r2=new THREE.Raycaster(); r2.setFromCamera(new THREE.Vector2(nx,ny),camera);
      const h=r2.intersectObjects(interactables,false);
      if(h.length>0&&h[0].object.userData?.id){
        const ud=h[0].object.userData;
        eventLogger.log('C4_CLICK',{objectId:ud.id}); setInfoPanel({label:ud.label,desc:ud.desc,type:ud.type});
      }
    };

    const onPD=(e)=>{ if(conditionRef.current!=='C4') return; isDown.current=true; prevPtr.current={x:e.clientX,y:e.clientY}; mount.style.cursor='grabbing'; };
    const onPM=(e)=>{ if(!isDown.current) return; const dx=e.clientX-prevPtr.current.x,dy=e.clientY-prevPtr.current.y; yaw.current-=dx*.004; pitch.current=clamp(pitch.current-dy*.003,-1.1,.9); camera.rotation.set(pitch.current,yaw.current,0,'YXZ'); prevPtr.current={x:e.clientX,y:e.clientY}; };
    const onPU=()=>{ isDown.current=false; mount.style.cursor='grab'; };
    mount.style.cursor='grab';
    mount.addEventListener('pointerdown',onPD); window.addEventListener('pointermove',onPM); window.addEventListener('pointerup',onPU); mount.addEventListener('click',onClick);

    return ()=>{
      renderer.setAnimationLoop(null);
      window.removeEventListener('resize',onResize);
      mount.removeEventListener('pointerdown',onPD); window.removeEventListener('pointermove',onPM); window.removeEventListener('pointerup',onPU); mount.removeEventListener('click',onClick);
      if(renderer.domElement.parentNode===mount) mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  },[condition]);

  // ── C2/C4 Spatial Audio ───────────────────────────────────────────────────
  useEffect(()=>{
    if(condition!=='C2'&&condition!=='C4') return;
    const init=()=>{ if(!audioRef.current) audioRef.current=buildAudioEngine(); };
    document.addEventListener('pointerdown',init,{once:true});
    return ()=>document.removeEventListener('pointerdown',init);
  },[condition]);

  // ── WebXR ─────────────────────────────────────────────────────────────────
  const handleEnterVR=async()=>{
    if(!rendererRef.current||!navigator.xr) return;
    try{
      const s=await navigator.xr.requestSession('immersive-vr',{optionalFeatures:['local-floor','bounded-floor','hand-tracking']});
      rendererRef.current.xr.setSession(s); setInVR(true);
      eventLogger.log('VR_ENTER',{sessionType:'immersive-vr',storyId:'ayurveda_intro_v1'});
      s.addEventListener('end',()=>{ setInVR(false); eventLogger.log('VR_EXIT',{sessionType:'immersive-vr'}); });
    }catch(e){ console.warn('[AC] WebXR failed:',e); }
  };

  const pct=(currentTime/PLAYBACK_END_SEC)*100;
  const station=STATIONS[stationIdx]||STATIONS[0];

  return (
    <div className="player-container ayurveda-player" onMouseEnter={()=>setShowControls(true)} onMouseLeave={()=>setShowControls(false)}>

      <div className="ayurveda-disclaimer-banner">
        <span>⚠️ This content describes a traditional knowledge system and is not medical advice.</span>
      </div>

      <div className="ayurveda-hud">
        <span className="hud-dot" style={{background:station.color}}/>
        <span className="hud-label">{station.label}</span>
        <span className="hud-condition">{condition}</span>
      </div>

      <video ref={videoRef} src="/videos/ayurveda_explainer.mp4"
        className={`player-canvas${condition==='C4'?' video-hidden':''}`}
        playsInline muted={isMuted} onTimeUpdate={handleTimeUpdate}
        onEnded={()=>{ setPlaying(false); if(onComplete) onComplete(); }}/>

      {condition==='C4'&&<div ref={mountRef} className="c4-mount"/>}

      {condition==='C4'&&(
        <div className="c4-vr-toolbar">
          {vrSupported&&<button className="c4-enter-vr-btn" onClick={handleEnterVR}>{inVR?'🥽 In VR':'🥽 Enter VR'}</button>}
          <button className="c4-play-btn" onClick={playing?pauseVideo:playVideo}>{playing?'⏸':'▶ Play'}</button>
          <span className="c4-look-hint">🖱 Drag to look around · Click glowing orbs to learn</span>
        </div>
      )}

      {condition==='C4'&&gazeInfo&&(
        <div className="c4-gaze-hud">
          <div className="c4-gaze-label">{gazeInfo.label}</div>
          <div className="c4-gaze-bar"><div className="c4-gaze-fill" style={{width:`${gazeInfo.progress*100}%`}}/></div>
          <div className="c4-gaze-hint">Keep gazing…</div>
        </div>
      )}

      {condition==='C4'&&<C4InfoPanel info={infoPanel} onClose={()=>setInfoPanel(null)}/>}

      {condition==='C4'&&!inVR&&(
        <div className="c4-legend">
          <div className="c4-legend-title">🔮 Sacred Objects</div>
          {ELEMENTS.map(el=>(
            <div key={el.id} className="c4-legend-item">
              <span className="c4-legend-dot" style={{background:`#${el.color.toString(16).padStart(6,'0')}`}}/>
              <span>{el.label.split(' ')[0]}</span>
            </div>
          ))}
          <div className="c4-legend-divider"/>
          {DOSHAS.map(d=>(
            <div key={d.id} className="c4-legend-item">
              <span className="c4-legend-dot" style={{background:`#${d.color.toString(16).padStart(6,'0')}`}}/>
              <span>{d.label}</span>
            </div>
          ))}
        </div>
      )}

      {condition==='C3'&&activeC3&&<C3Panel interaction={activeC3} onComplete={handleC3Complete}/>}

      <div className={`player-controls${showControls?' visible':''}`}>
        <div className="ayurveda-station-track">
          {STATIONS.map((s,i)=>(
            <div key={s.id} className="ayurveda-station-block" onClick={()=>seekVideo(s.t[0])} title={s.label}
              style={{left:`${(s.t[0]/PLAYBACK_END_SEC)*100}%`,width:`${((s.t[1]-s.t[0])/PLAYBACK_END_SEC)*100}%`,background:s.color,opacity:i===stationIdx?.9:.4}}/>
          ))}
          <div className="ayurveda-playhead" style={{left:`${pct}%`}}/>
          {condition!=='C4'&&<input type="range" className="seek-slider" min="0" max={PLAYBACK_END_SEC} step=".1" value={currentTime} onChange={e=>seekVideo(Number(e.target.value))}/>}
        </div>
        <div className="controls-row">
          {condition!=='C4'&&<>
            <button className="control-btn" onClick={()=>seekVideo(Math.max(0,currentTime-10))}>⏪</button>
            <button className="control-btn play-btn" onClick={playing?pauseVideo:playVideo}>{playing?'⏸':'▶'}</button>
            <button className="control-btn" onClick={()=>seekVideo(Math.min(PLAYBACK_END_SEC,currentTime+10))}>⏩</button>
            <button className="control-btn" onClick={()=>setIsMuted(m=>!m)}>{isMuted?'🔇':'🔊'}</button>
          </>}
          <span className="time-display">{formatTime(currentTime)} / {formatTime(PLAYBACK_END_SEC)}</span>
          <span className="station-label-inline" style={{color:station.color}}>{station.label}</span>
        </div>
      </div>
    </div>
  );
}
