import * as THREE from './three.module.min.js';

/* ---------------- Data ---------------- */
const CITIES = [
  { name: 'Port Louis', country: 'Mauritius', lat: -20.16, lon: 57.49, pop: '147k', tz: 'Indian/Mauritius' },
  { name: 'New York', country: 'United States', lat: 40.71, lon: -74.0, pop: '8.3M', tz: 'America/New_York' },
  { name: 'Los Angeles', country: 'United States', lat: 34.05, lon: -118.24, pop: '3.9M', tz: 'America/Los_Angeles' },
  { name: 'Rio de Janeiro', country: 'Brazil', lat: -22.91, lon: -43.17, pop: '6.7M', tz: 'America/Sao_Paulo' },
  { name: 'London', country: 'United Kingdom', lat: 51.5, lon: -0.12, pop: '8.9M', tz: 'Europe/London' },
  { name: 'Paris', country: 'France', lat: 48.85, lon: 2.35, pop: '2.1M', tz: 'Europe/Paris' },
  { name: 'Cairo', country: 'Egypt', lat: 30.04, lon: 31.24, pop: '9.5M', tz: 'Africa/Cairo' },
  { name: 'Cape Town', country: 'South Africa', lat: -33.92, lon: 18.42, pop: '4.6M', tz: 'Africa/Johannesburg' },
  { name: 'Moscow', country: 'Russia', lat: 55.76, lon: 37.62, pop: '12.5M', tz: 'Europe/Moscow' },
  { name: 'Dubai', country: 'UAE', lat: 25.2, lon: 55.27, pop: '3.4M', tz: 'Asia/Dubai' },
  { name: 'Mumbai', country: 'India', lat: 19.08, lon: 72.88, pop: '12.4M', tz: 'Asia/Kolkata' },
  { name: 'Singapore', country: 'Singapore', lat: 1.35, lon: 103.82, pop: '5.9M', tz: 'Asia/Singapore' },
  { name: 'Tokyo', country: 'Japan', lat: 35.68, lon: 139.69, pop: '13.9M', tz: 'Asia/Tokyo' },
  { name: 'Sydney', country: 'Australia', lat: -33.87, lon: 151.21, pop: '5.3M', tz: 'Australia/Sydney' },
];

const R = 1;
const UP = new THREE.Vector3(0, 1, 0);
const CAM_DIR = new THREE.Vector3(0, 0, 1);

/* ---------------- Helpers ---------------- */
function latLonToVec3(lat, lon, r) {
  const phi = (90 - lat) * Math.PI / 180;   // polar angle
  const sphPhi = Math.PI - lon * Math.PI / 180; // three.js sphere azimuth
  return new THREE.Vector3(
    -Math.cos(sphPhi) * Math.sin(phi) * r,
    Math.cos(phi) * r,
    Math.sin(sphPhi) * Math.sin(phi) * r
  );
}

// Orientation quaternion that puts `dir` facing the camera (+Z) with north up.
function orientationFor(dir) {
  const m = dir.clone().normalize();
  const qS = new THREE.Quaternion().setFromUnitVectors(m, CAM_DIR);
  const nP = new THREE.Vector3(0, 1, 0).applyQuaternion(qS);
  let alpha = Math.atan2(nP.x, nP.y);
  const yAfter = nP.x * Math.sin(alpha) + nP.y * Math.cos(alpha);
  if (yAfter < 0) alpha += Math.PI;
  const qR = new THREE.Quaternion().setFromAxisAngle(CAM_DIR, alpha);
  return qR.multiply(qS);
}

// Sun direction from the real UTC time (subsolar point).
function computeSunDir() {
  const now = new Date();
  const utcH = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
  const lonDeg = (12 - utcH) * 15;
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const doy = Math.floor((now.getTime() - start) / 864e5);
  const dec = -23.44 * Math.PI / 180 * Math.cos(2 * Math.PI * (doy + 10) / 365);
  const lon = lonDeg * Math.PI / 180;
  return new THREE.Vector3(
    Math.cos(dec) * Math.cos(lon),
    Math.sin(dec),
    Math.cos(dec) * Math.sin(lon)
  ).normalize();
}

/* ---------------- Renderer / scene ---------------- */
const container = document.getElementById('scene');
const labelsEl = document.getElementById('labels');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (e) {
  document.getElementById('loader').innerHTML = '<p>WebGL is not available on this device.</p>';
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 300);
let targetDist = 3.1;
camera.position.set(0, 0, targetDist);

const world = new THREE.Group();
scene.add(world);

/* ---------------- Textures & globe ---------------- */
const texLoader = new THREE.TextureLoader();
function loadTex(url) {
  return new Promise((resolve, reject) => {
    texLoader.load(url, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; resolve(t); }, undefined, reject);
  });
}

const globeUniforms = {
  dayMap: { value: null },
  nightMap: { value: null },
  sunDir: { value: computeSunDir() },
};

const globeMat = new THREE.ShaderMaterial({
  uniforms: globeUniforms,
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    void main() {
      vUv = uv;
      vNormal = normalize(mat3(modelMatrix) * normal);
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: `
    uniform sampler2D dayMap;
    uniform sampler2D nightMap;
    uniform vec3 sunDir;
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    void main() {
      vec3 n = normalize(vNormal);
      vec3 viewDir = normalize(cameraPosition - vWorldPos);
      vec3 sun = normalize(sunDir);
      vec3 day = texture2D(dayMap, vUv).rgb;
      vec3 night = texture2D(nightMap, vUv).rgb;
      float sd = dot(n, sun);
      float dayMix = smoothstep(-0.12, 0.28, sd);
      float water = smoothstep(0.04, 0.14, day.b - day.r);
      vec3 dayLit = day * (0.10 + 1.1 * clamp(sd, 0.0, 1.0));
      vec3 hv = normalize(sun + viewDir);
      float spec = pow(max(dot(n, hv), 0.0), 42.0) * water * dayMix;
      vec3 nightCol = night * vec3(1.2, 1.12, 1.0) * 1.5 + day * 0.02;
      vec3 col = mix(nightCol, dayLit, dayMix);
      col += vec3(1.0, 0.55, 0.2) * spec * 1.4;
      float term = smoothstep(-0.18, 0.02, sd) * (1.0 - smoothstep(0.02, 0.3, sd));
      col += vec3(0.9, 0.35, 0.1) * term * 0.30;
      float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 2.6);
      col += vec3(0.3, 0.55, 1.0) * fres * (0.25 + 0.75 * dayMix);
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});

const markers = [];
const hitMeshes = [];

function makeDotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(103,232,249,0.9)');
  grad.addColorStop(1, 'rgba(103,232,249,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildGraticule() {
  const pts = [];
  const seg = (a, b) => { pts.push(a.x, a.y, a.z, b.x, b.y, b.z); };
  for (let lon = -180; lon < 180; lon += 20) {
    let prev = latLonToVec3(-90, lon, R * 1.002);
    for (let lat = -80; lat <= 90; lat += 10) {
      const p = latLonToVec3(lat, lon, R * 1.002);
      seg(prev, p); prev = p;
    }
  }
  for (let lat = -60; lat <= 60; lat += 20) {
    let prev = latLonToVec3(lat, -180, R * 1.002);
    for (let lon = -160; lon <= 180; lon += 10) {
      const p = latLonToVec3(lat, lon, R * 1.002);
      seg(prev, p); prev = p;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
    color: 0x60a5fa, transparent: true, opacity: 0.14, depthWrite: false,
  }));
}

/* ---------------- Interaction state ---------------- */
let dragging = false;
let lastX = 0, lastY = 0;
let velX = 0, velY = 0;           // inertia, in px/frame
let idleTime = 99;
let autoRotate = true;
let flying = false;
let flyFrom = new THREE.Quaternion();
let flyToQ = new THREE.Quaternion();
let flyT = 0;
const FLY_DUR = 1.35;
let selectedCity = null;
const pointers = new Map();
let pinchDist = 0;
let downX = 0, downY = 0;

const _qy = new THREE.Quaternion();
const _qx = new THREE.Quaternion();
const _q = new THREE.Quaternion();
function rotateWorld(dxPx, dyPx) {
  _qy.setFromAxisAngle(UP, dxPx * 0.0052);
  _qx.setFromAxisAngle(new THREE.Vector3(1, 0, 0), dyPx * 0.0052);
  _q.copy(_qy).multiply(_qx);
  world.quaternion.premultiply(_q);
}

function flyTo(city) {
  flyFrom.copy(world.quaternion);
  flyToQ.copy(orientationFor(city.dir));
  // shortest path
  if (flyFrom.dot(flyToQ) < 0) {
    flyToQ.set(-flyToQ.x, -flyToQ.y, -flyToQ.z, -flyToQ.w);
  }
  flyT = 0;
  flying = true;
  targetDist = 2.15;
}

function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

/* ---------------- City card ---------------- */
const card = document.getElementById('cityCard');
let clockTimer = null;

function fmtTime(tz) {
  try {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date());
  } catch (e) { return '--:--'; }
}

function selectCity(city, fly = true) {
  selectedCity = city;
  document.getElementById('cardName').textContent = city.name;
  document.getElementById('cardCountry').textContent = city.country;
  document.getElementById('cardPop').textContent = city.pop;
  document.getElementById('cardLat').textContent = `${Math.abs(city.lat).toFixed(2)}° ${city.lat >= 0 ? 'N' : 'S'}`;
  document.getElementById('cardLon').textContent = `${Math.abs(city.lon).toFixed(2)}° ${city.lon >= 0 ? 'E' : 'W'}`;
  const tick = () => { document.getElementById('cardTime').textContent = fmtTime(city.tz); };
  tick();
  clearInterval(clockTimer);
  clockTimer = setInterval(tick, 15000);
  card.classList.remove('hidden');
  if (fly) flyTo(city);
  hideSearch();
}

document.getElementById('cardClose').addEventListener('click', () => {
  card.classList.add('hidden');
  selectedCity = null;
  clearInterval(clockTimer);
});

/* ---------------- Search ---------------- */
const searchInput = document.getElementById('search');
const searchResults = document.getElementById('searchResults');

function hideSearch() {
  searchResults.classList.add('hidden');
  searchResults.innerHTML = '';
}

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) { hideSearch(); return; }
  const hits = CITIES.filter(c =>
    c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q)
  ).slice(0, 6);
  if (!hits.length) {
    searchResults.innerHTML = '<div class="no-hit">No matches</div>';
  } else {
    searchResults.innerHTML = hits.map((c, i) =>
      `<button data-i="${CITIES.indexOf(c)}">${c.name}<span>${c.country}</span></button>`
    ).join('');
  }
  searchResults.classList.remove('hidden');
});

searchResults.addEventListener('click', e => {
  const btn = e.target.closest('button[data-i]');
  if (!btn) return;
  searchInput.value = '';
  selectCity(CITIES[+btn.dataset.i]);
});

document.addEventListener('pointerdown', e => {
  if (!e.target.closest('.hud-search')) hideSearch();
});

/* ---------------- Buttons ---------------- */
const btnRotate = document.getElementById('btnRotate');
btnRotate.addEventListener('click', () => {
  autoRotate = !autoRotate;
  btnRotate.classList.toggle('active', autoRotate);
});
document.getElementById('btnReset').addEventListener('click', () => {
  card.classList.add('hidden');
  selectedCity = null;
  flyFrom.copy(world.quaternion);
  flyToQ.copy(orientationFor(CITIES[0].dir));
  if (flyFrom.dot(flyToQ) < 0) flyToQ.set(-flyToQ.x, -flyToQ.y, -flyToQ.z, -flyToQ.w);
  flyT = 0; flying = true;
  targetDist = 3.1;
});

/* ---------------- Pointer controls ---------------- */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const dom = renderer.domElement;

dom.addEventListener('pointerdown', e => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) {
    dragging = true;
    lastX = downX = e.clientX; lastY = downY = e.clientY;
    velX = velY = 0;
    flying = false;
  } else if (pointers.size === 2) {
    const p = [...pointers.values()];
    pinchDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    dragging = false;
  }
  idleTime = 0;
  dom.setPointerCapture(e.pointerId);
});

dom.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  idleTime = 0;
  if (pointers.size === 2) {
    const p = [...pointers.values()];
    const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    if (pinchDist > 0) targetDist = THREE.MathUtils.clamp(targetDist * (pinchDist / d), 1.55, 5.5);
    pinchDist = d;
    return;
  }
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  rotateWorld(dx, dy);
  velX = dx; velY = dy;
});

function endPointer(e) {
  const wasTap = pointers.size === 1 && dragging &&
    Math.hypot(e.clientX - downX, e.clientY - downY) < 8;
  pointers.delete(e.pointerId);
  if (pointers.size === 0) dragging = false;
  if (wasTap) handleTap(e.clientX, e.clientY);
}
dom.addEventListener('pointerup', endPointer);
dom.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); dragging = false; });

dom.addEventListener('wheel', e => {
  e.preventDefault();
  targetDist = THREE.MathUtils.clamp(targetDist * (1 + Math.sign(e.deltaY) * 0.09), 1.55, 5.5);
  idleTime = 0;
}, { passive: false });

function handleTap(x, y) {
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(hitMeshes, false);
  if (hits.length) selectCity(hits[0].object.userData.city);
}

/* ---------------- Labels ---------------- */
const _lv = new THREE.Vector3();
const _lp = new THREE.Vector3();
const _lc = new THREE.Vector3();

function updateLabels() {
  const w = window.innerWidth, h = window.innerHeight;
  const close = camera.position.z < 2.7;
  for (const mk of markers) {
    _lv.copy(mk.dir).applyQuaternion(world.quaternion);
    _lc.copy(camera.position).sub(_lv).normalize();
    const facing = _lv.clone().normalize().dot(_lc);
    if (facing > 0.12) {
      _lp.copy(_lv).project(camera);
      const x = (_lp.x * 0.5 + 0.5) * w;
      const y = (-_lp.y * 0.5 + 0.5) * h;
      mk.el.style.transform = `translate(-50%,-140%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      mk.el.classList.add('visible');
      mk.el.classList.toggle('named', close || (selectedCity && selectedCity.name === mk.city.name));
      mk.el.classList.toggle('selected', !!(selectedCity && selectedCity.name === mk.city.name));
    } else {
      mk.el.classList.remove('visible');
    }
  }
}

/* ---------------- Clock ---------------- */
function tickClock() {
  document.getElementById('utcClock').textContent =
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date());
}
tickClock();
setInterval(tickClock, 10000);
setInterval(() => { globeUniforms.sunDir.value.copy(computeSunDir()); }, 60000);

/* ---------------- Resize ---------------- */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------------- Main loop ---------------- */
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  idleTime += dt;

  if (flying) {
    flyT += dt / FLY_DUR;
    const t = Math.min(flyT, 1);
    world.quaternion.slerpQuaternions(flyFrom, flyToQ, easeInOut(t));
    if (t >= 1) flying = false;
  } else if (!dragging) {
    if (Math.abs(velX) > 0.01 || Math.abs(velY) > 0.01) {
      rotateWorld(velX * dt * 60, velY * dt * 60);
      const d = Math.pow(0.93, dt * 60);
      velX *= d; velY *= d;
    } else if (autoRotate && idleTime > 3.5) {
      rotateWorld(dt * 14, 0);
    }
  }

  camera.position.z += (targetDist - camera.position.z) * Math.min(1, dt * 8);
  updateLabels();
  renderer.render(scene, camera);
}

/* ---------------- Boot ---------------- */
(async function init() {
  try {
    const [dayTex, nightTex, skyTex] = await Promise.all([
      loadTex('textures/earth-day.jpg'),
      loadTex('textures/earth-night.jpg'),
      loadTex('textures/night-sky.png'),
    ]);
    globeUniforms.dayMap.value = dayTex;
    globeUniforms.nightMap.value = nightTex;

    const globe = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 96), globeMat);
    world.add(globe);
    world.add(buildGraticule());

    // Atmosphere glow
    const atm = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.22, 64, 64),
      new THREE.ShaderMaterial({
        vertexShader: `
          varying vec3 vNv;
          void main() {
            vNv = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          varying vec3 vNv;
          void main() {
            float intensity = pow(0.72 - dot(vNv, vec3(0.0, 0.0, 1.0)), 3.2);
            gl_FragColor = vec4(0.35, 0.6, 1.0, 1.0) * intensity;
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      })
    );
    scene.add(atm);

    // Starfield
    const stars = new THREE.Mesh(
      new THREE.SphereGeometry(90, 32, 32),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false })
    );
    scene.add(stars);

    // Markers
    const dotTex = makeDotTexture();
    for (const city of CITIES) {
      city.dir = latLonToVec3(city.lat, city.lon, 1);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: dotTex, color: 0x67e8f9, transparent: true, depthWrite: false,
      }));
      sprite.position.copy(city.dir).multiplyScalar(R * 1.012);
      sprite.scale.setScalar(0.055);
      world.add(sprite);

      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 8),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hit.position.copy(city.dir).multiplyScalar(R * 1.012);
      hit.userData.city = city;
      world.add(hit);
      hitMeshes.push(hit);

      const el = document.createElement('button');
      el.className = 'marker-label';
      el.innerHTML = `<span class="dot"></span><span class="name">${city.name}</span>`;
      el.addEventListener('click', ev => { ev.stopPropagation(); selectCity(city); });
      labelsEl.appendChild(el);
      markers.push({ city, dir: city.dir, el });
    }

    // Start facing Port Louis (home waters), north up
    world.quaternion.copy(orientationFor(CITIES[0].dir));

    document.getElementById('loader').classList.add('done');
    animate();
  } catch (err) {
    document.getElementById('loader').innerHTML = '<p>Could not load Earth imagery. Check your connection and reload.</p>';
    console.error(err);
  }
})();
