# Source notes

`main.ts` owns the prototype UI, camera/import workflow, Three.js scene, pointer placement, and canvas/MediaRecorder export. `style.css` is responsive for phone and desktop use.

## Known limitations to address before production

- 3D models are procedural placeholders rather than production assets.
- Placement is screen-space/manual. There is no ARCore/ARKit world tracking or SLAM.
- No object segmentation, depth estimation, occlusion masks, relighting, shadows-on-footage, or camera pose recovery.
- Export is WebM and happens in real time; browser support and device performance vary.
- Microphone/camera permission requires a secure context.

## Production architecture proposal

**Mobile capture:** native Android CameraX + ARCore (or iOS AVFoundation + ARKit).

**Tracking:** AR plane detection, world anchors, camera pose, depth maps, segmentation masks.

**Renderer:** Unity/Unreal or native Filament/SceneKit; PBR assets, environment lighting, shadow catcher, depth-aware occlusion.

**AI scene service:** asynchronous job API for video understanding, prompt interpretation, scene reconstruction, asset selection, and video-to-video generation. Keep model inference off-device unless an efficient mobile model is validated.

**Backend:** authenticated upload, object storage, job queue, GPU workers, progress events, output delivery, retention controls, and usage metering. Store secrets only server-side.
