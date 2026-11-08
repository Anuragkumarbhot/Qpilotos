# Source architecture

- \`main.ts\`: application bootstrap, media lifecycle, Three.js scene, AI cutout workflow, and WebM export.
- \`style.css\`: responsive editor layout, controls, focus states, and reduced-motion support.
- \`../public/sw.js\`: versioned app-shell cache. Runtime media/model assets are not intentionally precached.

## Engineering boundaries

The browser client does not contain credentials or call a private backend. Imported footage remains local to the browser. The IMG.LY package downloads segmentation model assets as needed.

The WebXR control is capability-gated. It must not be interpreted as a replacement for a native ARCore/ARKit implementation. Production world tracking, persistent anchors, depth occlusion, and camera pose recovery require device-specific implementation and physical-device validation.

## Before a commercial release

1. Run typecheck/build on the supported Node.js LTS runtime.
2. Test camera permission denial, device camera contention, media decode errors, and browser tab backgrounding.
3. Test WebM MIME support and memory limits on representative Android and desktop devices.
4. Verify AI model licensing, distribution terms, and privacy disclosures.
5. Add automated browser tests and a real-device release matrix.
6. Review all user-facing capability claims against tested devices.
