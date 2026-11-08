# Reality VFX Studio

Mobile-first video compositing and WebXR AR placement prototype.

## Phase 2 capabilities
- Responsive web editor for desktop and mobile.
- Installable PWA shell (Add to Home Screen on supported browsers).
- WebXR immersive AR entry point with hit-test surface detection.
- Tap the detected surface to place the procedural 3D subject in the AR session.
- Non-WebXR browsers retain the manual 2D compositing editor.
- Offline shell caching for the app entry point and static public assets.

## Run locally
```bash
cd reality-vfx
npm install
npm run dev -- --host 0.0.0.0
```

Open the printed localhost URL. Camera and immersive AR features require a secure context (HTTPS or localhost).

## Test AR on Android
1. Use a supported ARCore-compatible Android device.
2. Open the deployed site in a WebXR-compatible browser (typically Chrome) over HTTPS.
3. Grant camera permission and install/update Google Play Services for AR if prompted.
4. Tap **Start AR**, move the phone to scan a horizontal surface, then tap to place the subject.

WebXR immersive AR support varies by device, browser, browser flags, and AR services. The app checks support and reports when immersive AR is unavailable.

## Install as an app
Deploy the reality-vfx folder as a static Vite site over HTTPS. In Chrome on Android, use the browser menu and choose **Install app** or **Add to Home screen**. The PWA is a web app wrapper; it is not a signed native APK.

## Important limitations
This phase adds hit-test plane placement, not full world understanding. It does not yet implement persistent anchors, camera pose recording, depth-based real-world occlusion, semantic object segmentation, relighting, automatic shadows, or generative video-to-video scene reconstruction. On iOS Safari, immersive WebXR AR is generally unavailable; use the responsive web editor fallback.

## Next engineering phases
1. Persistent world anchors and plane classification.
2. Depth sensing and occlusion using supported AR APIs.
3. Subject segmentation and shadow/lighting estimation.
4. Native Android ARCore application packaging and iOS ARKit application.
5. Secure GPU-backed AI scene understanding and generative rendering services.

## Privacy
Camera frames are handled locally in this prototype. The app does not upload footage to an AI service.
## Phase 3: cinematic compositing tools
- Soft procedural contact-shadow layer with adjustable opacity, following the 3D subject.
- Virtual-subject lighting presets: neutral, warm, and cool.
- Foreground cutout overlay: import a transparent PNG/WebP to composite foreground elements over the 3D subject.
- Foreground overlay is included in the WebM export render.

### Manual occlusion workflow
1. Create a transparent PNG/WebP cutout containing the foreground object (for example, a person or desk edge) with the same framing as the source video.
2. Import the source video and position the 3D subject.
3. Load the cutout using **Foreground cutout**. It is layered above the 3D subject so the real-world foreground appears in front.
4. Adjust the contact-shadow strength and virtual lighting preset, then export.

These are manual compositing aids, not automatic AI segmentation or depth estimation. Lighting presets affect the virtual 3D subject only; they do not relight the source footage. The contact shadow is a procedural 2D approximation, not a physically reconstructed shadow.

## Phase 4: browser AI image cutout
- Select a still image (up to 12 MB) and run **AI remove background**.
- The browser loads the ISNet FP16 segmentation model and generates a transparent PNG cutout.
- The generated cutout is automatically placed in the foreground layer above the 3D subject and included in export.
- AI inference runs client-side; the selected source image is not uploaded to a Reality VFX backend. First model download requires internet access and may be large; later runs may benefit from browser caching.

### Scope and limitations
This feature performs image-level foreground extraction, not video frame segmentation. It does not track moving subjects, create temporally consistent masks, infer scene depth, or generate new video. Processing speed and memory use depend on device capability. Manual transparent PNG/WebP import remains available as a fallback.
