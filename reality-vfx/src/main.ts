/// <reference types="vite/client" />
import * as THREE from 'three';
import { removeBackground } from '@imgly/background-removal';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <main class="app">
    <header>
      <div class="brand"><div class="logo">R</div><div><h1>Reality VFX Studio</h1><div class="sub">Mobile-first video compositing prototype</div></div></div>
      <span class="pill">AR TRACKING · PWA</span>
    </header>
    <div class="layout">
      <section class="panel">
        <div class="stage" id="stage">
          <video id="sourceVideo" playsinline muted loop></video>
          <canvas id="glCanvas"></canvas>
          <canvas id="compositeCanvas"></canvas>
          <canvas id="videoCutoutCanvas"></canvas>
          <img id="foregroundLayer" alt="Foreground cutout overlay" />
          <div class="empty"><strong>Your scene starts here</strong><span>Record a clip or import a video to add a 3D character.</span></div>
        </div>
        <div class="stage-actions">
          <button class="primary" id="recordBtn">● Record camera</button><button id="arBtn">◎ Start AR</button>
          <button id="importBtn">Import video</button>
          <button id="playBtn" disabled>▶ Play</button>
          <button id="resetBtn">Reset object</button>
          <input id="fileInput" type="file" accept="video/*" />
        </div>
        <p class="hint">Tip: drag the 3D object inside the preview to position it. Use the sliders to adjust depth-like size and orientation.</p>
      </section>
      <aside class="panel controls">
        <div>
          <p class="section-title">3D subject</p>
          <select id="subject">
            <option value="dino">Tiny dinosaur</option>
            <option value="elephant">Elephant placeholder</option>
            <option value="robot">Sci-fi robot placeholder</option>
          </select>
        </div>
        <div class="control"><label>Scale <output id="scaleOut">1.0×</output></label><input id="scale" type="range" min="0.35" max="2.5" step="0.05" value="1"></div>
        <div class="control"><label>Rotation <output id="rotOut">0°</output></label><input id="rotation" type="range" min="-180" max="180" step="1" value="0"></div>
        <div class="control"><label>Vertical position <output id="yOut">50%</output></label><input id="ypos" type="range" min="10" max="90" step="1" value="62"></div>
        <div class="control"><label>Horizontal position <output id="xOut">50%</output></label><input id="xpos" type="range" min="5" max="95" step="1" value="52"></div>
        <div class="row"><button id="toggleObject">Hide object</button><button id="gridToggle">Show guides</button>
          <label class="file-control">Foreground cutout<input id="foregroundInput" type="file" accept="image/png,image/webp" /></label>
          <label class="file-control">AI image cutout<input id="aiCutoutInput" type="file" accept="image/*" /></label>
          <button id="aiCutoutBtn" disabled>AI remove background</button>
          <button id="videoCutoutBtn" disabled>AI video cutout (12 sec)</button></div>
        <div>
          <p class="section-title">Cinematic look</p>
          <select id="lighting"><option value="neutral">Neutral daylight</option><option value="warm">Warm sunset</option><option value="cool">Cool moonlight</option></select>
          <div class="control"><label>Contact shadow <output id="shadowOut">45%</output></label><input id="shadow" type="range" min="0" max="90" value="45" /></div>
          <p class="hint">Upload a transparent PNG/WebP cutout of foreground objects to layer them above the 3D subject.</p>
          <p class="section-title">Export</p>
          <button class="primary" id="exportBtn" disabled>Export composite video</button>
          <p class="status" id="status">Import or record a video to begin.</p>
          <p class="hint">Exports WebM where supported by your browser. Use Chrome on Android or desktop. Camera access needs HTTPS or localhost.</p>
        </div>
      </aside>
    </div>
    <footer>AR mode uses WebXR hit-test plane detection where supported. Other browsers use the 2D editor fallback. This phase does not provide semantic scene reconstruction, automatic occlusion masks, or generative video.</footer>
  </main>
`;

const video = document.querySelector<HTMLVideoElement>('#sourceVideo')!;
const glCanvas = document.querySelector<HTMLCanvasElement>('#glCanvas')!;
const stage = document.querySelector<HTMLDivElement>('#stage')!;
const fileInput = document.querySelector<HTMLInputElement>('#fileInput')!;
const statusEl = document.querySelector<HTMLParagraphElement>('#status')!;
const playBtn = document.querySelector<HTMLButtonElement>('#playBtn')!;
const exportBtn = document.querySelector<HTMLButtonElement>('#exportBtn')!;
const compositeCanvas = document.querySelector<HTMLCanvasElement>('#compositeCanvas')!;
const videoCutoutCanvas = document.querySelector<HTMLCanvasElement>('#videoCutoutCanvas')!;
const videoCutoutBtn = document.querySelector<HTMLButtonElement>('#videoCutoutBtn')!;
const videoCutoutCtx = videoCutoutCanvas.getContext('2d')!;
const videoCutoutFrames: Array<{ time: number; bitmap: ImageBitmap }> = [];
let videoCutoutReady = false;
const foregroundLayer = document.querySelector<HTMLImageElement>('#foregroundLayer')!;
const foregroundInput = document.querySelector<HTMLInputElement>('#foregroundInput')!;
const aiCutoutInput = document.querySelector<HTMLInputElement>('#aiCutoutInput')!;
const aiCutoutBtn = document.querySelector<HTMLButtonElement>('#aiCutoutBtn')!;
let aiCutoutFile: File | null = null;
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-5, 5, 3.125, -3.125, 0.1, 100);
camera.position.set(0, 0, 20);
scene.add(new THREE.AmbientLight(0xffffff, 1.8));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(-4, 7, 10);
scene.add(keyLight);
const shadowCanvas = document.createElement('canvas');
shadowCanvas.width = 256; shadowCanvas.height = 128;
const shadowCtx = shadowCanvas.getContext('2d')!;
const shadowGradient = shadowCtx.createRadialGradient(128, 64, 4, 128, 64, 64);
shadowGradient.addColorStop(0, 'rgba(0,0,0,0.55)');
shadowGradient.addColorStop(0.55, 'rgba(0,0,0,0.22)');
shadowGradient.addColorStop(1, 'rgba(0,0,0,0)');
shadowCtx.fillStyle = shadowGradient; shadowCtx.fillRect(0, 0, 256, 128);
const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
const contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.15), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, opacity: 0.45 }));
contactShadow.position.set(0, -1.38, -0.2); scene.add(contactShadow);
const subjectGroup = new THREE.Group();
scene.add(subjectGroup);
let showObject = true;
let showGuides = false;
let mediaStream: MediaStream | null = null;
let recordingChunks: Blob[] = [];
let recorder: MediaRecorder | null = null;
let dragPointer: number | null = null;
let xrHitTestSource: XRHitTestSource | null = null;
let xrReferenceSpace: XRReferenceSpace | null = null;
let arPlaced = false;
const arBtn = document.querySelector<HTMLButtonElement>('#arBtn')!;
const reticle = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.17, 32), new THREE.MeshBasicMaterial({ color: 0xffd45a, side: THREE.DoubleSide }));
reticle.rotation.x = -Math.PI / 2;
reticle.matrixAutoUpdate = false;
reticle.visible = false;
scene.add(reticle);

function material(color: number, roughness = 0.8) {
  return new THREE.MeshStandardMaterial({ color, roughness });
}
function mesh(geometry: THREE.BufferGeometry, color: number, x: number, y: number, z = 0) {
  const m = new THREE.Mesh(geometry, material(color));
  m.position.set(x, y, z);
  subjectGroup.add(m);
  return m;
}
function clearSubject() {
  subjectGroup.traverse(obj => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      const mat = obj.material;
      if (Array.isArray(mat)) mat.forEach(v => v.dispose()); else mat.dispose();
    }
  });
  subjectGroup.clear();
}
function addDino() {
  const green = 0x74bc61, dark = 0x397d4e, belly = 0xc7d98a;
  mesh(new THREE.SphereGeometry(0.78, 24, 18), green, 0, 0, 0); // torso
  const head = mesh(new THREE.SphereGeometry(0.48, 24, 18), green, 0.65, 0.63, 0.1);
  head.scale.set(1.18, 0.82, 0.85);
  mesh(new THREE.SphereGeometry(0.12, 16, 12), 0xffffff, 0.96, 0.76, 0.48);
  mesh(new THREE.SphereGeometry(0.055, 12, 10), 0x101820, 1.0, 0.76, 0.58);
  mesh(new THREE.ConeGeometry(0.22, 0.6, 12), dark, -0.8, -0.12, 0).rotation.z = Math.PI / 2;
  mesh(new THREE.SphereGeometry(0.28, 16, 12), belly, 0.18, -0.15, 0.48).scale.set(1.1, 1.4, 0.35);
  for (const x of [-0.42, 0.42]) {
    const leg = mesh(new THREE.CapsuleGeometry(0.16, 0.48, 5, 10), dark, x, -0.82, 0);
    leg.rotation.z = x < 0 ? -0.15 : 0.15;
    mesh(new THREE.SphereGeometry(0.2, 14, 10), dark, x + 0.05, -1.13, 0.05).scale.set(1.3, 0.6, 1);
  }
  for (let i = 0; i < 3; i++) mesh(new THREE.ConeGeometry(0.18, 0.38, 10), 0xe3a64b, -0.25 + i * 0.35, 0.7 + (i % 2) * 0.12, 0).rotation.z = -0.2;
}
function addElephant() {
  const grey = 0x8996a4;
  mesh(new THREE.SphereGeometry(0.85, 24, 18), grey, 0, 0, 0);
  mesh(new THREE.SphereGeometry(0.6, 24, 18), grey, 0.62, 0.35, 0.05);
  for (const x of [-0.65, 0.65]) mesh(new THREE.SphereGeometry(0.44, 18, 14), 0x6f7d8c, 0.62 + x * 0.65, 0.4, -0.12).scale.set(0.5, 1, 0.22);
  const trunk = mesh(new THREE.CapsuleGeometry(0.18, 0.58, 6, 14), grey, 1.04, -0.2, 0.1);
  trunk.rotation.z = -0.22;
  for (const x of [-0.48, 0.48]) mesh(new THREE.CapsuleGeometry(0.17, 0.65, 5, 12), grey, x, -0.9, 0);
  for (const x of [0.82, 1.13]) mesh(new THREE.ConeGeometry(0.09, 0.55, 12), 0xf0e6c9, x, -0.42, 0.2).rotation.z = 0.2;
}
function addRobot() {
  const blue = 0x4ba5d8, dark = 0x34465d;
  const body = mesh(new THREE.BoxGeometry(1.25, 1.15, 0.65), dark, 0, 0, 0);
  body.rotation.z = -0.05;
  mesh(new THREE.BoxGeometry(1.05, 0.72, 0.6), blue, 0, 0.92, 0);
  for (const x of [-0.26, 0.26]) mesh(new THREE.SphereGeometry(0.11, 16, 12), 0xffdb69, x, 1.0, 0.36);
  for (const x of [-0.42, 0.42]) mesh(new THREE.CapsuleGeometry(0.16, 0.6, 5, 10), blue, x, -0.9, 0);
  mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.48), blue, 0, 1.52, 0);
  mesh(new THREE.SphereGeometry(0.11), 0xff6d5f, 0, 1.79, 0);
}
function buildSubject(type: string) {
  clearSubject();
  if (type === 'elephant') addElephant();
  else if (type === 'robot') addRobot();
  else addDino();
  subjectGroup.scale.setScalar(Number((document.querySelector<HTMLInputElement>('#scale')!).value));
  applyPosition();
}
function applyPosition() {
  if (renderer.xr.isPresenting && arPlaced) { subjectGroup.visible = showObject; return; }
  const x = Number((document.querySelector<HTMLInputElement>('#xpos')!).value) / 100;
  const y = Number((document.querySelector<HTMLInputElement>('#ypos')!).value) / 100;
  subjectGroup.position.set((x - 0.5) * 9.6, (0.5 - y) * 5.8, 0);
  contactShadow.position.set(subjectGroup.position.x, subjectGroup.position.y - 1.28, -0.2);
  subjectGroup.rotation.z = THREE.MathUtils.degToRad(Number((document.querySelector<HTMLInputElement>('#rotation')!).value));
  subjectGroup.visible = showObject;
}
function resize() {
  const r = stage.getBoundingClientRect();
  const w = Math.max(1, Math.floor(r.width * renderer.getPixelRatio()));
  const h = Math.max(1, Math.floor(r.height * renderer.getPixelRatio()));
  renderer.setSize(r.width, r.height, false);
  camera.left = -5; camera.right = 5;
  camera.top = 5 * r.height / r.width / 2;
  camera.bottom = -camera.top;
  camera.updateProjectionMatrix();
  compositeCanvas.width = w; compositeCanvas.height = h;
  videoCutoutCanvas.width = w; videoCutoutCanvas.height = h;
}
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local');
renderer.setAnimationLoop((_, frame) => {
  if (frame && xrHitTestSource && xrReferenceSpace) {
    const hits = frame.getHitTestResults(xrHitTestSource);
    if (hits.length) {
      const pose = hits[0].getPose(xrReferenceSpace);
      if (pose) { reticle.visible = !arPlaced; reticle.matrix.fromArray(pose.transform.matrix); }
    } else if (!arPlaced) reticle.visible = false;
  }
  renderer.render(scene, camera);
});
new ResizeObserver(resize).observe(stage);
resize();
buildSubject('dino');

function setStatus(message: string) { statusEl.textContent = message; }
async function startAR() {
  if (!navigator.xr) { setStatus('WebXR is unavailable here. Use the 2D editor or a supported ARCore Android device in Chrome over HTTPS.'); return; }
  try {
    if (!(await navigator.xr.isSessionSupported('immersive-ar'))) { setStatus('This device/browser does not support immersive AR. The web editor remains available.'); return; }
    const session = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['local-floor', 'dom-overlay'], domOverlay: { root: document.body } });
    await renderer.xr.setSession(session);
    const viewerSpace = await session.requestReferenceSpace('viewer');
    xrReferenceSpace = await session.requestReferenceSpace('local');
    xrHitTestSource = await session.requestHitTestSource({ space: viewerSpace });
    arPlaced = false; subjectGroup.visible = false; reticle.visible = false;
    arBtn.textContent = 'AR active · tap floor';
    setStatus('Move your phone slowly to find a surface. Tap the screen to place the 3D subject.');
    const controller = renderer.xr.getController(0);
    controller.addEventListener('select', () => {
      if (!reticle.visible) { setStatus('No surface detected yet. Move the phone to scan the area.'); return; }
      subjectGroup.position.setFromMatrixPosition(reticle.matrix);
      subjectGroup.quaternion.setFromRotationMatrix(reticle.matrix);
      subjectGroup.visible = showObject; arPlaced = true; reticle.visible = false;
      setStatus('3D subject anchored to the detected surface. Move around to view it.');
    });
    scene.add(controller);
    session.addEventListener('end', () => {
      xrHitTestSource?.cancel(); xrHitTestSource = null; xrReferenceSpace = null;
      reticle.visible = false; arPlaced = false; arBtn.textContent = '◎ Start AR';
      applyPosition(); setStatus('AR session ended. Back in the video editor.');
    }, { once: true });
  } catch (error) { setStatus(error instanceof Error ? 'AR could not start: ' + error.message : 'AR session could not start.'); }
}
arBtn.addEventListener('click', () => { void startAR(); });
function setVideoSource(url: string) {
  video.src = url;
  video.style.display = 'block';
  stage.classList.add('has-video');
  void video.play().catch(() => {});
  playBtn.disabled = false;
  exportBtn.disabled = false;
  videoCutoutBtn.disabled = false;
  videoCutoutReady = false;
  videoCutoutFrames.forEach(frame => frame.bitmap.close()); videoCutoutFrames.length = 0;
  videoCutoutCtx.clearRect(0, 0, videoCutoutCanvas.width, videoCutoutCanvas.height);
  setStatus('Video loaded. Position your 3D subject and export.');
}
document.querySelector('#importBtn')!.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('video/')) { setStatus('Please select a video file.'); return; }
  if (video.src.startsWith('blob:')) URL.revokeObjectURL(video.src);
  setVideoSource(URL.createObjectURL(file));
});
document.querySelector('#recordBtn')!.addEventListener('click', async () => {
  try {
    if (recorder?.state === 'recording') {
      recorder.stop();
      return;
    }
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true });
    video.srcObject = mediaStream;
    video.style.display = 'block';
    stage.classList.add('has-video');
    await video.play();
    recordingChunks = [];
    recorder = new MediaRecorder(mediaStream);
    recorder.ondataavailable = e => { if (e.data.size) recordingChunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(recordingChunks, { type: recorder?.mimeType || 'video/webm' });
      setVideoSource(URL.createObjectURL(blob));
      mediaStream?.getTracks().forEach(t => t.stop());
      mediaStream = null;
      (document.querySelector('#recordBtn') as HTMLButtonElement).textContent = '● Record camera';
      setStatus('Camera clip captured and ready for compositing.');
    };
    recorder.start();
    (document.querySelector('#recordBtn') as HTMLButtonElement).textContent = '■ Stop recording';
    setStatus('Recording camera… press Stop recording when finished.');
  } catch (err) {
    setStatus(err instanceof Error ? err.message : 'Camera permission or device error.');
  }
});
playBtn.addEventListener('click', async () => {
  if (video.paused) { await video.play(); playBtn.textContent = 'Ⅱ Pause'; }
  else { video.pause(); playBtn.textContent = '▶ Play'; }
});
video.addEventListener('pause', () => { playBtn.textContent = '▶ Play'; });
video.addEventListener('play', () => { playBtn.textContent = 'Ⅱ Pause'; });
video.addEventListener('timeupdate', renderVideoCutoutPreview);
document.querySelector('#resetBtn')!.addEventListener('click', () => {
  (document.querySelector<HTMLInputElement>('#scale')!).value = '1';
  (document.querySelector<HTMLInputElement>('#rotation')!).value = '0';
  (document.querySelector<HTMLInputElement>('#xpos')!).value = '52';
  (document.querySelector<HTMLInputElement>('#ypos')!).value = '62';
  updateLabels(); applyPosition(); subjectGroup.scale.setScalar(1);
});
document.querySelector('#subject')!.addEventListener('change', e => buildSubject((e.target as HTMLSelectElement).value));
for (const id of ['scale', 'rotation', 'xpos', 'ypos']) {
  document.querySelector<HTMLInputElement>('#' + id)!.addEventListener('input', () => {
    updateLabels();
    if (id === 'scale') subjectGroup.scale.setScalar(Number((document.querySelector<HTMLInputElement>('#scale')!).value));
    applyPosition();
  });
}
function updateLabels() {
  (document.querySelector('#scaleOut')!).textContent = Number((document.querySelector<HTMLInputElement>('#scale')!).value).toFixed(2) + '×';
  (document.querySelector('#rotOut')!).textContent = (document.querySelector<HTMLInputElement>('#rotation')!).value + '°';
  (document.querySelector('#xOut')!).textContent = (document.querySelector<HTMLInputElement>('#xpos')!).value + '%';
  (document.querySelector('#yOut')!).textContent = (document.querySelector<HTMLInputElement>('#ypos')!).value + '%';
}
document.querySelector('#toggleObject')!.addEventListener('click', e => {
  showObject = !showObject; applyPosition();
  (e.currentTarget as HTMLButtonElement).textContent = showObject ? 'Hide object' : 'Show object';
});
document.querySelector('#gridToggle')!.addEventListener('click', e => {
  showGuides = !showGuides;
  (e.currentTarget as HTMLButtonElement).textContent = showGuides ? 'Hide guides' : 'Show guides';
  setStatus(showGuides ? 'Guides enabled conceptually; use the sliders for manual alignment.' : 'Guides hidden.');
});

function drawContainedImage(ctx: CanvasRenderingContext2D, image: CanvasImageSource, sourceWidth: number, sourceHeight: number, width: number, height: number) {
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale, drawHeight = sourceHeight * scale;
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}
function renderVideoCutoutPreview() {
  const w = videoCutoutCanvas.width, h = videoCutoutCanvas.height;
  videoCutoutCtx.clearRect(0, 0, w, h);
  if (!videoCutoutReady || !videoCutoutFrames.length) return;
  let frame = videoCutoutFrames[0];
  for (const candidate of videoCutoutFrames) {
    if (candidate.time <= video.currentTime) frame = candidate;
    else break;
  }
  drawContainedImage(videoCutoutCtx, frame.bitmap, frame.bitmap.width, frame.bitmap.height, w, h);
}
async function processVideoCutout() {
  if (!video.src || !Number.isFinite(video.duration) || video.duration <= 0) {
    setStatus('Import a finite-duration video before running video cutout.');
    return;
  }
  if (video.duration > 12) {
    setStatus('For mobile performance, trim the clip to 12 seconds or less and import it again.');
    return;
  }
  const wasPaused = video.paused;
  const previousTime = video.currentTime;
  const frameRate = 2;
  const count = Math.max(1, Math.ceil(video.duration * frameRate));
  const frames: Array<{ time: number; bitmap: ImageBitmap }> = [];
  videoCutoutBtn.disabled = true;
  videoCutoutBtn.textContent = 'AI video processing…';
  video.pause();
  try {
    const workCanvas = document.createElement('canvas');
    const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });
    if (!workCtx) throw new Error('Canvas processing is unavailable.');
    for (let index = 0; index < count; index++) {
      const time = Math.min(index / frameRate, Math.max(0, video.duration - 0.04));
      if (Math.abs(video.currentTime - time) > 0.015) {
        video.currentTime = time;
        await new Promise<void>((resolve, reject) => {
        const onSeeked = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); reject(new Error('Could not decode a video frame.')); };
        const cleanup = () => { video.removeEventListener('seeked', onSeeked); video.removeEventListener('error', onError); };
        video.addEventListener('seeked', onSeeked, { once: true });
        video.addEventListener('error', onError, { once: true });
        });
      }
      const factor = Math.min(1, 512 / Math.max(video.videoWidth, video.videoHeight));
      workCanvas.width = Math.max(1, Math.round(video.videoWidth * factor));
      workCanvas.height = Math.max(1, Math.round(video.videoHeight * factor));
      workCtx.drawImage(video, 0, 0, workCanvas.width, workCanvas.height);
      const sourceBlob = await new Promise<Blob>((resolve, reject) => workCanvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not encode a video frame.')), 'image/jpeg', 0.88));
      const cutoutBlob = await removeBackground(sourceBlob, { model: 'isnet_fp16', output: { format: 'image/png' } });
      const bitmap = await createImageBitmap(cutoutBlob);
      frames.push({ time, bitmap });
      setStatus('AI video cutout: ' + (index + 1) + ' / ' + count + ' frames processed (' + Math.round((index + 1) / count * 100) + '%).');
    }
    videoCutoutFrames.forEach(frame => frame.bitmap.close());
    videoCutoutFrames.splice(0, videoCutoutFrames.length, ...frames);
    videoCutoutReady = true;
    renderVideoCutoutPreview();
    setStatus('Video foreground cutout ready: ' + frames.length + ' sampled frames at 2 fps. Preview and export will composite the extracted subject.');
  } catch (error) {
    frames.forEach(frame => frame.bitmap.close());
    setStatus(error instanceof Error ? 'Video cutout failed: ' + error.message : 'Video cutout failed.');
  } finally {
    video.currentTime = previousTime;
    if (!wasPaused) await video.play().catch(() => {});
    videoCutoutBtn.disabled = false;
    videoCutoutBtn.textContent = 'AI video cutout (12 sec)';
  }
}
videoCutoutBtn.addEventListener('click', () => { void processVideoCutout(); });
function pointerToWorld(clientX: number, clientY: number) {
  const rect = glCanvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width - 0.5) * 10;
  const y = (0.5 - (clientY - rect.top) / rect.height) * (10 * rect.height / rect.width);
  return { x, y };
}
glCanvas.addEventListener('pointerdown', e => {
  dragPointer = e.pointerId;
  glCanvas.setPointerCapture(e.pointerId);
  const p = pointerToWorld(e.clientX, e.clientY);
  subjectGroup.position.set(p.x, p.y, 0);
  syncPositionSliders();
});
glCanvas.addEventListener('pointermove', e => {
  if (dragPointer !== e.pointerId) return;
  const p = pointerToWorld(e.clientX, e.clientY);
  subjectGroup.position.set(p.x, p.y, 0);
  syncPositionSliders();
});
glCanvas.addEventListener('pointerup', e => {
  if (dragPointer === e.pointerId) dragPointer = null;
});
function syncPositionSliders() {
  const x = Math.round((subjectGroup.position.x / 9.6 + 0.5) * 100);
  const y = Math.round((0.5 - subjectGroup.position.y / 5.8) * 100);
  (document.querySelector<HTMLInputElement>('#xpos')!).value = String(Math.max(5, Math.min(95, x)));
  (document.querySelector<HTMLInputElement>('#ypos')!).value = String(Math.max(10, Math.min(90, y)));
  updateLabels();
}
async function exportComposite() {
  if (!video.src && !video.srcObject) { setStatus('Load or record a video first.'); return; }
  if (!('captureStream' in compositeCanvas) || !('MediaRecorder' in window)) {
    setStatus('Video export is not supported by this browser.');
    return;
  }
  const ctx = compositeCanvas.getContext('2d');
  if (!ctx) return;
  const draw = () => {
    const w = compositeCanvas.width, h = compositeCanvas.height;
    ctx.clearRect(0, 0, w, h);
    if (video.readyState >= 2) {
      const vw = video.videoWidth || w, vh = video.videoHeight || h;
      const scale = Math.min(w / vw, h / vh);
      const dw = vw * scale, dh = vh * scale;
      ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh);
    }
    renderer.render(scene, camera);
    ctx.drawImage(glCanvas, 0, 0, w, h);
    if (foregroundLayer.complete && foregroundLayer.naturalWidth) ctx.drawImage(foregroundLayer, 0, 0, w, h);
    if (videoCutoutReady && videoCutoutFrames.length) {
      let frame = videoCutoutFrames[0];
      for (const candidate of videoCutoutFrames) { if (candidate.time <= video.currentTime) frame = candidate; else break; }
      drawContainedImage(ctx, frame.bitmap, frame.bitmap.width, frame.bitmap.height, w, h);
    }
  };
  const stream = compositeCanvas.captureStream(30);
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
  const out = new MediaRecorder(stream, { mimeType: mime });
  const chunks: Blob[] = [];
  out.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  out.onstop = () => {
    const blob = new Blob(chunks, { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'reality-vfx-composite.webm'; a.click();
    URL.revokeObjectURL(url);
    stream.getTracks().forEach(t => t.stop());
    setStatus('Export complete: reality-vfx-composite.webm');
  };
  const wasPaused = video.paused;
  if (wasPaused) await video.play().catch(() => {});
  out.start();
  setStatus('Rendering composite in real time…');
  let stopped = false;
  const stop = () => { if (!stopped) { stopped = true; out.stop(); } };
  const drawLoop = () => {
    if (out.state !== 'recording') return;
    draw();
    if (video.ended) stop();
    else requestAnimationFrame(drawLoop);
  };
  drawLoop();
  video.addEventListener('ended', stop, { once: true });
  // For looping inputs, export one pass rather than recording forever.
  const duration = Number.isFinite(video.duration) ? video.duration : 30;
  window.setTimeout(stop, Math.max(1, duration) * 1000 + 500);
}
exportBtn.addEventListener('click', () => { void exportComposite(); });
aiCutoutInput.addEventListener('change', () => {
  aiCutoutFile = aiCutoutInput.files?.[0] ?? null;
  aiCutoutBtn.disabled = !aiCutoutFile;
  if (aiCutoutFile) setStatus('Image selected. Run AI background removal to create a transparent foreground cutout.');
});
aiCutoutBtn.addEventListener('click', async () => {
  if (!aiCutoutFile) return;
  if (aiCutoutFile.size > 12 * 1024 * 1024) { setStatus('Choose an image under 12 MB for browser-based AI processing.'); return; }
  aiCutoutBtn.disabled = true;
  aiCutoutBtn.textContent = 'AI processing…';
  setStatus('Loading the AI segmentation model. The first run may take time and requires an internet connection.');
  try {
    const result = await removeBackground(aiCutoutFile, { model: 'isnet_fp16', output: { format: 'image/png' } });
    const url = URL.createObjectURL(result);
    const oldUrl = foregroundLayer.src;
    foregroundLayer.onload = () => { if (oldUrl.startsWith('blob:')) URL.revokeObjectURL(oldUrl); };
    foregroundLayer.src = url;
    foregroundLayer.style.display = 'block';
    setStatus('AI cutout ready. Transparent foreground layer is now above the 3D subject.');
  } catch (error) {
    setStatus(error instanceof Error ? 'AI cutout failed: ' + error.message : 'AI cutout failed. Try a smaller image or manual transparent PNG.');
  } finally {
    aiCutoutBtn.disabled = !aiCutoutFile;
    aiCutoutBtn.textContent = 'AI remove background';
  }
});
foregroundInput.addEventListener('change', () => {
  const file = foregroundInput.files?.[0];
  if (!file) return;
  if (!['image/png', 'image/webp'].includes(file.type)) { setStatus('Use a transparent PNG or WebP cutout.'); return; }
  if (foregroundLayer.src.startsWith('blob:')) URL.revokeObjectURL(foregroundLayer.src);
  foregroundLayer.src = URL.createObjectURL(file);
  foregroundLayer.style.display = 'block';
  setStatus('Foreground cutout loaded above the 3D subject. Align it to your video before export.');
});
document.querySelector<HTMLSelectElement>('#lighting')!.addEventListener('change', e => {
  const mode = (e.target as HTMLSelectElement).value;
  if (mode === 'warm') { keyLight.color.set(0xffc17a); keyLight.intensity = 2.5; }
  else if (mode === 'cool') { keyLight.color.set(0x9fc9ff); keyLight.intensity = 2.0; }
  else { keyLight.color.set(0xffffff); keyLight.intensity = 2.2; }
  setStatus('Virtual subject lighting preset changed. Source video color is unchanged.');
});
const shadowSlider = document.querySelector<HTMLInputElement>('#shadow')!;
shadowSlider.addEventListener('input', () => {
  const value = Number(shadowSlider.value) / 100;
  (contactShadow.material as THREE.MeshBasicMaterial).opacity = value;
  document.querySelector('#shadowOut')!.textContent = shadowSlider.value + '%';
});
updateLabels();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(error => console.warn('Service worker registration failed:', error)); });
}
