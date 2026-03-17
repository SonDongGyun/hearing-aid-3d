#!/usr/bin/env node
/**
 * Generate a BTE hearing aid GLB model with separated named parts.
 * No external dependencies - raw glTF 2.0 / GLB binary output.
 */

const fs = require('fs');
const path = require('path');

// ─── Geometry Helpers ───────────────────────────────────────────────────────

function vec3Normalize(v) {
  const len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]) || 1;
  return [v[0]/len, v[1]/len, v[2]/len];
}

function computeTriangleNormal(a, b, c) {
  const u = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
  const v = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
  return vec3Normalize([
    u[1]*v[2] - u[2]*v[1],
    u[2]*v[0] - u[0]*v[2],
    u[0]*v[1] - u[1]*v[0]
  ]);
}

/** Cubic bezier point at t */
function bezier3(p0, p1, p2, p3, t) {
  const it = 1 - t;
  const a = it*it*it, b = 3*it*it*t, c = 3*it*t*t, d = t*t*t;
  return [
    a*p0[0]+b*p1[0]+c*p2[0]+d*p3[0],
    a*p0[1]+b*p1[1]+c*p2[1]+d*p3[1],
    a*p0[2]+b*p1[2]+c*p2[2]+d*p3[2]
  ];
}

/** Cubic bezier tangent at t */
function bezier3Tangent(p0, p1, p2, p3, t) {
  const it = 1 - t;
  const a = -3*it*it, b = 3*it*it - 6*it*t, c = 6*it*t - 3*t*t, d = 3*t*t;
  return vec3Normalize([
    a*p0[0]+b*p1[0]+c*p2[0]+d*p3[0],
    a*p0[1]+b*p1[1]+c*p2[1]+d*p3[1],
    a*p0[2]+b*p1[2]+c*p2[2]+d*p3[2]
  ]);
}

/** Generate a lathe geometry (revolution of 2D profile around Y axis) */
function generateLathe(profile, segments, scaleX, scaleZ) {
  // profile: array of [r, y] pairs where r = distance from axis
  const positions = [];
  const normals = [];
  const indices = [];

  const rows = profile.length;
  const cols = segments + 1;

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j <= segments; j++) {
      const theta = (j / segments) * Math.PI * 2;
      const r = profile[i][0];
      const y = profile[i][1];
      const x = Math.cos(theta) * r * scaleX;
      const z = Math.sin(theta) * r * scaleZ;
      positions.push(x, y, z);

      // Approximate normal from profile tangent
      let dr, dy;
      if (i === 0) {
        dr = profile[1][0] - profile[0][0];
        dy = profile[1][1] - profile[0][1];
      } else if (i === rows - 1) {
        dr = profile[rows-1][0] - profile[rows-2][0];
        dy = profile[rows-1][1] - profile[rows-2][1];
      } else {
        dr = profile[i+1][0] - profile[i-1][0];
        dy = profile[i+1][1] - profile[i-1][1];
      }
      // Normal in profile space: perpendicular to tangent (dy, -dr) in the r-y plane
      const nx = dy * Math.cos(theta) * scaleX;
      const ny = -dr;
      const nz = dy * Math.sin(theta) * scaleZ;
      const n = vec3Normalize([nx, ny, nz]);
      normals.push(n[0], n[1], n[2]);
    }
  }

  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * cols + j;
      const b = i * cols + j + 1;
      const c = (i+1) * cols + j;
      const d = (i+1) * cols + j + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint16Array(indices) };
}

/** Generate tube along a path */
function generateTube(pathPoints, radius, circleSegments) {
  const positions = [];
  const normals = [];
  const indices = [];

  const pathLen = pathPoints.length;
  const cols = circleSegments + 1;

  for (let i = 0; i < pathLen; i++) {
    const p = pathPoints[i];
    // Compute tangent
    let tangent;
    if (i === 0) {
      tangent = vec3Normalize([pathPoints[1][0]-p[0], pathPoints[1][1]-p[1], pathPoints[1][2]-p[2]]);
    } else if (i === pathLen - 1) {
      tangent = vec3Normalize([p[0]-pathPoints[i-1][0], p[1]-pathPoints[i-1][1], p[2]-pathPoints[i-1][2]]);
    } else {
      tangent = vec3Normalize([pathPoints[i+1][0]-pathPoints[i-1][0], pathPoints[i+1][1]-pathPoints[i-1][1], pathPoints[i+1][2]-pathPoints[i-1][2]]);
    }

    // Find perpendicular vectors (Frenet frame approximation)
    let up = [0, 1, 0];
    if (Math.abs(tangent[1]) > 0.9) up = [1, 0, 0];
    // normal = cross(tangent, up)
    let normal = vec3Normalize([
      tangent[1]*up[2]-tangent[2]*up[1],
      tangent[2]*up[0]-tangent[0]*up[2],
      tangent[0]*up[1]-tangent[1]*up[0]
    ]);
    // binormal = cross(tangent, normal)
    let binormal = vec3Normalize([
      tangent[1]*normal[2]-tangent[2]*normal[1],
      tangent[2]*normal[0]-tangent[0]*normal[2],
      tangent[0]*normal[1]-tangent[1]*normal[0]
    ]);

    for (let j = 0; j <= circleSegments; j++) {
      const theta = (j / circleSegments) * Math.PI * 2;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const nx = cos * normal[0] + sin * binormal[0];
      const ny = cos * normal[1] + sin * binormal[1];
      const nz = cos * normal[2] + sin * binormal[2];
      positions.push(p[0] + nx * radius, p[1] + ny * radius, p[2] + nz * radius);
      normals.push(nx, ny, nz);
    }
  }

  for (let i = 0; i < pathLen - 1; i++) {
    for (let j = 0; j < circleSegments; j++) {
      const a = i * cols + j;
      const b = i * cols + j + 1;
      const c = (i+1) * cols + j;
      const d = (i+1) * cols + j + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint16Array(indices) };
}

/** Generate sphere (or hemisphere if halfOnly) */
function generateSphere(radius, widthSegs, heightSegs, halfOnly) {
  const positions = [];
  const normals = [];
  const indices = [];

  const phiMax = halfOnly ? Math.PI / 2 : Math.PI;

  for (let y = 0; y <= heightSegs; y++) {
    const phi = (y / heightSegs) * phiMax;
    for (let x = 0; x <= widthSegs; x++) {
      const theta = (x / widthSegs) * Math.PI * 2;
      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);
      positions.push(nx * radius, ny * radius, nz * radius);
      normals.push(nx, ny, nz);
    }
  }

  const cols = widthSegs + 1;
  for (let y = 0; y < heightSegs; y++) {
    for (let x = 0; x < widthSegs; x++) {
      const a = y * cols + x;
      const b = y * cols + x + 1;
      const c = (y+1) * cols + x;
      const d = (y+1) * cols + x + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint16Array(indices) };
}

/** Generate a cylinder */
function generateCylinder(radiusTop, radiusBot, height, segments, capTop, capBot) {
  const positions = [];
  const normals = [];
  const indices = [];

  const halfH = height / 2;
  const rows = 2; // top ring and bottom ring

  // Side
  for (let row = 0; row < rows; row++) {
    const y = row === 0 ? halfH : -halfH;
    const r = row === 0 ? radiusTop : radiusBot;
    for (let j = 0; j <= segments; j++) {
      const theta = (j / segments) * Math.PI * 2;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      positions.push(cos * r, y, sin * r);
      // Slope normal
      const dr = radiusBot - radiusTop;
      const slopeLen = Math.sqrt(dr * dr + height * height);
      const ny = dr / slopeLen;
      const nr = height / slopeLen;
      normals.push(cos * nr, ny, sin * nr);
    }
  }

  const cols = segments + 1;
  for (let j = 0; j < segments; j++) {
    const a = j;
    const b = j + 1;
    const c = cols + j;
    const d = cols + j + 1;
    indices.push(a, c, b);
    indices.push(b, c, d);
  }

  // Top cap
  if (capTop) {
    const centerIdx = positions.length / 3;
    positions.push(0, halfH, 0);
    normals.push(0, 1, 0);
    for (let j = 0; j <= segments; j++) {
      const theta = (j / segments) * Math.PI * 2;
      positions.push(Math.cos(theta) * radiusTop, halfH, Math.sin(theta) * radiusTop);
      normals.push(0, 1, 0);
    }
    for (let j = 0; j < segments; j++) {
      indices.push(centerIdx, centerIdx + 1 + j + 1, centerIdx + 1 + j);
    }
  }

  // Bottom cap
  if (capBot) {
    const centerIdx = positions.length / 3;
    positions.push(0, -halfH, 0);
    normals.push(0, -1, 0);
    for (let j = 0; j <= segments; j++) {
      const theta = (j / segments) * Math.PI * 2;
      positions.push(Math.cos(theta) * radiusBot, -halfH, Math.sin(theta) * radiusBot);
      normals.push(0, -1, 0);
    }
    for (let j = 0; j < segments; j++) {
      indices.push(centerIdx, centerIdx + 1 + j, centerIdx + 1 + j + 1);
    }
  }

  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint16Array(indices) };
}

/** Generate a box */
function generateBox(w, h, d) {
  const hw = w/2, hh = h/2, hd = d/2;
  const positions = new Float32Array([
    // Front
    -hw,-hh, hd,  hw,-hh, hd,  hw, hh, hd, -hw, hh, hd,
    // Back
     hw,-hh,-hd, -hw,-hh,-hd, -hw, hh,-hd,  hw, hh,-hd,
    // Top
    -hw, hh, hd,  hw, hh, hd,  hw, hh,-hd, -hw, hh,-hd,
    // Bottom
    -hw,-hh,-hd,  hw,-hh,-hd,  hw,-hh, hd, -hw,-hh, hd,
    // Right
     hw,-hh, hd,  hw,-hh,-hd,  hw, hh,-hd,  hw, hh, hd,
    // Left
    -hw,-hh,-hd, -hw,-hh, hd, -hw, hh, hd, -hw, hh,-hd,
  ]);
  const normals = new Float32Array([
    0,0,1, 0,0,1, 0,0,1, 0,0,1,
    0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1,
    0,1,0, 0,1,0, 0,1,0, 0,1,0,
    0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0,
    1,0,0, 1,0,0, 1,0,0, 1,0,0,
    -1,0,0, -1,0,0, -1,0,0, -1,0,0,
  ]);
  const indices = new Uint16Array([
    0,1,2, 0,2,3,
    4,5,6, 4,6,7,
    8,9,10, 8,10,11,
    12,13,14, 12,14,15,
    16,17,18, 16,18,19,
    20,21,22, 20,22,23,
  ]);
  return { positions, normals, indices };
}

/** Generate a torus */
function generateTorus(majorR, minorR, majorSegs, minorSegs) {
  const positions = [];
  const normals = [];
  const indices = [];

  for (let i = 0; i <= majorSegs; i++) {
    const u = (i / majorSegs) * Math.PI * 2;
    const cu = Math.cos(u), su = Math.sin(u);
    for (let j = 0; j <= minorSegs; j++) {
      const v = (j / minorSegs) * Math.PI * 2;
      const cv = Math.cos(v), sv = Math.sin(v);
      const x = (majorR + minorR * cv) * cu;
      const y = minorR * sv;
      const z = (majorR + minorR * cv) * su;
      positions.push(x, y, z);
      normals.push(cv * cu, sv, cv * su);
    }
  }

  const cols = minorSegs + 1;
  for (let i = 0; i < majorSegs; i++) {
    for (let j = 0; j < minorSegs; j++) {
      const a = i * cols + j;
      const b = i * cols + j + 1;
      const c = (i+1) * cols + j;
      const d = (i+1) * cols + j + 1;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint16Array(indices) };
}

// ─── Part Geometry Generation ───────────────────────────────────────────────

function createBody() {
  // 2D profile: [radius, y] - teardrop/kidney shape
  const profile = [];
  const numPoints = 20;
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const y = 1.5 - t * 3.0; // from 1.5 to -1.5 (3cm tall)
    // Kidney/teardrop: wider in middle, tapered at top and bottom
    let r;
    if (t < 0.1) {
      // Top taper
      r = 0.3 * Math.sin(t / 0.1 * Math.PI / 2);
    } else if (t > 0.85) {
      // Bottom taper (more rounded)
      r = 0.55 * Math.cos((t - 0.85) / 0.15 * Math.PI / 2);
    } else {
      // Main body - bulging shape
      const mid = (t - 0.1) / 0.75;
      r = 0.3 + 0.35 * Math.sin(mid * Math.PI);
      // Asymmetric bulge - wider in the middle
      r += 0.1 * Math.sin(mid * Math.PI * 0.8);
    }
    profile.push([Math.max(r, 0.01), y]);
  }
  // scaleX != scaleZ for oval/ergonomic shape
  return generateLathe(profile, 32, 1.0, 0.55);
}

function createEarHook() {
  // Curved tube from top of body, curving up and backward
  const pathPoints = [];
  const cp0 = [0, 1.5, 0];       // Start at top of body
  const cp1 = [0, 2.2, -0.2];    // Up
  const cp2 = [-0.3, 2.5, -0.8]; // Curving over
  const cp3 = [-0.5, 2.0, -1.2]; // Down and back
  const numPts = 24;
  for (let i = 0; i <= numPts; i++) {
    const t = i / numPts;
    pathPoints.push(bezier3(cp0, cp1, cp2, cp3, t));
  }
  return generateTube(pathPoints, 0.08, 10);
}

function createSoundTube() {
  // From end of ear hook going down
  const pathPoints = [];
  const cp0 = [-0.5, 2.0, -1.2];   // Start where ear hook ends
  const cp1 = [-0.5, 1.5, -1.4];
  const cp2 = [-0.4, 0.8, -1.3];
  const cp3 = [-0.3, 0.3, -1.2];   // Down towards ear tip
  const numPts = 20;
  for (let i = 0; i <= numPts; i++) {
    const t = i / numPts;
    pathPoints.push(bezier3(cp0, cp1, cp2, cp3, t));
  }
  return generateTube(pathPoints, 0.05, 8);
}

function createEarTip() {
  // Mushroom/dome shape
  const hemi = generateSphere(0.4, 16, 8, true);
  const cyl = generateCylinder(0.4, 0.3, 0.4, 16, false, true);

  // Offset cylinder below hemisphere
  const cylPositions = new Float32Array(cyl.positions.length);
  for (let i = 0; i < cyl.positions.length; i += 3) {
    cylPositions[i] = cyl.positions[i];
    cylPositions[i+1] = cyl.positions[i+1] - 0.2;
    cylPositions[i+2] = cyl.positions[i+2];
  }

  // Merge meshes
  const totalVerts = hemi.positions.length / 3 + cyl.positions.length / 3;
  const totalIdx = hemi.indices.length + cyl.indices.length;
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const indices = new Uint16Array(totalIdx);

  positions.set(hemi.positions, 0);
  normals.set(hemi.normals, 0);
  indices.set(hemi.indices, 0);

  const hemiVertCount = hemi.positions.length / 3;
  positions.set(cylPositions, hemi.positions.length);
  normals.set(cyl.normals, hemi.normals.length);
  for (let i = 0; i < cyl.indices.length; i++) {
    indices[hemi.indices.length + i] = cyl.indices[i] + hemiVertCount;
  }

  return { positions, normals, indices };
}

function createMicGrille() {
  return generateCylinder(0.15, 0.15, 0.05, 16, true, true);
}

function createButton() {
  return generateBox(0.2, 0.4, 0.08);
}

function createLED() {
  return generateSphere(0.075, 8, 6, false);
}

function createBatteryDoor() {
  return generateBox(0.8, 1.0, 0.06);
}

function createBrandRing() {
  // Torus around the middle of the body
  // Major radius should match body contour (~0.5), minor radius ~0.03
  return generateTorus(0.55, 0.03, 32, 8);
}

// ─── GLB Builder ────────────────────────────────────────────────────────────

function buildGLB(parts) {
  // parts: array of { name, geometry: {positions, normals, indices}, translation, material }

  // 1. Pack all geometry into a single binary buffer
  const bufferChunks = [];
  let byteOffset = 0;

  const bufferViews = [];
  const accessors = [];
  const meshes = [];
  const nodes = [];
  const materials = [];

  for (let pi = 0; pi < parts.length; pi++) {
    const part = parts[pi];
    const geo = part.geometry;

    // Positions
    const posBytes = Buffer.from(geo.positions.buffer, geo.positions.byteOffset, geo.positions.byteLength);
    const posViewIdx = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: posBytes.length, target: 34962 });
    // Compute min/max
    let minPos = [Infinity, Infinity, Infinity], maxPos = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < geo.positions.length; i += 3) {
      for (let c = 0; c < 3; c++) {
        if (geo.positions[i+c] < minPos[c]) minPos[c] = geo.positions[i+c];
        if (geo.positions[i+c] > maxPos[c]) maxPos[c] = geo.positions[i+c];
      }
    }
    const posAccessorIdx = accessors.length;
    accessors.push({
      bufferView: posViewIdx, byteOffset: 0, componentType: 5126,
      count: geo.positions.length / 3, type: 'VEC3',
      min: minPos, max: maxPos
    });
    bufferChunks.push(posBytes);
    byteOffset += posBytes.length;
    // Pad to 4 bytes
    const posPad = (4 - (byteOffset % 4)) % 4;
    if (posPad) { bufferChunks.push(Buffer.alloc(posPad)); byteOffset += posPad; }

    // Normals
    const normBytes = Buffer.from(geo.normals.buffer, geo.normals.byteOffset, geo.normals.byteLength);
    const normViewIdx = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: normBytes.length, target: 34962 });
    const normAccessorIdx = accessors.length;
    accessors.push({
      bufferView: normViewIdx, byteOffset: 0, componentType: 5126,
      count: geo.normals.length / 3, type: 'VEC3'
    });
    bufferChunks.push(normBytes);
    byteOffset += normBytes.length;
    const normPad = (4 - (byteOffset % 4)) % 4;
    if (normPad) { bufferChunks.push(Buffer.alloc(normPad)); byteOffset += normPad; }

    // Indices
    const idxBytes = Buffer.from(geo.indices.buffer, geo.indices.byteOffset, geo.indices.byteLength);
    const idxViewIdx = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: idxBytes.length, target: 34963 });
    const idxAccessorIdx = accessors.length;
    accessors.push({
      bufferView: idxViewIdx, byteOffset: 0, componentType: 5123,
      count: geo.indices.length, type: 'SCALAR'
    });
    bufferChunks.push(idxBytes);
    byteOffset += idxBytes.length;
    const idxPad = (4 - (byteOffset % 4)) % 4;
    if (idxPad) { bufferChunks.push(Buffer.alloc(idxPad)); byteOffset += idxPad; }

    // Material
    const matIdx = materials.length;
    const mat = {
      name: part.name + '_mat',
      pbrMetallicRoughness: {
        baseColorFactor: part.material.baseColor,
        metallicFactor: part.material.metallic,
        roughnessFactor: part.material.roughness
      }
    };
    if (part.material.emissiveFactor) {
      mat.emissiveFactor = part.material.emissiveFactor;
    }
    materials.push(mat);

    // Mesh
    const meshIdx = meshes.length;
    meshes.push({
      name: part.name,
      primitives: [{
        attributes: { POSITION: posAccessorIdx, NORMAL: normAccessorIdx },
        indices: idxAccessorIdx,
        material: matIdx
      }]
    });

    // Node
    const node = { name: part.name, mesh: meshIdx };
    if (part.translation) node.translation = part.translation;
    if (part.scale) node.scale = part.scale;
    nodes.push(node);
  }

  const totalBufferLength = byteOffset;
  const binBuffer = Buffer.concat(bufferChunks, totalBufferLength);

  // Build glTF JSON
  const gltf = {
    asset: { version: '2.0', generator: 'hearing-aid-generator' },
    scene: 0,
    scenes: [{ name: 'Scene', nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: totalBufferLength }]
  };

  const jsonStr = JSON.stringify(gltf);
  // Pad JSON to 4-byte boundary
  const jsonPadLen = (4 - (jsonStr.length % 4)) % 4;
  const jsonPadded = jsonStr + ' '.repeat(jsonPadLen);
  const jsonBuf = Buffer.from(jsonPadded, 'utf8');

  // Pad BIN to 4-byte boundary
  const binPadLen = (4 - (binBuffer.length % 4)) % 4;
  const binPadded = binPadLen > 0 ? Buffer.concat([binBuffer, Buffer.alloc(binPadLen)]) : binBuffer;

  // GLB structure:
  // Header: 12 bytes (magic, version, length)
  // JSON chunk: 8 bytes header + jsonBuf
  // BIN chunk: 8 bytes header + binPadded
  const totalLength = 12 + 8 + jsonBuf.length + 8 + binPadded.length;
  const glb = Buffer.alloc(totalLength);
  let off = 0;

  // Header
  glb.writeUInt32LE(0x46546C67, off); off += 4; // 'glTF'
  glb.writeUInt32LE(2, off); off += 4;           // version
  glb.writeUInt32LE(totalLength, off); off += 4;

  // JSON chunk
  glb.writeUInt32LE(jsonBuf.length, off); off += 4;
  glb.writeUInt32LE(0x4E4F534A, off); off += 4; // 'JSON'
  jsonBuf.copy(glb, off); off += jsonBuf.length;

  // BIN chunk
  glb.writeUInt32LE(binPadded.length, off); off += 4;
  glb.writeUInt32LE(0x004E4942, off); off += 4; // 'BIN\0'
  binPadded.copy(glb, off);

  return glb;
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  const parts = [
    {
      name: 'body',
      geometry: createBody(),
      translation: [0, 0, 0],
      material: { baseColor: [0.85, 0.87, 0.9, 1], metallic: 0.4, roughness: 0.2 }
    },
    {
      name: 'ear_hook',
      geometry: createEarHook(),
      translation: [0, 0, 0],
      material: { baseColor: [0.9, 0.92, 0.95, 1], metallic: 0.0, roughness: 0.1 }
    },
    {
      name: 'sound_tube',
      geometry: createSoundTube(),
      translation: [0, 0, 0],
      material: { baseColor: [0.9, 0.92, 0.95, 1], metallic: 0.0, roughness: 0.1 }
    },
    {
      name: 'ear_tip',
      geometry: createEarTip(),
      translation: [-0.3, 0.0, -1.2],
      material: { baseColor: [0.85, 0.85, 0.82, 1], metallic: 0.0, roughness: 0.6 }
    },
    {
      name: 'mic_grille',
      geometry: createMicGrille(),
      translation: [0, 1.45, 0.15],
      material: { baseColor: [0.15, 0.15, 0.18, 1], metallic: 0.8, roughness: 0.3 }
    },
    {
      name: 'button_volume',
      geometry: createButton(),
      translation: [0.6, 0.2, 0],
      material: { baseColor: [0.8, 0.82, 0.85, 1], metallic: 0.5, roughness: 0.15 }
    },
    {
      name: 'led_indicator',
      geometry: createLED(),
      translation: [0.45, 1.0, 0.15],
      material: { baseColor: [0.0, 0.8, 0.6, 1], metallic: 0.0, roughness: 0.1, emissiveFactor: [0.0, 0.5, 0.4] }
    },
    {
      name: 'battery_door',
      geometry: createBatteryDoor(),
      translation: [0, -0.6, -0.35],
      material: { baseColor: [0.83, 0.85, 0.88, 1], metallic: 0.4, roughness: 0.25 }
    },
    {
      name: 'brand_ring',
      geometry: createBrandRing(),
      translation: [0, 0.1, 0],
      scale: [1.0, 1.0, 0.55],
      material: { baseColor: [0.0, 0.78, 1.0, 1], metallic: 0.0, roughness: 0.1, emissiveFactor: [0.0, 0.4, 0.6] }
    }
  ];

  const glb = buildGLB(parts);

  const outDir = path.join(__dirname, 'public', 'models');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'hearing-aid.glb');
  fs.writeFileSync(outPath, glb);

  console.log(`GLB written to: ${outPath}`);
  console.log(`File size: ${(glb.length / 1024).toFixed(1)} KB`);
  console.log(`Parts: ${parts.map(p => p.name).join(', ')}`);
}

main();
