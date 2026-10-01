import { useEffect, useRef, useState, useCallback } from 'react';

let modelsPromise = null;
function ensureModels(faceapi) {
  if (!modelsPromise) {
    modelsPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
      faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
      faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
    ]).catch((err) => {
      // A failed load must not be cached forever, or a transient network error
      // would permanently break the camera until a full page reload.
      modelsPromise = null;
      throw err;
    });
  }
  return modelsPromise;
}

// A face too small in frame produces a low-detail descriptor, and one that fills
// the frame is neither centred nor fully inside the ROI, so both ends of this
// band are refused rather than merely discouraged. A low-detail descriptor is the
// dangerous failure here: it drifts toward the average of all faces, which is
// exactly what makes different people look alike to the matcher.
const MIN_FACE_WIDTH_RATIO = 0.25;
const MAX_FACE_WIDTH_RATIO = 0.6;

// A second face this large next to the primary one is treated as a co-subject
// rather than a bystander, because detectAllFaces otherwise hands back whichever
// face scored highest and we would happily enrol the wrong person.
const SECOND_FACE_RATIO = 0.6;

// Mean luminance of the face crop, 0-255. Below the floor the frame carries too
// little signal to describe a face and the descriptor degenerates; above the
// ceiling the highlights are clipped and it does the same. A deployment that
// enrols a face it cannot really see is how one person's template ends up on
// every account in the system.
const MIN_FACE_LUMINANCE = 35;
const MAX_FACE_LUMINANCE = 235;

// A frame that passed every gate stays capturable for this long. The live loop
// refreshes it many times a second, so a hit here means the loop has stopped - a
// backgrounded tab, a stalled stream - and whatever is in the frame is no longer
// evidence of who is sitting in front of the camera right now.
const FRAME_STALE_MS = 1500;

// Mean luminance of a face crop, computed on a small downscale. getImageData on
// the full crop every frame would be the most expensive thing on the page.
const LUMA_PROBE_SIZE = 32;

// Turns the current frame into the face we are willing to capture, plus a
// human-readable reason when there is not one. Returns { face, reason } where
// `face` is null whenever `reason` is set, so callers can treat either as the
// gate.
function evaluateFrame(faces, video, probe) {
  if (!faces || !faces.length) {
    return { face: null, reason: 'No face detected. Please look directly at the camera.' };
  }

  const byArea = [...faces].sort((a, b) => b.detection.box.width * b.detection.box.height - a.detection.box.width * a.detection.box.height);
  const [primary, runnerUp] = byArea;
  if (runnerUp && runnerUp.detection.box.width >= primary.detection.box.width * SECOND_FACE_RATIO) {
    return { face: null, reason: 'More than one face in frame. Please be the only person in view.' };
  }

  const box = primary.detection.box;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return { face: null, reason: 'The camera is still starting up.' };

  const widthRatio = box.width / vw;
  if (widthRatio < MIN_FACE_WIDTH_RATIO) {
    return { face: null, reason: 'Move a little closer to the camera.' };
  }
  if (widthRatio > MAX_FACE_WIDTH_RATIO) {
    return { face: null, reason: 'Move slightly further back from the camera.' };
  }

  const luminance = probe(box);
  if (luminance < MIN_FACE_LUMINANCE) {
    return { face: null, reason: 'The room is too dark to see your face clearly. Add some light and try again.' };
  }
  if (luminance > MAX_FACE_LUMINANCE) {
    return { face: null, reason: 'The image is overexposed. Move away from bright light and try again.' };
  }

  // Off-centre is a nudge, not a refusal: the landmark alignment that produces
  // the descriptor already corrects for translation, so a slightly off-centre
  // face still yields a sound template.
  const cx = (box.x + box.width / 2) / vw;
  const cy = (box.y + box.height / 2) / vh;
  if (Math.abs(cx - 0.5) > 0.2 || Math.abs(cy - 0.5) > 0.24) {
    return { face: primary, reason: null, luminance, hint: 'Centre your face in the frame.' };
  }

  return { face: primary, reason: null, luminance };
}

// Mean luminance of a face crop, sampled on a small scratch canvas that is
// created once per stream and reused. Reading back the full crop every frame
// would cost more than the detection itself.
function makeLuminanceProbe(video) {
  const canvas = document.createElement('canvas');
  canvas.width = LUMA_PROBE_SIZE;
  canvas.height = LUMA_PROBE_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return (box) => {
    if (!ctx || !video) return 128;
    try {
      ctx.drawImage(video, box.x, box.y, box.width, box.height, 0, 0, LUMA_PROBE_SIZE, LUMA_PROBE_SIZE);
      const { data } = ctx.getImageData(0, 0, LUMA_PROBE_SIZE, LUMA_PROBE_SIZE);
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }
      return sum / (data.length / 4);
    } catch {
      // A tainted or unreadable frame is not a reason to block enrolment; the
      // size and single-face gates still apply.
      return 128;
    }
  };
}

// Live video preview with continuous face detection. Parent calls capture() via ref
// to obtain { descriptor, imageUrl }. Faces are tracked by a green bounding box.
export default function FaceCamera({ onStatus, captureRef, width = 640, height = 480 }) {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const latestRef = useRef(null);
  const framingRef = useRef(null);
  const hintRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  // Held in a ref so a caller passing an inline arrow function cannot re-run the
  // camera effect. onStatus used to be a dependency of the effect below while
  // FaceGate passes a fresh function on every render: detecting a face called
  // setStatusMsg, which re-rendered FaceGate, which changed the onStatus
  // identity, which tore down getUserMedia and started it again. The camera
  // restarted in a loop and the user could never get a stable frame to capture.
  const onStatusRef = useRef(onStatus);
  useEffect(() => {
    onStatusRef.current = onStatus;
  });

  const notify = useCallback((payload) => {
    onStatusRef.current?.(payload);
  }, []);

  const cleanup = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    latestRef.current = null;
    framingRef.current = null;
    hintRef.current = null;
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const faceapi = await import('face-api.js');
        await ensureModels(faceapi);
        if (!mounted) return;

        if (!navigator.mediaDevices?.getUserMedia) {
          throw Object.assign(new Error('unsupported'), { name: 'NotSupportedError' });
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: width }, height: { ideal: height }, facingMode: 'user' },
          audio: false,
        });
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
        setError(null);
        notify({ type: 'ready' });

        // Serialised detection: one inference at a time, awaited, so a slow frame
        // cannot queue up overlapping detections and starve the render loop.
        // The `mounted` flag is the real stop signal; the effect cleanup sets it
        // to false and tears the stream down.
        // The probe is built once per stream and closes over the live video
        // element, so it has to be handed that element here. It used to read a
        // bare `video`, which is only declared inside tick() below - so this
        // threw "video is not defined" on every single startup, was swallowed by
        // the catch below, and surfaced to users as "Unable to access the
        // camera on this device." on a device with a working, permitted camera.
        // Face enrolment and face verification were dead on arrival.
        const probe = makeLuminanceProbe(videoRef.current);
        const tick = async () => {
          if (!mounted) return;
          const video = videoRef.current;
          if (video && video.readyState >= 2) {
            try {
              // All faces, not just the best one. A single face can only be
              // trusted to be the right one when there is provably only one.
              const faces = await faceapi
                .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
                .withFaceLandmarks()
                .withFaceDescriptor();
              if (!mounted) return;

              const verdict = evaluateFrame(faces, video, probe);
              const box = verdict.face?.detection?.box || null;
              // Only a frame that cleared every gate is ever capturable, so there
              // is no path by which a too-small, too-dark or second-person frame
              // can be submitted as somebody's face.
              latestRef.current = verdict.face ? { detection: verdict.face, box, luminance: verdict.luminance, at: Date.now() } : null;
              hintRef.current = verdict.hint || verdict.reason || null;
              framingRef.current = verdict.face ? Boolean(verdict.hint) : true;
              drawOverlay(box);
              if (verdict.face) {
                notify({ type: 'face-detected', ready: !verdict.hint, hint: verdict.hint || null });
              } else {
                notify({ type: 'face-lost', hint: verdict.reason });
              }
            } catch {
              /* frame error, keep going */
            }
          }
          if (mounted) rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        if (mounted) {
          const name = e?.name;
          const message =
            name === 'NotAllowedError' || name === 'SecurityError'
              ? 'Camera permission denied. Allow camera access in your browser, then reload this page.'
              : name === 'NotFoundError' || name === 'OverconstrainedError'
                ? 'No camera was found on this device.'
                : name === 'NotReadableError'
                  ? 'The camera is already in use by another application.'
                  : /model|fetch|network|Failed to load/i.test(String(e?.message || e))
                    ? 'Could not load the face-detection models. Check your connection and reload.'
                    : 'Unable to access the camera on this device.';
          setError(message);
          notify({ type: 'error', error: message });
        }
      }
    })();
    return () => {
      mounted = false;
      cleanup();
    };
  }, [width, height, cleanup, notify]);

  // The video is rendered with object-cover, which crops instead of stretching,
  // while the canvas is stretched to fill the container. The box coordinates
  // therefore have to be run through the same cover transform, otherwise the
  // guide box drifts away from the face and gives the wrong framing advice.
  const drawOverlay = (box) => {
    const canvas = overlayRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const cw = canvas.clientWidth;
    const chh = canvas.clientHeight;
    if (!cw || !chh) return;
    // Keep the backing store equal to the displayed size so we can draw in CSS
    // pixels. Assigning width/height also resets the context, so do it first.
    if (canvas.width !== cw || canvas.height !== chh) {
      canvas.width = cw;
      canvas.height = chh;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, chh);
    if (!box || !video.videoWidth || !video.videoHeight) return;

    const scale = Math.max(cw / video.videoWidth, chh / video.videoHeight);
    const offX = (cw - video.videoWidth * scale) / 2;
    const offY = (chh - video.videoHeight * scale) / 2;
    const x = offX + box.x * scale;
    const y = offY + box.y * scale;
    const w = box.width * scale;
    const h = box.height * scale;

    ctx.lineWidth = 3;
    ctx.strokeStyle = framingRef.current ? '#f59e0b' : '#10b981';
    ctx.strokeRect(x, y, w, h);
  };

  // capture() resolves the descriptor for the most recent frame that cleared
  // every gate, plus a thumbnail data URL. It resolves { ok: false, reason }
  // rather than null so the caller can show the specific gate that rejected the
  // frame instead of a generic "no face detected".
  if (captureRef) {
    captureRef.current = {
      capture: async () => {
        const frame = latestRef.current;
        if (!frame) {
          return {
            ok: false,
            reason: hintRef.current || 'No usable face detected. Face the camera in good light, roughly an arm’s length away.',
          };
        }
        if (Date.now() - frame.at > FRAME_STALE_MS) {
          // The live loop refreshes this every frame, so an old timestamp means
          // the loop is not running. Refusing beats submitting a descriptor that
          // was computed from whoever happened to be sitting there earlier.
          return { ok: false, reason: 'The camera feed went stale. Hold still and press Capture again.' };
        }

        const descriptor = Array.from(frame.detection.descriptor);
        let imageUrl = null;
        try {
          const { box } = frame;
          const c2 = document.createElement('canvas');
          c2.width = Math.round(box.width);
          c2.height = Math.round(box.height);
          c2.getContext('2d').drawImage(videoRef.current, box.x, box.y, box.width, box.height, 0, 0, c2.width, c2.height);
          imageUrl = c2.toDataURL('image/jpeg', 0.85);
        } catch {
          /* thumbnail optional */
        }
        return { ok: true, descriptor, imageUrl, luminance: frame.luminance };
      },
    };
  }

  if (error) {
    return (
      <div className="text-center py-10">
        <i className="fas fa-camera-slash text-4xl text-danger-500 mb-3 block" />
        <p className="text-danger-600 dark:text-danger-400 text-sm px-4">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden bg-black aspect-video w-full max-w-[640px] mx-auto">
      <video ref={videoRef} width={width} height={height} autoPlay muted playsInline className="w-full h-full object-cover" />
      <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-white text-sm gap-2">
          <span className="w-5 h-5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
          Starting camera...
        </div>
      )}
    </div>
  );
}
