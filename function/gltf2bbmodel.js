"use strict";

/**
 * gltf2bbmodel — mengubah file .gltf hasil export Blockbench (embedded /
 * single-buffer glTF 2.0) kembali menjadi .bbmodel Blockbench.
 *
 * Asumsi (sesuai perilaku Blockbench glTF exporter):
 *  - Setiap "cube" Blockbench diekspor sebagai satu glTF mesh terpisah,
 *    dengan tepat 6 face (24 vertex non-shared, 2 tri per face).
 *  - Urutan 6 grup vertex per mesh SELALU mengikuti normal:
 *      +X, -X, +Y, -Y, +Z, -Z  ==>  east, west, up, down, south, north
 *  - Untuk tiap bone/group, exporter menulis SEPASANG node:
 *      node "pivot"  (berisi translation = posisi origin bone di parent)
 *      node "mesh"   (child dari pivot, berisi translation = offset
 *                     cube dari origin, dan field "mesh" = index mesh)
 *    Rotasi bone (jika di-nest lebih lanjut / rotated) muncul sebagai
 *    node tambahan di antaranya dengan field "rotation" (quaternion).
 *  - Semua unit posisi glTF = unit Blockbench / 16 (Blockbench 1 unit =
 *    1/16 block glTF export), jadi dikalikan 16 saat convert balik.
 *
 * Karena tidak ada 1 skema resmi publik untuk representasi ini, converter
 * bekerja secara struktural: ia menelusuri scene graph node apa adanya,
 * merekonstruksi cube dari bounding-box vertex + UV asli tiap face, dan
 * membangun ulang hierarchy group Blockbench dari nesting node tersebut.
 * Tidak ada data yang di-hardcode dari model contoh manapun.
 */

const UNITS_PER_METER = 16; // Blockbench glTF export: 1 block-unit = 16 model-units

// Minecraft/Blockbench face <- normal arah (glTF right-handed, Y-up, Z toward viewer)
const FACE_BY_NORMAL = [
  { normal: [1, 0, 0], face: "east" },
  { normal: [-1, 0, 0], face: "west" },
  { normal: [0, 1, 0], face: "up" },
  { normal: [0, -1, 0], face: "down" },
  { normal: [0, 0, 1], face: "south" },
  { normal: [0, 0, -1], face: "north" },
];

function closestFace(normal) {
  let best = null;
  let bestDot = -Infinity;
  for (const f of FACE_BY_NORMAL) {
    const dot =
      normal[0] * f.normal[0] + normal[1] * f.normal[1] + normal[2] * f.normal[2];
    if (dot > bestDot) {
      bestDot = dot;
      best = f.face;
    }
  }
  return best;
}

// ---------- glTF binary accessor reading ----------

const COMPONENT_SIZES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const NUM_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

class GltfBinaryReader {
  constructor(gltf) {
    this.gltf = gltf;
    this.buffers = (gltf.buffers || []).map((b) => decodeBufferUri(b.uri));
  }

  readAccessor(accessorIndex) {
    const gltf = this.gltf;
    const accessor = gltf.accessors[accessorIndex];
    const view = gltf.bufferViews[accessor.bufferView];
    const buf = this.buffers[view.buffer];
    const compSize = COMPONENT_SIZES[accessor.componentType];
    const numComp = NUM_COMPONENTS[accessor.type];
    const stride = view.byteStride || compSize * numComp;
    const baseOffset = (view.byteOffset || 0) + (accessor.byteOffset || 0);

    const out = new Array(accessor.count);
    for (let i = 0; i < accessor.count; i++) {
      const rowOffset = baseOffset + i * stride;
      const row = new Array(numComp);
      for (let c = 0; c < numComp; c++) {
        const off = rowOffset + c * compSize;
        row[c] = readComponent(buf, off, accessor.componentType);
      }
      out[i] = row;
    }
    return out;
  }
}

function readComponent(buf, offset, componentType) {
  switch (componentType) {
    case 5120:
      return buf.readInt8(offset);
    case 5121:
      return buf.readUInt8(offset);
    case 5122:
      return buf.readInt16LE(offset);
    case 5123:
      return buf.readUInt16LE(offset);
    case 5125:
      return buf.readUInt32LE(offset);
    case 5126:
      return buf.readFloatLE(offset);
    default:
      throw new Error(`Unsupported glTF componentType ${componentType}`);
  }
}

function decodeBufferUri(uri) {
  if (!uri) throw new Error("gltf2bbmodel: buffer tanpa 'uri' tidak didukung (perlu embedded/base64 glTF, bukan .bin eksternal atau .glb).");
  const match = /^data:application\/(?:octet-stream|gltf-buffer);base64,(.*)$/.exec(uri);
  if (!match) {
    throw new Error("gltf2bbmodel: hanya mendukung buffer base64 ter-embed (glTF export 'Embedded/Single File' dari Blockbench).");
  }
  return Buffer.from(match[1], "base64");
}

// ---------- quaternion / vector helpers ----------

function quatToEulerXYZDeg(q) {
  // q = [x, y, z, w] -> intrinsic XYZ Euler in degrees (Blockbench convention)
  const [x, y, z, w] = q;

  // roll (X)
  const sinrCosp = 2 * (w * x + y * z);
  const cosrCosp = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinrCosp, cosrCosp);

  // pitch (Y)
  const sinp = 2 * (w * y - z * x);
  let pitch;
  if (Math.abs(sinp) >= 1) {
    pitch = (Math.sign(sinp) * Math.PI) / 2;
  } else {
    pitch = Math.asin(sinp);
  }

  // yaw (Z)
  const sinyCosp = 2 * (w * z + x * y);
  const cosyCosp = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(sinyCosp, cosyCosp);

  const toDeg = (r) => (r * 180) / Math.PI;
  return [toDeg(roll), toDeg(pitch), toDeg(yaw)];
}

function isIdentityQuat(q) {
  if (!q) return true;
  return (
    Math.abs(q[0]) < 1e-9 &&
    Math.abs(q[1]) < 1e-9 &&
    Math.abs(q[2]) < 1e-9 &&
    Math.abs(q[3] - 1) < 1e-9
  );
}

function addVec3(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function quatMul(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function rotateVecByQuat(v, q) {
  const [x, y, z] = v;
  const [qx, qy, qz, qw] = q;
  const uvx = qy * z - qz * y;
  const uvy = qz * x - qx * z;
  const uvz = qx * y - qy * x;
  const uuvx = qy * uvz - qz * uvy;
  const uuvy = qz * uvx - qx * uvz;
  const uuvz = qx * uvy - qy * uvx;
  return [x + 2 * (qw * uvx + uuvx), y + 2 * (qw * uvy + uuvy), z + 2 * (qw * uvz + uuvz)];
}

const IDENTITY_QUAT = [0, 0, 0, 1];
const ZERO3 = [0, 0, 0];

// ---------- cube reconstruction from a single mesh ----------

/**
 * Membaca 1 glTF mesh (harus persis 6 face x 4 vertex non-shared, sesuai
 * pola Blockbench) dan mengembalikan bounding box lokal + data UV/face.
 */
function readCubeMesh(reader, gltf, meshIndex) {
  const mesh = gltf.meshes[meshIndex];
  const prim = mesh.primitives[0];
  if (!prim || prim.attributes.POSITION === undefined) {
    return null;
  }

  const positions = reader.readAccessor(prim.attributes.POSITION);
  const normals =
    prim.attributes.NORMAL !== undefined ? reader.readAccessor(prim.attributes.NORMAL) : null;
  const uvs =
    prim.attributes.TEXCOORD_0 !== undefined
      ? reader.readAccessor(prim.attributes.TEXCOORD_0)
      : null;

  if (positions.length % 4 !== 0 || !normals) {
    throw new Error(
      `gltf2bbmodel: mesh #${meshIndex} bukan geometri cube Blockbench yang dikenali (vertex=${positions.length}). Pastikan file berasal dari Blockbench glTF export dengan cube-cube standar (bukan mesh custom/decimated).`
    );
  }

  const faceCount = positions.length / 4;

  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (const p of positions) {
    for (let a = 0; a < 3; a++) {
      if (p[a] < min[a]) min[a] = p[a];
      if (p[a] > max[a]) max[a] = p[a];
    }
  }

  const facesByName = {};
  for (let f = 0; f < faceCount; f++) {
    const vStart = f * 4;
    const faceNormal = normals[vStart];
    const faceName = closestFace(faceNormal);

    let uvBox = null;
    if (uvs) {
      let uMin = Infinity,
        uMax = -Infinity,
        vMin = Infinity,
        vMax = -Infinity;
      for (let k = 0; k < 4; k++) {
        const [u, v] = uvs[vStart + k];
        if (u < uMin) uMin = u;
        if (u > uMax) uMax = u;
        if (v < vMin) vMin = v;
        if (v > vMax) vMax = v;
      }
      uvBox = { uMin, uMax, vMin, vMax };
    }

    // Kalau exporter menulis 2 face glTF untuk 1 face Blockbench (jarang,
    // biasanya double-sided sudah dihandle material), simpan yang pertama.
    if (!facesByName[faceName]) {
      facesByName[faceName] = uvBox;
    }
  }

  return { min, max, faces: facesByName };
}

// ---------- scene graph walk ----------

/**
 * Blockbench glTF export menulis tiap group/bone sebagai node "pivot"
 * yang translation-nya = posisi origin group tsb relatif ke parent, lalu
 * anak-anaknya adalah node mesh (translation relatif ke origin) dan/atau
 * pivot group berikutnya. Node rotasi (quaternion, tanpa "mesh") berarti
 * origin yang sama tapi group tsb dirotasi.
 *
 * Kita jalan rekursif sambil mengakumulasi:
 *  - worldOrigin: posisi absolut origin group saat ini (unit glTF)
 *  - localRotation: rotasi group saat ini relatif ke origin-nya sendiri
 * dan setiap kali ketemu node ber-mesh, itu jadi 1 elemen "cube" dengan
 * origin = worldOrigin dan from/to dihitung dari bounding box + offset
 * translation node tsb (juga relatif ke worldOrigin).
 */
function walkScene(reader, gltf, rootIndices, opts) {
  const elements = [];
  const outlinerRoots = [];
  const nameCounts = new Map();

  function uniqueName(base) {
    const n = nameCounts.get(base) || 0;
    nameCounts.set(base, n + 1);
    return n === 0 ? base : `${base}${n + 1}`;
  }

  // Forward kinematics penuh via quaternion (persis transform glTF node
  // graph yang sebenarnya): translation anak selalu di local space parent,
  // jadi harus dirotasi oleh accumQuat parent SEBELUM ditambahkan ke
  // worldOrigin. Ini krusial untuk cube yang berada di bawah rantai rotasi
  // majemuk (mis. kaki yang di-rotate lalu punya child ter-rotate lagi) —
  // menjumlah derajat Euler secara linear (pendekatan naif) memberi error
  // pada kasus itu; komposisi quaternion baru di-convert ke Euler sekali di
  // titik akhir (cube / group) sehingga akurat untuk rotasi apa pun.
  function visit(nodeIndex, worldOrigin, accumQuat) {
    const node = gltf.nodes[nodeIndex];
    const translation = node.translation || ZERO3;
    const rotationQuat = node.rotation || IDENTITY_QUAT;

    // posisi & rotasi absolut node ini di world space
    const worldPos = addVec3(worldOrigin, rotateVecByQuat(translation, accumQuat));
    const worldQuat = quatMul(accumQuat, rotationQuat);

    if (node.mesh !== undefined) {
      const cube = readCubeMesh(reader, gltf, node.mesh);
      if (!cube) return null;

      // from/to = cube.min/max (local ke node ini) diputar+geser ke world space,
      // lalu di-un-rotate kembali relatif ke origin cube supaya bisa disimpan
      // sebagai axis-aligned from/to + rotation Euler (format Blockbench).
      const originForElement = isIdentityQuat(rotationQuat) ? worldOrigin : worldPos;
      const originQuat = isIdentityQuat(rotationQuat) ? accumQuat : worldQuat;
      const invOriginQuat = conjugateQuat(originQuat);

      // Posisi world tiap corner min/max cube, lalu bawa ke local space
      // originForElement dengan invOriginQuat supaya jadi axis-aligned lagi.
      const worldMin = addVec3(worldPos, rotateVecByQuat(cube.min, worldQuat));
      const worldMax = addVec3(worldPos, rotateVecByQuat(cube.max, worldQuat));
      const localMin = rotateVecByQuat(subVec3(worldMin, originForElement), invOriginQuat);
      const localMax = rotateVecByQuat(subVec3(worldMax, originForElement), invOriginQuat);
      const fromLocal = addVec3(originForElement, localMin);
      const toLocal = addVec3(originForElement, localMax);

      const rotDeg = quatToEulerXYZDeg(originQuat);

      const element = {
        name: uniqueName(node.name || "cube"),
        from: fromLocal.map((v) => round4(v * UNITS_PER_METER)),
        to: toLocal.map((v) => round4(v * UNITS_PER_METER)),
        origin: originForElement.map((v) => round4(v * UNITS_PER_METER)),
        rotation: rotDeg.map(round4),
        faces: cube.faces,
      };
      elements.push(element);

      const outlinerEntry = { type: "element", element };
      (node.children || []).forEach((childIdx) => {
        const childEntry = visit(childIdx, worldPos, worldQuat);
        if (childEntry) outlinerEntry.groupChildren = (outlinerEntry.groupChildren || []).concat(childEntry);
      });
      return outlinerEntry;
    }

    // Node non-mesh: pivot baru ATAU rotasi murni pada origin yang sama.
    const children = node.children || [];
    if (children.length === 0) return null;

    const groupName = uniqueName(node.name || "group");
    const group = {
      type: "group",
      name: groupName,
      origin: worldPos.map((v) => round4(v * UNITS_PER_METER)),
      rotation: isIdentityQuat(rotationQuat) ? [0, 0, 0] : quatToEulerXYZDeg(worldQuat).map(round4),
      children: [],
    };

    for (const childIdx of children) {
      const entry = visit(childIdx, worldPos, worldQuat);
      if (entry) group.children.push(entry);
    }

    if (group.children.length === 0) return null;
    return group;
  }

  for (const rootIdx of rootIndices) {
    const entry = visit(rootIdx, ZERO3, IDENTITY_QUAT);
    if (entry) outlinerRoots.push(entry);
  }

  return { elements, outlinerRoots };
}

function subVec3(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function conjugateQuat(q) {
  return [-q[0], -q[1], -q[2], q[3]];
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

// ---------- bbmodel assembly ----------

function toUuid(seedCounter) {
  // UUID v4-ish, cukup untuk keperluan Blockbench (hanya perlu unik)
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  let s = "";
  for (let i = 0; i < 32; i++) {
    if (i === 8 || i === 12 || i === 16 || i === 20) s += "-";
    if (i === 12) {
      s += "4";
      continue;
    }
    if (i === 16) {
      s += ((seedCounter++, Math.floor(Math.random() * 4) + 8)).toString(16);
      continue;
    }
    s += hex();
  }
  return s;
}

function faceUvToPixels(uvBox, texW, texH) {
  // glTF UV: origin top-left, sama seperti Blockbench UV pixel-space,
  // jadi konversi langsung u*width, v*height.
  return [
    round4(uvBox.uMin * texW),
    round4(uvBox.vMin * texH),
    round4(uvBox.uMax * texW),
    round4(uvBox.vMax * texH),
  ];
}

function buildElementsJson(elements, texW, texH) {
  const FACE_ORDER = ["north", "east", "south", "west", "up", "down"];
  return elements.map((el) => {
    const faces = {};
    for (const faceName of FACE_ORDER) {
      const uvBox = el.faces[faceName];
      faces[faceName] = {
        uv: uvBox ? faceUvToPixels(uvBox, texW, texH) : [0, 0, 0, 0],
        texture: uvBox ? 0 : null,
      };
    }

    return {
      name: el.name,
      box_uv: false,
      render_order: "default",
      locked: false,
      export: true,
      scope: 0,
      allow_mirror_modeling: true,
      from: el.from,
      to: el.to,
      autouv: 0,
      color: 0,
      origin: el.origin,
      faces,
      type: "cube",
      uuid: (el.uuid = el.uuid || toUuid(Math.floor(Math.random() * 1e6))),
      ...(el.rotation && (el.rotation[0] || el.rotation[1] || el.rotation[2])
        ? { rotation: el.rotation }
        : {}),
    };
  });
}

function buildOutliner(entries) {
  return entries.map((entry) => buildOutlinerEntry(entry));
}

function buildOutlinerEntry(entry) {
  if (entry.type === "element") {
    const uuid = entry.element.uuid;
    if (entry.groupChildren && entry.groupChildren.length) {
      // Elemen dengan children (jarang) -> jadikan group berisi element uuid + anaknya
      return {
        name: entry.element.name,
        origin: entry.element.origin,
        color: 0,
        uuid: toUuid(Math.floor(Math.random() * 1e6)),
        export: true,
        isOpen: true,
        locked: false,
        visibility: true,
        autouv: 0,
        children: [uuid, ...entry.groupChildren.map(buildOutlinerEntry)],
      };
    }
    return uuid;
  }

  // group
  return {
    name: entry.name,
    origin: entry.origin,
    color: 0,
    uuid: toUuid(Math.floor(Math.random() * 1e6)),
    export: true,
    isOpen: true,
    locked: false,
    visibility: true,
    autouv: 0,
    ...(entry.rotation && (entry.rotation[0] || entry.rotation[1] || entry.rotation[2])
      ? { rotation: entry.rotation }
      : {}),
    children: entry.children.map(buildOutlinerEntry),
  };
}

function decodePngSize(dataUri) {
  const match = /^data:image\/png;base64,(.*)$/.exec(dataUri);
  if (!match) return null;
  const buf = Buffer.from(match[1], "base64");
  // PNG IHDR: width @ byte 16 (4 bytes BE), height @ byte 20
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * Convert parsed glTF JSON object menjadi objek bbmodel JSON siap
 * JSON.stringify.
 *
 * @param {object} gltf   Isi file .gltf yang sudah di-JSON.parse
 * @param {object} [opts]
 * @param {string} [opts.name]  Nama model (default: dari scene / "model")
 * @returns {object} bbmodel JSON
 */
function convertGltfToBbmodel(gltf, opts = {}) {
  if (!gltf || !Array.isArray(gltf.nodes)) {
    throw new Error("gltf2bbmodel: input bukan glTF 2.0 JSON yang valid (field 'nodes' tidak ada).");
  }
  if (!gltf.images || !gltf.images[0] || !gltf.images[0].uri) {
    throw new Error(
      "gltf2bbmodel: tidak ditemukan texture ter-embed di file. Export ulang dari Blockbench sebagai glTF 'Embedded' agar texture ikut base64 di dalam file."
    );
  }

  const reader = new GltfBinaryReader(gltf);

  const sceneIndex = gltf.scene || 0;
  const scene = gltf.scenes[sceneIndex];
  const { elements, outlinerRoots } = walkScene(reader, gltf, scene.nodes, opts);

  if (elements.length === 0) {
    throw new Error("gltf2bbmodel: tidak ada cube yang berhasil dikenali dari file ini.");
  }

  const texSize = decodePngSize(gltf.images[0].uri) || { width: 16, height: 16 };
  const elementsJson = buildElementsJson(elements, texSize.width, texSize.height);
  const outlinerJson = buildOutliner(outlinerRoots);

  const modelName = opts.name || scene.name || "model";

  const bbmodel = {
    meta: {
      format_version: "4.10",
      model_format: "free",
      box_uv: false,
    },
    name: modelName,
    model_identifier: `geometry.${modelName}`,
    visible_box: [8, 8, 8],
    variable_placeholders: "",
    variable_placeholder_buttons: [],
    timeline_setups: [],
    unhandled_root_fields: {},
    resolution: { width: texSize.width, height: texSize.height },
    elements: elementsJson,
    outliner: outlinerJson,
    textures: [
      {
        path: "",
        name: `${modelName}.png`,
        folder: "",
        namespace: "",
        id: "0",
        width: texSize.width,
        height: texSize.height,
        uv_width: texSize.width,
        uv_height: texSize.height,
        particle: false,
        layers_enabled: false,
        use_as_default: false,
        render_mode: "default",
        render_sides: "auto",
        frame_time: 1,
        frame_order_type: "loop",
        frame_order: "",
        frame_interpolate: false,
        visible: true,
        internal: true,
        saved: true,
        uuid: toUuid(1),
        relative_path: "",
        source: gltf.images[0].uri,
      },
    ],
  };

  return bbmodel;
}

module.exports = { convertGltfToBbmodel };
