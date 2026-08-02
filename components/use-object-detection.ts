'use client';

import { useEffect, useRef, type RefObject } from 'react';

type Detection = {
  bbox: [number, number, number, number];
  class: string;
  score: number;
};

type DetectorModel = {
  detect: (input: HTMLVideoElement) => Promise<Detection[]>;
};

const CONTEXT_CLASSES = new Set([
  'person', 'chair', 'couch', 'bed', 'dining table', 'toilet', 'bench',
  'car', 'truck', 'bus', 'train', 'motorcycle', 'bicycle', 'airplane', 'boat',
  'traffic light', 'stop sign', 'fire hydrant', 'parking meter',
  'bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe',
]);

const MIN_SCORE = 0.5;
const DETECT_INTERVAL_MS = 120;

function drawDetections(video: HTMLVideoElement, canvas: HTMLCanvasElement, detections: Detection[]) {
  const rect = video.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return;
  }

  canvas.width = rect.width;
  canvas.height = rect.height;
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);

  const scale = Math.min(rect.width / video.videoWidth, rect.height / video.videoHeight);
  const offsetX = (rect.width - video.videoWidth * scale) / 2;
  const offsetY = (rect.height - video.videoHeight * scale) / 2;

  for (const detection of detections) {
    if (detection.score < MIN_SCORE) {
      continue;
    }

    const [bx, by, bw, bh] = detection.bbox;
    const x = offsetX + bx * scale;
    const y = offsetY + by * scale;
    const w = bw * scale;
    const h = bh * scale;

    const isContext = CONTEXT_CLASSES.has(detection.class);
    context.strokeStyle = isContext ? 'rgba(255,255,255,0.5)' : 'rgba(52,211,153,0.95)';
    context.lineWidth = isContext ? 1.5 : 2.5;
    context.strokeRect(x, y, w, h);

    const label = `${detection.class} ${Math.round(detection.score * 100)}%`;
    context.font = '11px ui-sans-serif, system-ui';
    const textWidth = context.measureText(label).width;
    context.fillStyle = isContext ? 'rgba(0,0,0,0.55)' : 'rgba(6,95,70,0.9)';
    context.fillRect(x, Math.max(0, y - 16), textWidth + 10, 16);
    context.fillStyle = isContext ? 'rgba(255,255,255,0.85)' : 'rgb(209,250,229)';
    context.fillText(label, x + 5, Math.max(11, y - 4));
  }
}

export function useObjectDetection(
  videoRef: RefObject<HTMLVideoElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  active: boolean,
  onStatus: (status: string | null) => void,
) {
  const modelRef = useRef<DetectorModel | null>(null);
  const detectBusyRef = useRef(false);
  const timerRef = useRef<number>(0);

  useEffect(() => {
    if (!active) {
      return;
    }

    let cancelled = false;

    const loop = () => {
      timerRef.current = window.setTimeout(() => {
        void (async () => {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          const model = modelRef.current;

          if (!cancelled && model && video && canvas && video.videoWidth > 0 && !detectBusyRef.current) {
            detectBusyRef.current = true;
            try {
              const detections = await model.detect(video);
              if (!cancelled) {
                drawDetections(video, canvas, detections);
              }
            } catch {
              // skip this frame
            } finally {
              detectBusyRef.current = false;
            }
          }

          if (!cancelled) {
            loop();
          }
        })();
      }, DETECT_INTERVAL_MS);
    };

    void (async () => {
      try {
        if (!modelRef.current) {
          onStatus('Loading on-device detector…');
          const tf = await import('@tensorflow/tfjs');
          await tf.ready();
          const cocoSsd = await import('@tensorflow-models/coco-ssd');
          try {
            modelRef.current = await cocoSsd.load({ modelUrl: '/models/ssdlite/model.json' });
          } catch {
            modelRef.current = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
          }
        }
        if (!cancelled) {
          onStatus(null);
          loop();
        }
      } catch {
        if (!cancelled) {
          onStatus('On-device detector unavailable — lens chips still work.');
        }
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timerRef.current);
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (canvas && context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
  }, [active, canvasRef, onStatus, videoRef]);
}
