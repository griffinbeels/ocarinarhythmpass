// The 3D room: a stone chamber with a pool, a raised platform, a marked plate
// to stand on, and a simple figure to walk around. All shapes are built in code.
import * as THREE from "../vendor/three.module.min.js";

const LEVELS = [1.0, 2.6, 4.2]; // water heights
const TOP = 5; // height of the platform the player walks on
const BOUNDS = { x: 2.7, z: 2.2 };
const PLATE = new THREE.Vector3(0, TOP, 0.6);

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1b22);
  scene.fog = new THREE.Fog(0x0d1b22, 14, 34);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 80);

  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x1c2a30, 1.0));
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.3);
  sun.position.set(5, 14, 6);
  scene.add(sun);
  const plateLight = new THREE.PointLight(0x58e0d0, 6, 9);
  plateLight.position.set(PLATE.x, TOP + 1.2, PLATE.z);
  scene.add(plateLight);

  const stone = new THREE.MeshStandardMaterial({ color: 0x6f7b80, roughness: 0.95 });
  const darkStone = new THREE.MeshStandardMaterial({ color: 0x48545a, roughness: 1 });
  const box = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    scene.add(m);
    return m;
  };
  box(20, 0.4, 24, darkStone, 0, -0.2, 0); // pool floor
  box(20, 12, 0.6, stone, 0, 6, -12); // back wall
  box(0.6, 12, 24, stone, -10, 6, 0);
  box(0.6, 12, 24, stone, 10, 6, 0);
  box(6, TOP, 5, stone, 0, TOP / 2, 0); // the platform
  for (const [x, z] of [[-7, -8], [7, -8], [-7, 4], [7, 4]]) box(1.2, 12, 1.2, darkStone, x, 6, z);

  // Three glowing lines on the back wall show the three water heights.
  const marks = LEVELS.map((y) => {
    const m = box(8, 0.12, 0.1, new THREE.MeshStandardMaterial({ color: 0x1b3a40, emissive: 0x58e0d0, emissiveIntensity: 0.15 }), 0, y, -11.6);
    return m;
  });

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(19.4, 23.4),
    new THREE.MeshStandardMaterial({ color: 0x2a93a8, transparent: true, opacity: 0.66, roughness: 0.12, metalness: 0.15 }),
  );
  water.rotation.x = -Math.PI / 2;
  scene.add(water);

  const wood = new THREE.MeshStandardMaterial({ color: 0x9a6a3c, roughness: 0.8 });
  const crates = [[-5, 3], [5.5, -2], [-4, -6]].map(([x, z], i) => {
    const c = box(1.1, 1.1, 1.1, wood, x, 0, z);
    c.userData.phase = i * 2.1;
    return c;
  });

  // The plate the player stands on to play, and a standing stone behind it.
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.08, 40), darkStone);
  plate.position.set(PLATE.x, TOP + 0.04, PLATE.z);
  scene.add(plate);
  // A small "E" key that floats over the plate while the figure stands on it. A sprite always faces the camera.
  const keyCanvas = document.createElement("canvas");
  keyCanvas.width = keyCanvas.height = 128;
  const kc = keyCanvas.getContext("2d");
  kc.fillStyle = "rgba(0, 0, 0, 0.62)";
  kc.beginPath(); kc.roundRect(10, 10, 108, 108, 26); kc.fill();
  kc.strokeStyle = "rgba(255, 255, 255, 0.35)"; kc.lineWidth = 3; kc.stroke();
  kc.fillStyle = "#fff"; kc.font = "600 72px system-ui, -apple-system, 'Segoe UI', sans-serif";
  kc.textAlign = "center"; kc.textBaseline = "middle"; kc.fillText("E", 64, 68);
  const keyTex = new THREE.CanvasTexture(keyCanvas);
  keyTex.colorSpace = THREE.SRGBColorSpace;
  const keyPrompt = new THREE.Sprite(new THREE.SpriteMaterial({ map: keyTex, transparent: true, opacity: 0, depthTest: false }));
  keyPrompt.renderOrder = 10; keyPrompt.visible = false;
  scene.add(keyPrompt);
  let promptOn = false, promptT = 0;
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x103035, emissive: 0x58e0d0, emissiveIntensity: 0.9 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.05, 10, 48), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(PLATE.x, TOP + 0.1, PLATE.z);
  scene.add(ring);
  box(1.6, 2.2, 0.35, darkStone, 0, TOP + 1.1, -1.9);
  for (let i = 0; i < 3; i++) {
    const wave = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 24, Math.PI), ringMat);
    wave.position.set(-0.36 + i * 0.36, TOP + 1.25 + (i % 2) * 0.12, -1.71);
    wave.rotation.z = i % 2 ? Math.PI : 0;
    scene.add(wave);
  }

  // The player figure: a rounded body, a head, a scarf and a small ocarina.
  const player = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.55, 6, 14), new THREE.MeshStandardMaterial({ color: 0xc8643a, roughness: 0.7 }));
  body.position.y = 0.6;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 14), new THREE.MeshStandardMaterial({ color: 0xe8c9a4, roughness: 0.8 }));
  head.position.y = 1.32;
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.07, 8, 20), new THREE.MeshStandardMaterial({ color: 0x2c4f8a, roughness: 0.8 }));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.08;
  const ocarina = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 10), new THREE.MeshStandardMaterial({ color: 0xf1e3c2, roughness: 0.5 }));
  ocarina.rotation.z = Math.PI / 2;
  ocarina.position.set(0.12, 1.22, 0.27);
  ocarina.visible = false;
  player.add(body, head, scarf, ocarina);
  player.position.set(PLATE.x, TOP, PLATE.z);
  scene.add(player);

  let level = 0, waterY = LEVELS[0], playing = false, glow = 0, time = 0;
  let squash = 0, hopT = 0, walking = 0, fovKick = 0;
  const camPos = new THREE.Vector3(0, TOP + 3.6, 8.8), camLook = new THREE.Vector3(0, TOP + 0.3, -0.9);
  camera.position.copy(camPos);

  // The options panel covers the right edge and the chart covers the bottom.
  // The picture is shifted so its centre sits in the middle of the free area.
  let insetRight = 0, insetBottom = 0, sized = "";
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const key = `${w},${h},${insetRight},${insetBottom}`;
    if (key === sized || !w || !h) return;
    sized = key;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.setViewOffset(w, h, insetRight / 2, insetBottom / 2, w, h);
    camera.updateProjectionMatrix();
  }

  // Note effects: each note pulses a ring of its own colour at its own spot around the body.
  // The spots sit behind the figure, so the body covers the middle of each ring and the effect has depth.
  const SPOTS = { low: [0, 0.6, -0.45], down: [-0.6, 0.6, -0.45], right: [0.6, 0.85, -0.45], left: [-0.55, 1.3, -0.45], up: [0, 1.75, -0.45] };
  const ringGeo = new THREE.RingGeometry(0.8, 1, 48), orbGeo = new THREE.SphereGeometry(0.1, 12, 10);
  const glowMat = (color, depthTest = false) => new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest, side: THREE.DoubleSide });
  let effects = []; // { mesh, age, life, grow, base }
  function pulse(id, color) {
    const [x, y, z] = SPOTS[id];
    const at = new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.rotation.y).add(player.position);
    for (const [delay, grow] of [[0, 0.8], [0.12, 0.5]]) {
      const mesh = new THREE.Mesh(ringGeo, glowMat(color, true));
      mesh.position.copy(at); mesh.visible = false; scene.add(mesh);
      effects.push({ mesh, age: -delay, life: 0.55, grow, base: 0.1 });
    }
    const orb = new THREE.Mesh(orbGeo, glowMat(color, true));
    orb.position.copy(at); scene.add(orb);
    effects.push({ mesh: orb, age: 0, life: 0.35, grow: -0.9, base: 1, flat: true });
  }
  function twinkle() {
    for (let i = 0; i < 18; i++) {
      const mesh = new THREE.Mesh(orbGeo, glowMat(i % 3 ? 0xffffff : 0x58e0d0, true));
      const a = Math.random() * Math.PI * 2, r = 0.45 + Math.random() * 0.5;
      mesh.position.set(player.position.x + Math.cos(a) * r, player.position.y + 0.3 + Math.random() * 1.5, player.position.z + Math.sin(a) * r * 0.6 + 0.2);
      scene.add(mesh);
      effects.push({ mesh, age: -Math.random() * 0.25, life: 0.7, grow: -0.3, base: 0.22 + Math.random() * 0.25, flat: true, rise: 0.7 });
    }
    glow = 1;
  }
  // One lyre note: a soft gold ring that opens behind the figure. `strength` is 0 to 1.
  function lyreRing(strength) {
    const mesh = new THREE.Mesh(ringGeo, glowMat(0xffd98a, true));
    mesh.position.set(player.position.x, player.position.y + 0.95, player.position.z - 0.8);
    mesh.visible = false; scene.add(mesh);
    effects.push({ mesh, age: 0, life: 0.8, grow: 1.3, base: 0.5, amp: 0.4 * strength });
  }
  function updateEffects(dt) {
    for (const e of effects) {
      e.age += dt;
      if (e.age < 0) continue;
      const t = Math.min(1, e.age / e.life);
      e.mesh.visible = true;
      e.mesh.scale.setScalar(Math.max(0.01, e.base + e.grow * t));
      e.mesh.material.opacity = (e.amp ?? 1) * (1 - t) ** 1.6;
      if (e.rise) e.mesh.position.y += e.rise * dt;
      if (e.onWater) e.mesh.position.y = waterY + 0.06;
      if (!e.flat) e.mesh.quaternion.copy(camera.quaternion);
      if (t >= 1) { scene.remove(e.mesh); e.mesh.material.dispose(); e.done = true; }
    }
    effects = effects.filter((e) => !e.done);
  }

  return {
    levels: LEVELS.length,
    onPlate: () => Math.hypot(player.position.x - PLATE.x, player.position.z - PLATE.z) < 1.0,
    /** Move the figure. `dx` and `dz` are -1 to 1. */
    move(dx, dz, dt) {
      const len = Math.hypot(dx, dz);
      if (!len) return;
      player.position.x = THREE.MathUtils.clamp(player.position.x + (dx / len) * 3.2 * dt, -BOUNDS.x, BOUNDS.x);
      player.position.z = THREE.MathUtils.clamp(player.position.z + (dz / len) * 3.2 * dt, -BOUNDS.z, BOUNDS.z);
      player.rotation.y = Math.atan2(dx, dz);
      walking = 1;
    },
    /** A note was played: squash the figure. */
    bump() { squash = 1; },
    /** The ocarina came out: a small hop. */
    hop() { hopT = 1; },
    /** A Rhythm Pass: a big burst of light and a camera punch. */
    celebrate() {
      twinkle(); twinkle();
      for (const [id, color] of [["up", 0x58e0d0], ["left", 0xffffff], ["right", 0x58e0d0], ["down", 0xffffff]]) pulse(id, color);
      glow = 1.8; fovKick = 1;
    },
    setPlaying(on) { playing = on; ocarina.visible = on; if (on) player.rotation.y = 0; },
    pulse, twinkle, lyreRing,
    /** Show or hide the floating "E" key over the plate. */
    setPrompt(on) { promptOn = on; },
    /** How many pixels the options panel and the chart cover on the right and at the bottom. */
    setInsets(right, bottom) { insetRight = Math.round(right); insetBottom = Math.round(bottom); },
    /** Move the water to the next height. It rises twice, then drains. */
    nextLevel() {
      level = (level + 1) % LEVELS.length;
      // Ripples spread across the pool as the water starts to move.
      for (let i = 0; i < 4; i++) {
        const mat = glowMat(0x9ff3ea);
        mat.depthTest = true; // ripples lie on the water, so the platform must hide them
        const mesh = new THREE.Mesh(ringGeo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(0, waterY + 0.06, 4.5);
        mesh.visible = false; scene.add(mesh);
        effects.push({ mesh, age: -i * 0.28, life: 1.7, grow: 6.5, base: 0.4, flat: true, amp: 0.5, onWater: true });
      }
      return level;
    },
    update(dt) {
      time += dt;
      resize();
      waterY += (LEVELS[level] - waterY) * Math.min(1, dt * 1.4);
      water.position.y = waterY + Math.sin(time * 1.3) * 0.03;
      for (const c of crates) {
        c.position.y = waterY + 0.12 + Math.sin(time * 1.1 + c.userData.phase) * 0.06;
        c.rotation.z = Math.sin(time * 0.7 + c.userData.phase) * 0.05;
      }
      marks.forEach((m, i) => { m.material.emissiveIntensity = i === level ? 1.4 : 0.15; });
      glow = Math.max(0, glow - dt * 0.8);
      ringMat.emissiveIntensity = 0.9 + Math.sin(time * 2.2) * 0.25 + glow * 4;
      plateLight.intensity = 6 + glow * 30;
      // Feel: the figure squashes on each note, hops when the ocarina comes out, bobs as it walks and breathes at rest.
      squash = Math.max(0, squash - dt * 7);
      hopT = Math.max(0, hopT - dt * 2.8);
      walking = Math.max(0, walking - dt * 6);
      const s = squash * squash;
      player.scale.set(1 + s * 0.12, 1 - s * 0.16 + Math.sin(time * 2.2) * 0.012, 1 + s * 0.12);
      player.position.y = TOP + Math.sin(hopT * Math.PI) * 0.32 * (hopT > 0 ? 1 : 0) + Math.abs(Math.sin(time * 11)) * 0.07 * walking;
      // Camera punch on a Rhythm Pass: a quick push in that eases back out.
      fovKick = Math.max(0, fovKick - dt * 1.6);
      const fov = 55 - 8 * fovKick * fovKick;
      if (Math.abs(fov - camera.fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
      const p = player.position;
      // Walking: a wide view of the room. Playing: the camera punches in to a medium close-up on the figure.
      const wantPos = playing ? new THREE.Vector3(p.x + 0.5, p.y + 1.35, p.z + 3.5) : new THREE.Vector3(p.x * 0.6, p.y + 3.6, p.z + 8.2);
      const wantLook = playing ? new THREE.Vector3(p.x, p.y + 0.95, p.z) : new THREE.Vector3(p.x * 0.6, p.y + 0.3, p.z - 1.5);
      const k = Math.min(1, dt * 6);
      camPos.lerp(wantPos, k); camLook.lerp(wantLook, k);
      camera.position.copy(camPos); camera.lookAt(camLook);
      // The "E" key eases in over the figure's head, bobs gently, and eases out.
      promptT = THREE.MathUtils.clamp(promptT + (promptOn ? dt : -dt) * 5, 0, 1);
      const ease = promptT * promptT * (3 - 2 * promptT);
      keyPrompt.visible = promptT > 0;
      keyPrompt.material.opacity = ease;
      keyPrompt.scale.setScalar(0.5 * (0.7 + 0.3 * ease));
      keyPrompt.position.set(PLATE.x, TOP + 2.25 + 0.15 * ease + Math.sin(time * 2.4) * 0.05, PLATE.z);
      updateEffects(dt);
      renderer.render(scene, camera);
    },
  };
}
