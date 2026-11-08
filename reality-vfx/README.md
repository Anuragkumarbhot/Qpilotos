# Reality VFX Studio (Prototype)

A browser-based, mobile-friendly VFX prototype inspired by the supplied Simulon concept. It lets you record/import a video, place a procedural 3D object over the scene, adjust its position/scale/rotation, and export a composited video.

## Important scope

This is a practical VFX compositing starter, **not** a replica of Simulon's proprietary Reality-Aware Rendering or generative scene reconstruction. It does not infer full 3D geometry, camera pose, lighting, speech semantics, or regenerate the original scene. The object is composited as a 3D overlay; manual placement is required.

## Stack

- Vite + TypeScript
- Three.js for interactive 3D object rendering
- HTML video/camera capture APIs
- Canvas compositing and MediaRecorder export

## Run locally

```bash
cd reality-vfx
npm install
npm run dev -- --host 0.0.0.0
```

Open the Vite URL on desktop or Android Chrome. Camera access requires HTTPS or localhost and user permission.

## Prototype workflow

1. Record using the camera or select a video file.
2. Add a procedural dinosaur/creature placeholder.
3. Drag the object in the preview and adjust scale, rotation, and height.
4. Play the source video and capture the composite to WebM.

## Next engineering phases

1. Add automatic subject/plane detection (MediaPipe Tasks / segmentation).
2. Add camera motion tracking (visual odometry / SLAM) and world anchoring.
3. Estimate lighting and shadows; use shadow catcher and environment maps.
4. Add speech/action understanding and scene-edit prompts.
5. Integrate a hosted video-to-video diffusion or 3D reconstruction backend when a suitable model/API and GPU budget are available.

## Privacy

Camera frames are processed locally in the browser in this prototype. Do not upload private footage to third-party services without explicit consent.
