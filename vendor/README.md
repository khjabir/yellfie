# Vendored files

Bundled here so Yellfie works offline. Re-download with `npm run vendor`.

- `mediapipe/` — [@mediapipe/tasks-vision](https://www.npmjs.com/package/@mediapipe/tasks-vision) 1.2.3, © Google LLC, Apache License 2.0.
- `models/face_landmarker.task`, `models/pose_landmarker_lite.task`, `models/hand_landmarker.task` — MediaPipe models from storage.googleapis.com/mediapipe-models, Apache License 2.0.

If this folder is deleted, Yellfie loads the same files from the jsDelivr and Google CDNs instead.
