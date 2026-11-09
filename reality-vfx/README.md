# Reality VFX Studio

A browser-based compositing prototype for importing or recording footage, positioning a procedural Three.js subject, applying client-side foreground extraction, and exporting a WebM composite.

## Current feature scope

- Responsive desktop and mobile editor.
- Local video import and camera recording.
- Procedural 3D subject with scale, rotation, and position controls.
- Manual transparent PNG/WebP foreground overlay.
- Client-side AI image background removal using IMG.LY.
- Optional sampled video cutout: 2 fps, maximum 12-second source clip, 512 px maximum long edge.
- Real-time WebM export where supported by the browser.
- Installable PWA shell and offline app shell.
- Manual screen-space compositing fallback for browsers without native AR integration.

## Requirements

- Node.js 20.19+ or 22.12+ (required by Vite 7).
- npm 10+.
- HTTPS or localhost for camera and WebXR permissions.
- A modern browser with WebGL2 for the 3D preview.
- AI segmentation downloads its model on first use and requires an internet connection.

## Local development

\`\`\`bash
cd reality-vfx
npm ci
npm run dev -- --host 0.0.0.0
\`\`\`

## Quality checks

\`\`\`bash
npm run typecheck
npm run build
npm run preview -- --host 0.0.0.0
\`\`\`

## Deployment

Deploy this directory as a static Vite application. Configure the hosting provider to serve the generated \`dist/\` directory and rewrite application routes to \`/index.html\`. Use HTTPS. Do not deploy the repository root as the app root.

The app uses root-relative asset paths and is intended to be hosted at a domain root. If deploying under a subpath, update the Vite \`base\` setting and PWA paths together.

## Privacy and data handling

- Imported video, camera capture, and AI image/video segmentation are processed in the browser.
- No Reality VFX application backend or remote upload endpoint is configured.
- The segmentation library downloads model assets from its configured distribution source.
- Camera streams are stopped when recording ends or the page is closed.
- Users should avoid selecting sensitive footage on shared devices.

## Known limitations

This is a browser compositing prototype, not a finished native AR production system. The 3D subject is procedural placeholder geometry. Sampled video cutout is not full-frame-rate segmentation and can exhibit temporal mask jumps. Lighting presets affect only the virtual subject. Contact shadow is a visual approximation. WebM export support and performance vary by browser/device. This build does not implement an immersive WebXR session; ARCore/ARKit world tracking is a separate native engineering phase.

Production AR with stable world anchors, depth occlusion, camera pose recovery, robust relighting, and native camera pipelines requires platform-specific ARCore/ARKit integration and device testing. Those capabilities are not represented as complete in this browser app.

## Security

Do not put API keys, signing secrets, or private model credentials in Vite client-side environment variables. Any \`VITE_*\` value is bundled into public client code. A future hosted AI service must use authenticated server-side endpoints, upload limits, retention controls, rate limits, and explicit user consent.

## Phase 6: temporal cutout transition smoothing
- Added a **Mask transition smoothing** control for AI video cutout playback and export.
- Adjacent sampled transparent frames are cross-faded according to their timestamps instead of holding one mask until the next sample.
- The same compositor function is used for preview and WebM export so the transition setting stays consistent.

### Limitations
Cross-fading reduces abrupt visual changes but is not optical-flow interpolation or temporal AI tracking. Fast-moving subjects can appear semi-transparent or ghosted between samples. The source segmentation remains sampled at 2 fps.

## Phase 7: motion-aware subject tracking
- Each AI cutout frame now estimates the foreground subject's alpha-weighted center.
- During transitions, adjacent cutouts are aligned to an interpolated subject center before blending, reducing visible double-image ghosting caused by simple whole-frame cross-fades.
- The same tracked compositor is used for preview and WebM export.
- Center estimation samples every second pixel and ignores very low-alpha pixels to keep browser processing bounded.

### Limitations
This is alpha-centroid tracking with 2D translation compensation, not dense optical flow, articulated tracking, camera-motion estimation, or depth-aware occlusion. Large rotations, multiple disconnected subjects, rapid scale changes, and severe segmentation errors can still produce alignment artifacts.

## Phase 8: autonomous character systems

- Added autonomous 3D subject movement with enable/pause control, patrol, wander, idle, and run behaviour presets, plus adjustable movement speed.
- Added a video human-subject stabilization toggle. When enabled, sampled cutout frames are aligned using the existing alpha-centroid estimates; when disabled, each sampled frame retains its original placement.
- Preview and WebM export share the same video cutout compositor and stabilization setting.

### Limitations
The 3D character is still procedural placeholder geometry: movement is screen-space translation and simple bob/turn animation, not skeletal animation, physics-based navigation, or a learned autonomous agent. The video feature tracks and stabilizes extracted foreground silhouettes; it cannot make a recorded person perform new actions, infer full 3D pose, or generate unseen frames. Video cutout remains sampled at 2 fps.
