/// <reference types="vite/client" />
import * as THREE from 'three';
import { removeBackground } from '@imgly/background-removal';
import './style.css';

const MAX_VIDEO_BYTES = 250 * 1024 * 1024;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_AI_CLIP_SECONDS = 12;
const AI_SAMPLE_FPS = 2;
const AI_MAX_EDGE = 512;

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Application root #app was not found.');

app.innerHTML = [
  '<main class="app">',
  '<header><div class="brand"><div class="logo" aria-hidden="true">R</div><div><h1>Reality VFX Studio</h1><div class="sub">Browser-based compositing workspace</div></div></div><span class="pill">LOCAL MEDIA WORKFLOW</span></header>',
  '<div class="layout"><section class="panel editor-panel">',
  '<div class="stage" id="stage"><video id="sourceVideo" playsinline muted></video><canvas id="glCanvas" aria-label="3D subject preview"></canvas><canvas id="compositeCanvas"></canvas><canvas id="videoCutoutCanvas"></canvas><img id="foregroundLayer" alt="Foreground cutout overlay" /><div class="empty"><strong>Your scene starts here</strong><span>Record a clip or import a video to begin compositing.</span></div></div>',
  '<div class="stage-actions"><button class="primary" id="recordBtn">● Record camera</button><button id="importBtn">Import video</button><button id="playBtn" disabled>▶ Play</button><button id="resetBtn">Reset subject</button><input id="fileInput" type="file" accept="video/*" /></div>',
  '<p class="hint">Drag the subject in the preview to reposition it. Camera and microphone access require HTTPS or localhost.</p>',
  '</section><aside class="panel controls">',
  '<section><p class="section-title">3D subject</p><select id="subject" aria-label="Select 3D subject"><option value="dino">Tiny dinosaur</option><option value="robot">Sci-fi robot</option><option value="orb">Energy orb</option></select></section>',
  '<div class="control"><label for="scale">Scale <output id="scaleOut">1.00×</output></label><input id="scale" type="range" min="0.35" max="2.5" step="0.05" value="1" /></div>',
  '<div class="control"><label for="rotation">Rotation <output id="rotOut">0°</output></label><input id="rotation" type="range" min="-180" max="180" step="1" value="0" /></div>',
  '<div class="control"><label for="xpos">Horizontal position <output id="xOut">52%</output></label><input id="xpos" type="range" min="5" max="95" step="1" value="52" /></div>',
  '<div class="control"><label for="ypos">Vertical position <output id="yOut">62%</output></label><input id="ypos" type="range" min="10" max="90" step="1" value="62" /></div>',
  '<div class="row"><button id="toggleObject">Hide subject</button><label class="file-control">Foreground PNG/WebP<input id="foregroundInput" type="file" accept="image/png,image/webp" /></label></div>',
  '<section><p class="section-title">AI foreground extraction</p><label class="file-control full">Select image<input id="aiCutoutInput" type="file" accept="image/*" /></label><button id="aiCutoutBtn" class="full" disabled>AI remove image background</button><button id="videoCutoutBtn" class="full" disabled>AI video cutout (12 sec max)</button><p class="hint">AI inference runs in this browser. First use downloads model assets and may require substantial memory.</p></section>',
  '<section><p class="section-title">Virtual lighting</p><select id="lighting" aria-label="Lighting preset"><option value="neutral">Neutral daylight</option><option value="warm">Warm sunset</option><option value="cool">Cool moonlight</option></select><div class="control"><label for="shadow">Contact shadow <output id="shadowOut">45%</output></label><input id="shadow" type="range" min="0" max="90" value="45" /></div></section>',
  '<section><p class="section-title">Export</p><button class="primary full" id="exportBtn" disabled>Export WebM composite</button><p class="status" id="status" role="status" aria-live="polite">Import or record a video to begin.</p><p class="hint">Export is real-time WebM. Browser codec support and device performance vary.</p></section>',
  '</aside></div><footer>Reality VFX is a browser compositing prototype. AI video cutout samples frames at 2 fps; it is not full-frame-rate temporal segmentation. WebXR world tracking and depth-aware occlusion are not included in this editor build.</footer></main>'
].join('');

const query = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error('Required UI element missing: ' + selector);
  return element;
};

const video = query<HTMLVideoElement>('#sourceVideo');
const stage = query<HTMLDivElement>('#stage');
const glCanvas = query<HTMLCanvasElement>('#glCanvas');
const compositeCanvas = query<HTMLCanvasElement>('#compositeCanvas');
const videoCutoutCanvas = query<HTMLCanvasElement>('#videoCutoutCanvas');
const videoCutoutCtx = videoCutoutCanvas.getContext('2d')!;
const fileInput = query<HTMLInputElement>('#fileInput');
const statusEl = query<HTMLParagraphElement>('#status');
const playBtn = query<HTMLButtonElement>('#playBtn');
const exportBtn = query<HTMLButtonElement>('#exportBtn');
const recordBtn = query<HTMLButtonElement>('#recordBtn');
const foregroundLayer = query<HTMLImageElement>('#foregroundLayer');
const foregroundInput = query<HTMLInputElement>('#foregroundInput');
const aiCutoutInput = query<HTMLInputElement>('#aiCutoutInput');
const aiCutoutBtn = query<HTMLButtonElement>('#aiCutoutBtn');
const videoCutoutBtn = query<HTMLButtonElement>('#videoCutoutBtn');


let sourceObjectUrl: string | null = null;
let foregroundObjectUrl: string | null = null;
let cameraStream: MediaStream | null = null;
let recorder: MediaRecorder | null = null;
let recordingChunks: Blob[] = [];
let selectedAiImage: File | null = null;
let showSubject = true;
let dragPointer: number | null = null;
let videoCutoutFrames: Array<{ time: number; bitmap: ImageBitmap }> = [];
let videoCutoutReady = false;
let exportStop: (() => void) | null = null;

const renderer = new THREE.WebGLRenderer({
  canvas: glCanvas,
  alpha: true,
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-5, 5, 3.125, -3.125, 0.1, 100);
camera.position.set(0, 0, 20);
scene.add(new THREE.AmbientLight(0xffffff, 1.7));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
keyLight.position.set(-4, 7, 10);
scene.add(keyLight);

const subject = new THREE.Group();
scene.add(subject);

const shadowCanvas = document.createElement('canvas');
shadowCanvas.width = 256;
shadowCanvas.height = 128;
const shadowContext = shadowCanvas.getContext('2d');
if (shadowContext) {
  const gradient = shadowContext.createRadialGradient(128, 64, 4, 128, 64, 64);
  gradient.addColorStop(0, 'rgba(0,0,0,0.55)');
  gradient.addColorStop(0.55, 'rgba(0,0,0,0.2)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  shadowContext.fillStyle = gradient;
  shadowContext.fillRect(0, 0, 256, 128);
}
const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
const contactShadow = new THREE.Mesh(
  new THREE.PlaneGeometry(2.8, 1.15),
  new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, opacity: 0.45 })
);
contactShadow.position.set(0, -1.38, -0.2);
scene.add(contactShadow);

function setStatus(message: string): void {
  statusEl.textContent = message;
}

function makeMesh(geometry: THREE.BufferGeometry, color: number, x: number, y: number, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.72 }));
  mesh.position.set(x, y, z);
  subject.add(mesh);
  return mesh;
}

function clearSubject(): void {
  subject.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const material = object.material;
    if (Array.isArray(material)) material.forEach((item) => item.dispose());
    else material.dispose();
  });
  subject.clear();
}

function buildSubject(kind: string): void {
  clearSubject();
  if (kind === 'robot') {
    makeMesh(new THREE.BoxGeometry(1.15, 1.3, 0.8), 0x8ba6c4, 0, 0, 0);
    makeMesh(new THREE.BoxGeometry(0.9, 0.55, 0.72), 0x344f70, 0, 0.95, 0);
    makeMesh(new THREE.SphereGeometry(0.12, 16, 12), 0x62e6ff, -0.22, 1.02, 0.4);
    makeMesh(new THREE.SphereGeometry(0.12, 16, 12), 0x62e6ff, 0.22, 1.02, 0.4);
    makeMesh(new THREE.BoxGeometry(0.25, 0.9, 0.35), 0x607a98, -0.55, -0.85, 0);
    makeMesh(new THREE.BoxGeometry(0.25, 0.9, 0.35), 0x607a98, 0.55, -0.85, 0);
  } else if (kind === 'orb') {
    const orb = makeMesh(new THREE.SphereGeometry(0.95, 48, 32), 0x65cfff, 0, 0, 0);
    (orb.material as THREE.MeshStandardMaterial).metalness = 0.55;
    (orb.material as THREE.MeshStandardMaterial).roughness = 0.18;
    makeMesh(new THREE.TorusGeometry(1.25, 0.035, 12, 64), 0xffd36a, 0, 0, 0).rotation.x = 0.75;
    makeMesh(new THREE.TorusGeometry(1.4, 0.025, 12, 64), 0x8d7bff, 0, 0, 0).rotation.y = 0.8;
  } else {
    const green = 0x74bc61;
    makeMesh(new THREE.SphereGeometry(0.76, 24, 18), green, 0, 0, 0);
    const head = makeMesh(new THREE.SphereGeometry(0.46, 24, 18), green, 0.65, 0.62, 0.1);
    head.scale.set(1.18, 0.82, 0.85);
    makeMesh(new THREE.SphereGeometry(0.12, 16, 12), 0xffffff, 0.95, 0.76, 0.45);
    makeMesh(new THREE.SphereGeometry(0.055, 12, 10), 0x101820, 1, 0.76, 0.55);
    makeMesh(new THREE.ConeGeometry(0.2, 0.58, 12), 0x397d4e, -0.55, 0.72, 0);
    makeMesh(new THREE.ConeGeometry(0.2, 0.58, 12), 0x397d4e, -0.1, 0.78, 0);
    makeMesh(new THREE.ConeGeometry(0.2, 0.58, 12), 0x397d4e, 0.35, 0.82, 0);
    makeMesh(new THREE.CylinderGeometry(0.13, 0.16, 0.65, 12), 0x397d4e, -0.42, -0.82, 0);
    makeMesh(new THREE.CylinderGeometry(0.13, 0.16, 0.65, 12), 0x397d4e, 0.42, -0.82, 0);
  }
  applyPosition();
}

function applyPosition(): void {
  const x = Number(query<HTMLInputElement>('#xpos').value);
  const y = Number(query<HTMLInputElement>('#ypos').value);
  const rotation = Number(query<HTMLInputElement>('#rotation').value);
  subject.position.set((x / 100 - 0.5) * 9.2, (0.5 - y / 100) * 5.75, 0);
  subject.rotation.z = THREE.MathUtils.degToRad(rotation);
  subject.visible = showSubject;
  contactShadow.position.x = subject.position.x;
  contactShadow.position.y = subject.position.y - 1.25;
}

function updateLabels(): void {
  query<HTMLOutputElement>('#scaleOut').textContent = Number(query<HTMLInputElement>('#scale').value).toFixed(2) + '×';
  query<HTMLOutputElement>('#rotOut').textContent = query<HTMLInputElement>('#rotation').value + '°';
  query<HTMLOutputElement>('#xOut').textContent = query<HTMLInputElement>('#xpos').value + '%';
  query<HTMLOutputElement>('#yOut').textContent = query<HTMLInputElement>('#ypos').value + '%';
}

function resizeRenderer(): void {
  const rect = stage.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  renderer.setSize(width, height, false);
  camera.left = -5;
  camera.right = 5;
  camera.top = 5 * height / width;
  camera.bottom = -5 * height / width;
  camera.updateProjectionMatrix();
  compositeCanvas.width = Math.min(1920, Math.max(640, width * 2));
  compositeCanvas.height = Math.round(compositeCanvas.width * height / width);
  videoCutoutCanvas.width = compositeCanvas.width;
  videoCutoutCanvas.height = compositeCanvas.height;
  renderScene();
}

function renderScene(): void {
  renderer.render(scene, camera);
}

function drawContained(ctx: CanvasRenderingContext2D, image: CanvasImageSource, sourceWidth: number, sourceHeight: number, width: number, height: number): void {
  if (!sourceWidth || !sourceHeight) return;
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function clearVideoCutouts(): void {
  videoCutoutFrames.forEach((frame) => frame.bitmap.close());
  videoCutoutFrames = [];
  videoCutoutReady = false;
  videoCutoutCtx.clearRect(0, 0, videoCutoutCanvas.width, videoCutoutCanvas.height);
}

function renderVideoCutoutPreview(): void {
  videoCutoutCtx.clearRect(0, 0, videoCutoutCanvas.width, videoCutoutCanvas.height);
  if (!videoCutoutReady || videoCutoutFrames.length === 0) return;
  let selected = videoCutoutFrames[0];
  for (const frame of videoCutoutFrames) {
    if (frame.time <= video.currentTime) selected = frame;
    else break;
  }
  drawContained(videoCutoutCtx, selected.bitmap, selected.bitmap.width, selected.bitmap.height, videoCutoutCanvas.width, videoCutoutCanvas.height);
}

function revokeSourceUrl(): void {
  if (sourceObjectUrl) URL.revokeObjectURL(sourceObjectUrl);
  sourceObjectUrl = null;
}

function setVideoSource(blob: Blob): void {
  stopExport();
  clearVideoCutouts();
  revokeSourceUrl();
  sourceObjectUrl = URL.createObjectURL(blob);
  video.srcObject = null;
  video.src = sourceObjectUrl;
  video.load();
  stage.classList.add('has-video');
  playBtn.disabled = false;
  exportBtn.disabled = false;
  setStatus('Video loaded. Position the 3D subject, then export your composite.');
}

function stopCameraTracks(): void {
  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = null;
}

function stopExport(): void {
  exportStop?.();
  exportStop = null;
}

async function waitForSeek(time: number): Promise<void> {
  if (Math.abs(video.currentTime - time) < 0.01) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Video frame seek timed out.'));
    }, 8000);
    const onSeeked = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error('The browser could not decode a video frame.')); };
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.currentTime = time;
  });
}

async function processVideoCutout(): Promise<void> {
  if (!video.src || !Number.isFinite(video.duration) || video.duration <= 0) {
    setStatus('Import a valid video before running AI video cutout.');
    return;
  }
  if (video.duration > MAX_AI_CLIP_SECONDS) {
    setStatus('This AI workflow is limited to 12 seconds. Trim the clip and import it again.');
    return;
  }

  const wasPaused = video.paused;
  const previousTime = video.currentTime;
  const frameCount = Math.max(1, Math.ceil(video.duration * AI_SAMPLE_FPS));
  const generated: Array<{ time: number; bitmap: ImageBitmap }> = [];
  videoCutoutBtn.disabled = true;
  videoCutoutBtn.textContent = 'Processing AI frames…';
  video.pause();

  try {
    const workCanvas = document.createElement('canvas');
    const context = workCanvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas processing is unavailable.');

    for (let index = 0; index < frameCount; index += 1) {
      const time = Math.min(index / AI_SAMPLE_FPS, Math.max(0, video.duration - 0.04));
      await waitForSeek(time);
      const factor = Math.min(1, AI_MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
      workCanvas.width = Math.max(1, Math.round(video.videoWidth * factor));
      workCanvas.height = Math.max(1, Math.round(video.videoHeight * factor));
      context.drawImage(video, 0, 0, workCanvas.width, workCanvas.height);
      const frameBlob = await new Promise<Blob>((resolve, reject) => {
        workCanvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode sampled frame.')), 'image/jpeg', 0.86);
      });
      const cutout = await removeBackground(frameBlob, { model: 'isnet_fp16', output: { format: 'image/png' } });
      generated.push({ time, bitmap: await createImageBitmap(cutout) });
      setStatus('AI video cutout: ' + (index + 1) + ' / ' + frameCount + ' frames (' + Math.round((index + 1) / frameCount * 100) + '%).');
    }

    clearVideoCutouts();
    videoCutoutFrames = generated;
    videoCutoutReady = true;
    renderVideoCutoutPreview();
    setStatus('Cutout ready. ' + generated.length + ' sampled frames are available for preview and export.');
  } catch (error) {
    generated.forEach((frame) => frame.bitmap.close());
    setStatus(error instanceof Error ? 'AI video cutout failed: ' + error.message : 'AI video cutout failed.');
  } finally {
    try { await waitForSeek(Math.min(previousTime, Math.max(0, video.duration - 0.04))); } catch { /* Keep the current decoded frame. */ }
    if (!wasPaused) await video.play().catch(() => undefined);
    videoCutoutBtn.disabled = false;
    videoCutoutBtn.textContent = 'AI video cutout (12 sec max)';
  }
}

async function exportComposite(): Promise<void> {
  if (!video.src || video.readyState < HTMLMediaElement.HAVE_METADATA) {
    setStatus('Load a video before exporting.');
    return;
  }
  if (typeof compositeCanvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
    setStatus('This browser does not support canvas video recording.');
    return;
  }
  const context = compositeCanvas.getContext('2d');
  if (!context) {
    setStatus('Canvas rendering is unavailable.');
    return;
  }

  stopExport();
  const stream = compositeCanvas.captureStream(30);
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : 'video/webm';

  let output: MediaRecorder;
  try {
    output = new MediaRecorder(stream, { mimeType });
  } catch {
    stream.getTracks().forEach((track) => track.stop());
    setStatus('The browser could not initialize a supported WebM encoder.');
    return;
  }

  const chunks: Blob[] = [];
  let stopped = false;
  let animationFrame = 0;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(animationFrame);
    video.removeEventListener('ended', stop);
    if (output.state !== 'inactive') output.stop();
  };

  const draw = () => {
    const width = compositeCanvas.width;
    const height = compositeCanvas.height;
    context.clearRect(0, 0, width, height);
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      drawContained(context, video, video.videoWidth, video.videoHeight, width, height);
    }
    renderScene();
    context.drawImage(glCanvas, 0, 0, width, height);
    if (foregroundLayer.complete && foregroundLayer.naturalWidth > 0) {
      drawContained(context, foregroundLayer, foregroundLayer.naturalWidth, foregroundLayer.naturalHeight, width, height);
    }
    if (videoCutoutReady && videoCutoutFrames.length) {
      let frame = videoCutoutFrames[0];
      for (const candidate of videoCutoutFrames) {
        if (candidate.time <= video.currentTime) frame = candidate;
        else break;
      }
      drawContained(context, frame.bitmap, frame.bitmap.width, frame.bitmap.height, width, height);
    }
    if (!stopped && output.state === 'recording' && !video.ended) animationFrame = requestAnimationFrame(draw);
  };

  output.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
  output.onerror = () => {
    stop();
    setStatus('Recording failed. Try a shorter clip or another browser.');
  };
  output.onstop = () => {
    stream.getTracks().forEach((track) => track.stop());
    if (chunks.length) {
      const result = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(result);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'reality-vfx-composite.webm';
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setStatus('Export complete: reality-vfx-composite.webm');
    } else {
      setStatus('No video data was produced. Check browser recording support.');
    }
    exportStop = null;
    exportBtn.disabled = false;
    exportBtn.textContent = 'Export WebM composite';
  };

  exportStop = stop;
  exportBtn.disabled = true;
  exportBtn.textContent = 'Rendering…';
  video.pause();
  try {
    video.currentTime = 0;
    await video.play();
  } catch {
    stream.getTracks().forEach((track) => track.stop());
    exportStop = null;
    exportBtn.disabled = false;
    exportBtn.textContent = 'Export WebM composite';
    setStatus('Playback could not start. Tap Play once, then retry export.');
    return;
  }
  output.start(250);
  setStatus('Rendering composite in real time. Keep this tab open until export finishes.');
  draw();
  video.addEventListener('ended', stop, { once: true });
}

query<HTMLButtonElement>('#importBtn').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('video/')) {
    setStatus('Choose a supported video file.');
    fileInput.value = '';
    return;
  }
  if (file.size > MAX_VIDEO_BYTES) {
    setStatus('Video exceeds the 250 MB browser import limit.');
    fileInput.value = '';
    return;
  }
  setVideoSource(file);
  fileInput.value = '';
});

recordBtn.addEventListener('click', async () => {
  if (recorder?.state === 'recording') {
    recorder.stop();
    recordBtn.disabled = true;
    recordBtn.textContent = 'Finishing…';
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    setStatus('Camera recording is not supported in this browser.');
    return;
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
    });
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
    recorder = new MediaRecorder(cameraStream, { mimeType });
    recordingChunks = [];
    recorder.ondataavailable = (event) => { if (event.data.size) recordingChunks.push(event.data); };
    recorder.onerror = () => {
      stopCameraTracks();
      recordBtn.disabled = false;
      recordBtn.textContent = '● Record camera';
      setStatus('Camera recording failed.');
    };
    recorder.onstop = () => {
      const recording = new Blob(recordingChunks, { type: recorder?.mimeType || 'video/webm' });
      stopCameraTracks();
      recordBtn.disabled = false;
      recordBtn.textContent = '● Record camera';
      if (recording.size) setVideoSource(recording);
      else setStatus('The camera recording was empty.');
    };
    recorder.start(250);
    recordBtn.textContent = '■ Stop recording';
    setStatus('Recording camera. Press Stop recording when finished.');
  } catch (error) {
    stopCameraTracks();
    setStatus(error instanceof Error ? error.message : 'Camera permission or device error.');
  }
});

playBtn.addEventListener('click', async () => {
  if (video.paused) {
    try { await video.play(); } catch { setStatus('Video playback was blocked by the browser.'); }
  } else {
    video.pause();
  }
});
video.addEventListener('play', () => { playBtn.textContent = 'Ⅱ Pause'; });
video.addEventListener('pause', () => { playBtn.textContent = '▶ Play'; });
video.addEventListener('loadedmetadata', () => {
  resizeRenderer();
  videoCutoutBtn.disabled = !Number.isFinite(video.duration) || video.duration > MAX_AI_CLIP_SECONDS;
});
video.addEventListener('timeupdate', renderVideoCutoutPreview);
video.addEventListener('error', () => setStatus('The selected video could not be decoded by this browser.'));

query<HTMLButtonElement>('#resetBtn').addEventListener('click', () => {
  query<HTMLInputElement>('#scale').value = '1';
  query<HTMLInputElement>('#rotation').value = '0';
  query<HTMLInputElement>('#xpos').value = '52';
  query<HTMLInputElement>('#ypos').value = '62';
  subject.scale.setScalar(1);
  applyPosition();
  updateLabels();
});

query<HTMLSelectElement>('#subject').addEventListener('change', (event) => {
  buildSubject((event.currentTarget as HTMLSelectElement).value);
});
for (const id of ['scale', 'rotation', 'xpos', 'ypos']) {
  query<HTMLInputElement>('#' + id).addEventListener('input', () => {
    if (id === 'scale') subject.scale.setScalar(Number(query<HTMLInputElement>('#scale').value));
    applyPosition();
    updateLabels();
  });
}

query<HTMLButtonElement>('#toggleObject').addEventListener('click', (event) => {
  showSubject = !showSubject;
  applyPosition();
  (event.currentTarget as HTMLButtonElement).textContent = showSubject ? 'Hide subject' : 'Show subject';
});

function pointerWorld(clientX: number, clientY: number): { x: number; y: number } {
  const rect = glCanvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width - 0.5) * 10,
    y: (0.5 - (clientY - rect.top) / rect.height) * (10 * rect.height / rect.width)
  };
}
glCanvas.addEventListener('pointerdown', (event) => {
  dragPointer = event.pointerId;
  glCanvas.setPointerCapture(event.pointerId);
  const position = pointerWorld(event.clientX, event.clientY);
  subject.position.set(position.x, position.y, 0);
});
glCanvas.addEventListener('pointermove', (event) => {
  if (dragPointer !== event.pointerId) return;
  const position = pointerWorld(event.clientX, event.clientY);
  subject.position.set(position.x, position.y, 0);
  const x = Math.round((position.x / 9.2 + 0.5) * 100);
  const y = Math.round((0.5 - position.y / 5.75) * 100);
  query<HTMLInputElement>('#xpos').value = String(THREE.MathUtils.clamp(x, 5, 95));
  query<HTMLInputElement>('#ypos').value = String(THREE.MathUtils.clamp(y, 10, 90));
  updateLabels();
});
const releasePointer = (event: PointerEvent) => {
  if (dragPointer === event.pointerId) dragPointer = null;
};
glCanvas.addEventListener('pointerup', releasePointer);
glCanvas.addEventListener('pointercancel', releasePointer);

foregroundInput.addEventListener('change', () => {
  const file = foregroundInput.files?.[0];
  if (!file) return;
  if (!['image/png', 'image/webp'].includes(file.type)) {
    setStatus('Use a transparent PNG or WebP foreground cutout.');
    foregroundInput.value = '';
    return;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    setStatus('Foreground overlay exceeds the 12 MB limit.');
    foregroundInput.value = '';
    return;
  }
  if (foregroundObjectUrl) URL.revokeObjectURL(foregroundObjectUrl);
  foregroundObjectUrl = URL.createObjectURL(file);
  foregroundLayer.src = foregroundObjectUrl;
  foregroundLayer.style.display = 'block';
  setStatus('Foreground overlay loaded above the virtual subject.');
});

aiCutoutInput.addEventListener('change', () => {
  selectedAiImage = aiCutoutInput.files?.[0] ?? null;
  aiCutoutBtn.disabled = !selectedAiImage;
  if (selectedAiImage) setStatus('Image selected. Run AI background removal to create a transparent cutout.');
});

aiCutoutBtn.addEventListener('click', async () => {
  if (!selectedAiImage) return;
  if (!selectedAiImage.type.startsWith('image/')) {
    setStatus('Choose a supported image file.');
    return;
  }
  if (selectedAiImage.size > MAX_IMAGE_BYTES) {
    setStatus('Image exceeds the 12 MB AI processing limit.');
    return;
  }
  aiCutoutBtn.disabled = true;
  aiCutoutBtn.textContent = 'AI processing…';
  setStatus('Loading the segmentation model. First use requires internet access and may take time.');
  try {
    const result = await removeBackground(selectedAiImage, {
      model: 'isnet_fp16',
      output: { format: 'image/png' }
    });
    const url = URL.createObjectURL(result);
    if (foregroundObjectUrl) URL.revokeObjectURL(foregroundObjectUrl);
    foregroundObjectUrl = url;
    foregroundLayer.src = url;
    foregroundLayer.style.display = 'block';
    setStatus('AI image cutout completed. The transparent result is layered over the 3D subject.');
  } catch (error) {
    setStatus(error instanceof Error ? 'AI image cutout failed: ' + error.message : 'AI image cutout failed.');
  } finally {
    aiCutoutBtn.disabled = !selectedAiImage;
    aiCutoutBtn.textContent = 'AI remove image background';
  }
});

videoCutoutBtn.addEventListener('click', () => { void processVideoCutout(); });
query<HTMLSelectElement>('#lighting').addEventListener('change', (event) => {
  const mode = (event.currentTarget as HTMLSelectElement).value;
  if (mode === 'warm') {
    keyLight.color.set(0xffc17a);
    keyLight.intensity = 2.5;
  } else if (mode === 'cool') {
    keyLight.color.set(0x9fc9ff);
    keyLight.intensity = 2;
  } else {
    keyLight.color.set(0xffffff);
    keyLight.intensity = 2.1;
  }
  setStatus('Virtual subject lighting updated. Source footage colors are unchanged.');
});

const shadowSlider = query<HTMLInputElement>('#shadow');
shadowSlider.addEventListener('input', () => {
  (contactShadow.material as THREE.MeshBasicMaterial).opacity = Number(shadowSlider.value) / 100;
  query<HTMLOutputElement>('#shadowOut').textContent = shadowSlider.value + '%';
});

exportBtn.addEventListener('click', () => { void exportComposite(); });

const resizeObserver = new ResizeObserver(resizeRenderer);
resizeObserver.observe(stage);
window.addEventListener('beforeunload', () => {
  stopExport();
  stopCameraTracks();
  clearVideoCutouts();
  revokeSourceUrl();
  if (foregroundObjectUrl) URL.revokeObjectURL(foregroundObjectUrl);
  resizeObserver.disconnect();
  renderer.dispose();
});

buildSubject('dino');
updateLabels();
resizeRenderer();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.warn('Service worker registration failed:', error);
    });
  });
}
