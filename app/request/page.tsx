'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BrandMark } from '@/components/brand-mark';
import { ConsoleHeader } from '@/components/console-header';
import { OrgSwitcher } from '@/components/org-switcher';
import { useObjectDetection } from '@/components/use-object-detection';

type Proposal = {
  category: string;
  item: string;
  quantity: number;
  rationale: string;
  total_cents: number;
  unit_price_cents: number;
};

type ProposeResponse = {
  error?: string;
  limitCents?: number;
  overLimit?: boolean;
  proposal?: Proposal;
  request?: { id: string; status: string };
  speech?: string;
  tierLabel?: string;
};

/** A proposal the agent has made but the requester has not yet approved sending. */
type PendingProposal = {
  frame: string | null;
  limitCents: number | null;
  overLimit: boolean;
  proposal: Proposal;
  requestText: string;
  tierLabel: string | null;
};

/** What the advisor came back with, after it went and read the market. */
type Advice = {
  advice: string;
  brand: string | null;
  grounded: boolean;
  headline: string;
  item: string;
  market_high_dollars: number;
  market_low_dollars: number;
  offers: Array<{ merchant: string; price_dollars: number; title: string; url: string }>;
  sources: Array<{ title: string; url: string }>;
  timing: 'buy_now' | 'wait';
  verdict: 'good_deal' | 'fair' | 'overpriced' | 'unknown';
  wait_reason: string | null;
};

type AdviseResponse = {
  advice?: Advice;
  error?: string;
  speech?: string;
  /** Which wallet the advice was given for — the same item advises differently. */
  wallet?: { caption: string; label: string } | null;
};

/** One row of "price everything you just showed me". */
type PricedItem = {
  label: string;
  market_high_dollars: number;
  market_low_dollars: number;
  offers: Advice['offers'];
};

type LensItem = {
  est_price_cents: number;
  est_price_dollars: number;
  kind: 'product' | 'context';
  label: string;
  over_limit: boolean;
  state: 'ok' | 'low' | 'out' | 'broken';
  target: boolean;
};

type ScanResponse = {
  comment?: string;
  error?: string;
  items?: LensItem[];
  limitCents?: number;
  tierLabel?: string;
};

const STATE_BADGES: Record<LensItem['state'], string> = {
  ok: '✅',
  low: '🟡',
  out: '🔴',
  broken: '🛠️',
};

const SCAN_INTERVAL_MS = 3000;
const SCENE_CHANGE_THRESHOLD = 7;
const FORCED_RESCAN_MS = 20000;
const SPEAK_COOLDOWN_MS = 12000;
const PROPOSE_TIMEOUT_MS = 30000;
// The advisor makes two model calls and one of them searches the live web.
// Measured ~4s end to end; the ceiling is generous so a slow venue link
// surfaces as an answer rather than a timeout.
const ADVISE_TIMEOUT_MS = 40000;
// How many distinct things the agent keeps in mind from this session.
const SEEN_ITEMS_LIMIT = 12;

const MIC_ERRORS: Record<string, string> = {
  'audio-capture':
    'No microphone input. The input device changed — check System Settings → Sound → Input (iPhone, Teams and Zoom all register as inputs).',
  'not-allowed': 'Microphone blocked. Safari → Settings → Websites → Microphone → allow localhost, then reload.',
  'service-not-allowed': 'Speech service blocked by the browser. Reload the page and tap 🎤 again.',
  'no-speech': 'Heard nothing. The mic is live but silent — is the right input device selected?',
  network: 'Speech service unreachable — check the network.',
  aborted: 'Listening stopped early. Tap 🎤 again.',
};

// Spoken answers to "want me to send it to checkout?"
const CONFIRM_YES = /\b(yes|yeah|yep|yup|sure|confirm|send it|send that|send them|go ahead|do it|please do)\b/i;
const CONFIRM_NO = /\b(no|nope|nah|cancel|stop|forget it|never ?mind|don'?t)\b/i;

function formatDollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

async function downscaleImage(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the photo.'));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Could not load the photo.'));
    element.src = dataUrl;
  });

  const maxEdge = 640;
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const context = canvas.getContext('2d');
  if (!context) {
    return dataUrl;
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}

/** Voice-activity indicator. Decorative on purpose — it never touches the
 *  audio graph, because routing TTS through Web Audio can silence playback. */
function VoiceBars({ active, tone }: { active: boolean; tone: 'beam' | 'ember' | 'jade' }) {
  const color = tone === 'ember' ? 'bg-ember' : tone === 'jade' ? 'bg-jade' : 'bg-beam';
  const heights = [10, 18, 26, 14, 30, 20, 26, 12, 22, 16, 24, 11];

  return (
    <div className="flex h-8 items-end gap-[3px]" aria-hidden>
      {heights.map((height, index) => (
        <span
          key={index}
          className={`w-[3px] rounded-full ${color} origin-bottom transition-opacity duration-300 ${
            active ? 'opacity-90' : 'opacity-25'
          }`}
          style={{
            height: `${height}px`,
            animation: active ? `bar ${620 + (index % 4) * 130}ms ease-in-out ${index * 70}ms infinite` : undefined,
            transform: active ? undefined : 'scaleY(0.3)',
          }}
        />
      ))}
    </div>
  );
}

function SentCheck() {
  return (
    <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10.5" stroke="currentColor" strokeWidth="1.4" opacity="0.35" />
      <path
        d="M7 12.4l3.3 3.3L17 9"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="18"
        strokeDashoffset="18"
        style={{ animation: 'draw 0.55s cubic-bezier(0.16,1,0.3,1) 0.15s both' }}
      />
    </svg>
  );
}

export default function RequestPage() {
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [result, setResult] = useState<ProposeResponse | null>(null);
  const [pending, setPending] = useState<PendingProposal | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [adviceWallet, setAdviceWallet] = useState<{ caption: string; label: string } | null>(null);
  const [adviceBusy, setAdviceBusy] = useState(false);
  const [offers, setOffers] = useState<Advice['offers']>([]);
  const [offersBusy, setOffersBusy] = useState(false);
  const [pricedAll, setPricedAll] = useState<PricedItem[] | null>(null);
  const [pricedBusy, setPricedBusy] = useState(false);
  const [lastSpeech, setLastSpeech] = useState<string | null>(null);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [micNote, setMicNote] = useState<string | null>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lensItems, setLensItems] = useState<LensItem[]>([]);
  /**
   * Everything the lens has named this session, newest first.
   *
   * `lensItems` is only ever the CURRENT frame — each scan replaces it, and
   * stopping the camera clears it. That made "price everything you just showed
   * me" impossible to answer: by the time you asked, the agent had no idea what
   * it had seen, and with an empty context the model reached for the example
   * item in its own prompt and proposed a handbag nobody had shown it.
   *
   * This survives both the next scan and the camera being switched off.
   */
  const [seenItems, setSeenItems] = useState<LensItem[]>([]);
  const [lensComment, setLensComment] = useState('');
  const [lensLimit, setLensLimit] = useState<{ limitCents: number; tierLabel: string } | null>(null);
  const [lensScanning, setLensScanning] = useState(false);
  const [lensStatus, setLensStatus] = useState<string | null>(null);
  const [detectorStatus, setDetectorStatus] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [videoDevices, setVideoDevices] = useState<Array<{ id: string; label: string }>>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);

  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanBusyRef = useRef(false);
  const lastSignatureRef = useRef<number[] | null>(null);
  const lastScanAtRef = useRef(0);
  const latestFrameRef = useRef<string | null>(null);
  const spokenLabelsRef = useRef<Set<string>>(new Set());
  const speakCooldownAtRef = useRef(0);
  const busyRef = useRef(false);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    const SpeechRecognitionImpl =
      (window as unknown as Record<string, unknown>).SpeechRecognition ??
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    setSpeechSupported(Boolean(SpeechRecognitionImpl));
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
    setInterim('');
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognitionImpl = ((window as unknown as Record<string, unknown>).SpeechRecognition ??
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as
      | (new () => {
          continuous: boolean;
          interimResults: boolean;
          lang: string;
          onend: (() => void) | null;
          onerror: ((event: { error?: string }) => void) | null;
          onresult: ((event: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
          start: () => void;
          stop: () => void;
        })
      | undefined;

    if (!SpeechRecognitionImpl) {
      setSpeechSupported(false);
      return;
    }

    setMicNote(null);

    // NOTHING ASYNC MAY GO ABOVE start(). WebKit requires transient user
    // activation to begin recognition, and awaiting anything here (a
    // getUserMedia probe was tried on Jul 30) spends that activation, so
    // start() silently does nothing. Device re-acquisition is handled by the
    // devicechange listener instead — outside the gesture path.
    const recognition = new SpeechRecognitionImpl();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      setMicNote(null);
      let interimText = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const item = event.results[index];
        if (item.isFinal) {
          setTranscript((existing) => `${existing} ${item[0].transcript}`.replace(/\s+/g, ' ').trim());
        } else {
          interimText += item[0].transcript;
        }
      }
      setInterim(interimText);
    };

    // Silence here is fatal on stage: you tap the mic, nothing happens, and
    // there is no clue why. Name the failure instead.
    recognition.onerror = (event) => {
      setMicNote(MIC_ERRORS[event.error ?? ''] ?? `Mic error: ${event.error ?? 'unknown'}`);
      setListening(false);
      setInterim('');
    };

    recognition.onend = () => {
      setListening(false);
      setInterim('');
    };

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }, []);

  const captureFrame = useCallback((): { dataUrl: string; signature: number[] } | null => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      return null;
    }

    const maxEdge = 640;
    const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.75);

    const sigCanvas = document.createElement('canvas');
    sigCanvas.width = 16;
    sigCanvas.height = 16;
    const sigContext = sigCanvas.getContext('2d');
    if (!sigContext) {
      return { dataUrl, signature: [] };
    }
    sigContext.drawImage(video, 0, 0, 16, 16);
    const pixels = sigContext.getImageData(0, 0, 16, 16).data;
    const signature: number[] = [];
    for (let index = 0; index < pixels.length; index += 4) {
      signature.push(Math.round(0.299 * pixels[index] + 0.587 * pixels[index + 1] + 0.114 * pixels[index + 2]));
    }

    return { dataUrl, signature };
  }, []);

  const playSpeech = useCallback(async (text: string) => {
    setVoiceNote(null);

    try {
      const response = await fetch('/api/agent/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `Voice endpoint returned HTTP ${response.status}.`);
      }

      const blob = await response.blob();
      if (blob.size < 500) {
        throw new Error(`Voice endpoint returned a suspiciously small file (${blob.size} bytes).`);
      }

      const audio = new Audio(URL.createObjectURL(blob));
      audio.volume = 1;
      await audio.play();
      setVoiceNote(`🔊 Playing (${Math.round(blob.size / 1024)} KB)`);
      audio.onended = () => setVoiceNote(null);
      return;
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);

      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        window.speechSynthesis.speak(utterance);
        setVoiceNote(`ElevenLabs playback failed (${message}) — tried browser voice instead.`);
        return;
      }

      setVoiceNote(`Audio failed: ${message}`);
    }
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      setVideoDevices(
        allDevices
          .filter((device) => device.kind === 'videoinput')
          .map((device, index) => ({ id: device.deviceId, label: device.label || `Camera ${index + 1}` })),
      );
    } catch {
      // device list stays as-is
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
    setLensScanning(false);
    // The live chips go with the live feed — but NOT seenItems. Putting the
    // camera down is exactly when you turn round and ask about what it saw.
    setLensItems([]);
    setLensComment('');
  }, []);

  const startCamera = useCallback(async (deviceId?: string) => {
    setCameraError(null);
    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1280 } }
          : { facingMode: 'environment', width: { ideal: 1280 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setActiveDeviceId(deviceId ?? stream.getVideoTracks()[0]?.getSettings().deviceId ?? null);
      spokenLabelsRef.current = new Set();
      lastSignatureRef.current = null;
      setLensStatus('Warming up — first scan lands in a few seconds…');
      setCameraOn(true);
      setLensScanning(true);

      void refreshDevices();
      window.setTimeout(() => void refreshDevices(), 2500);
    } catch {
      setCameraError('Camera unavailable — check permissions, or use the photo fallback below.');
    }
  }, [refreshDevices]);

  useEffect(() => stopCamera, [stopCamera]);

  useObjectDetection(videoRef, overlayRef, cameraOn, setDetectorStatus);

  useEffect(() => {
    if (!cameraOn) {
      return;
    }
    const handler = () => void refreshDevices();
    navigator.mediaDevices.addEventListener('devicechange', handler);
    return () => navigator.mediaDevices.removeEventListener('devicechange', handler);
  }, [cameraOn, refreshDevices]);

  useEffect(() => {
    if (!expanded) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpanded(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  useEffect(() => {
    if (!cameraOn) {
      return;
    }
    const video = videoRef.current;
    const stream = streamRef.current;
    if (video && stream && video.srcObject !== stream) {
      video.srcObject = stream;
      void video.play().catch(() => {});
    }
  }, [cameraOn]);

  useEffect(() => {
    if (!cameraOn || !lensScanning) {
      return;
    }

    const timer = window.setInterval(() => {
      void (async () => {
        if (scanBusyRef.current || busyRef.current || document.hidden) {
          return;
        }

        const frame = captureFrame();
        if (!frame) {
          return;
        }
        latestFrameRef.current = frame.dataUrl;

        const previous = lastSignatureRef.current;
        if (previous && frame.signature.length === previous.length && frame.signature.length > 0) {
          let total = 0;
          for (let index = 0; index < previous.length; index += 1) {
            total += Math.abs(previous[index] - frame.signature[index]);
          }
          const meanDiff = total / previous.length;
          if (meanDiff < SCENE_CHANGE_THRESHOLD && Date.now() - lastScanAtRef.current < FORCED_RESCAN_MS) {
            return;
          }
        }

        scanBusyRef.current = true;
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 15000);
        try {
          const response = await fetch('/api/agent/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageDataUrl: frame.dataUrl }),
            signal: controller.signal,
          });

          if (response.status === 401) {
            setNeedsSignIn(true);
            return;
          }
          if (!response.ok) {
            const payload = (await response.json().catch(() => ({}))) as { error?: string };
            const detail = payload.error ?? `HTTP ${response.status}`;
            setLensStatus(
              detail.includes('429')
                ? 'Vision model rate-limited (free tier) — top up OpenRouter to keep scanning.'
                : `Scan failed: ${detail.slice(0, 90)}`,
            );
            return;
          }

          const payload = (await response.json()) as ScanResponse;
          lastSignatureRef.current = frame.signature;
          lastScanAtRef.current = Date.now();
          setLensItems(payload.items ?? []);
          // Fold this frame's products into the session memory. Newest first,
          // deduped by label, capped — a long sweep should not push the thing
          // you are actually holding off the end of the list.
          setSeenItems((previous) => {
            const fresh = (payload.items ?? []).filter((item) => item.kind === 'product');
            if (fresh.length === 0) {
              return previous;
            }
            const freshLabels = new Set(fresh.map((item) => item.label.toLowerCase()));
            return [...fresh, ...previous.filter((item) => !freshLabels.has(item.label.toLowerCase()))].slice(
              0,
              SEEN_ITEMS_LIMIT,
            );
          });
          setLensComment(payload.comment ?? '');
          setLensStatus(null);
          if (payload.limitCents && payload.tierLabel) {
            setLensLimit({ limitCents: payload.limitCents, tierLabel: payload.tierLabel });
          }

          const notable = (payload.items ?? []).find(
            (item) =>
              (item.target || item.state !== 'ok') && !spokenLabelsRef.current.has(item.label.toLowerCase()),
          );
          if (notable && Date.now() > speakCooldownAtRef.current) {
            spokenLabelsRef.current.add(notable.label.toLowerCase());
            speakCooldownAtRef.current = Date.now() + SPEAK_COOLDOWN_MS;
            void playSpeech(payload.comment || `I can see ${notable.label}.`);
          }
        } catch (scanError) {
          if (scanError instanceof DOMException && scanError.name === 'AbortError') {
            setLensStatus('Scan timed out (slow free-tier model) — retrying…');
          }
        } finally {
          window.clearTimeout(timeout);
          scanBusyRef.current = false;
        }
      })();
    }, SCAN_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [cameraOn, captureFrame, lensScanning, playSpeech]);

  const handlePhoto = useCallback(async (file: File | undefined) => {
    if (!file) {
      return;
    }
    try {
      setImageDataUrl(await downscaleImage(file));
    } catch {
      setError('Could not process that photo. Try a different one.');
    }
  }, []);

  /**
   * What the agent is told it can see, in priority order: whatever is in frame
   * right now (with the target flagged), then everything else it has named this
   * session. The second half is what lets "price everything you just showed me"
   * work after the camera is off.
   */
  const buildScanContext = useCallback(() => {
    const live = [...lensItems]
      .sort((a, b) => Number(b.target) - Number(a.target))
      .map((item) => `${item.label}${item.target ? ' (the one they mean)' : ''}`);
    const liveLabels = new Set(lensItems.map((item) => item.label.toLowerCase()));
    const remembered = seenItems
      .filter((item) => !liveLabels.has(item.label.toLowerCase()))
      .map((item) => `${item.label} (seen earlier in this session)`);
    return [...live, ...remembered];
  }, [lensItems, seenItems]);

  /**
   * "Price everything you just showed me." One live search per remembered item,
   * run in parallel server-side. Read-only and independent of the single-item
   * advisor, so it cannot disturb that path.
   */
  const priceEverything = useCallback(async () => {
    const labels = seenItems.map((item) => item.label);
    if (labels.length === 0 || pricedBusy) {
      return;
    }

    stopListening();
    setPricedBusy(true);
    setPricedAll(null);
    setError(null);

    try {
      const response = await fetch('/api/agent/price-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: labels }),
        signal: AbortSignal.timeout(ADVISE_TIMEOUT_MS + 20_000),
      });

      if (response.status === 401) {
        setNeedsSignIn(true);
        return;
      }

      const payload = (await response.json()) as { error?: string; items?: PricedItem[] };
      if (!response.ok || payload.error) {
        setError(payload.error ?? 'Could not price those.');
        return;
      }
      setPricedAll(payload.items ?? []);
    } catch (priceError) {
      const timedOut = priceError instanceof DOMException && priceError.name === 'TimeoutError';
      setError(timedOut ? 'The market lookup took too long — tap again.' : 'Network hiccup — try again.');
    } finally {
      setPricedBusy(false);
    }
  }, [pricedBusy, seenItems, stopListening]);

  /**
   * "Is it worth it?" — asks the advisor to go and read the market before any
   * money is discussed. Read-only: nothing is proposed, staged or charged, so
   * this is always safe to tap mid-demo.
   */
  const askAdvice = useCallback(async () => {
    if (!transcript.trim() || adviceBusy || busy) {
      return;
    }

    stopListening();
    setAdviceBusy(true);
    setError(null);
    setAdvice(null);

    const liveFrame = cameraOn ? (captureFrame()?.dataUrl ?? latestFrameRef.current) : null;
    const frameToSend = imageDataUrl ?? liveFrame;
    const scanContext = buildScanContext();

    try {
      const response = await fetch('/api/agent/advise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: frameToSend, scanContext, transcript }),
        signal: AbortSignal.timeout(ADVISE_TIMEOUT_MS),
      });

      if (response.status === 401) {
        setNeedsSignIn(true);
        return;
      }

      const payload = (await response.json()) as AdviseResponse;

      if (!response.ok || payload.error || !payload.advice) {
        setError(payload.error ?? 'The advisor could not reach the market.');
        return;
      }

      setAdvice(payload.advice);
      setAdviceWallet(payload.wallet ?? null);
      // The question stays in the box — you usually want to buy the thing you
      // just asked about, so Send is one tap away with the wording intact.
      if (payload.speech) {
        setLastSpeech(payload.speech);
        void playSpeech(payload.speech);
      }
    } catch (adviceError) {
      const timedOut = adviceError instanceof DOMException && adviceError.name === 'TimeoutError';
      setError(
        timedOut
          ? `The advisor did not answer within ${ADVISE_TIMEOUT_MS / 1000}s — tap again.`
          : 'Network hiccup — try again.',
      );
    } finally {
      setAdviceBusy(false);
    }
  }, [
    adviceBusy,
    buildScanContext,
    busy,
    cameraOn,
    captureFrame,
    imageDataUrl,
    playSpeech,
    stopListening,
    transcript,
  ]);

  const submit = useCallback(async () => {
    if (!transcript.trim() || busy) {
      return;
    }

    stopListening();
    setBusy(true);
    setError(null);
    setResult(null);
    setPending(null);
    setAdvice(null);

    const liveFrame = cameraOn ? (captureFrame()?.dataUrl ?? latestFrameRef.current) : null;
    const frameToSend = imageDataUrl ?? liveFrame;
    const scanContext = buildScanContext();

    try {
      const response = await fetch('/api/agent/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: frameToSend, scanContext, transcript }),
        // Never let the button spin forever if a model stalls upstream.
        signal: AbortSignal.timeout(PROPOSE_TIMEOUT_MS),
      });

      if (response.status === 401) {
        setNeedsSignIn(true);
        return;
      }

      const payload = (await response.json()) as ProposeResponse;

      if (!response.ok || payload.error) {
        setError(payload.error ?? 'The agent could not build a proposal.');
        return;
      }

      if (!payload.proposal) {
        setError('The agent could not build a proposal.');
        return;
      }

      // Staged, NOT sent — the approver sees nothing until confirmSend() runs.
      setPending({
        frame: frameToSend,
        limitCents: payload.limitCents ?? null,
        overLimit: Boolean(payload.overLimit),
        proposal: payload.proposal,
        requestText: transcript,
        tierLabel: payload.tierLabel ?? null,
      });
      setExpanded(false);

      // Go and find where this can actually be bought — AFTER the card is up,
      // deliberately not awaited, so a slow search never holds up the money.
      const subject = `${payload.proposal.item}`;
      setOffers([]);
      setOffersBusy(true);
      void fetch('/api/agent/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: subject }),
        signal: AbortSignal.timeout(ADVISE_TIMEOUT_MS),
      })
        .then((r) => (r.ok ? r.json() : { offers: [] }))
        .then((p: { offers?: Advice['offers'] }) => setOffers(p.offers ?? []))
        .catch(() => setOffers([]))
        .finally(() => setOffersBusy(false));
      // Clear the request only on success — on failure it stays so the retry works.
      // The photo must go too: frameToSend prefers imageDataUrl over the live
      // frame, so a stale attachment would silently override the lens next time.
      // Cancelling restores requestText from the pending proposal.
      setTranscript('');
      setInterim('');
      setImageDataUrl(null);
      if (payload.speech) {
        setLastSpeech(payload.speech);
        void playSpeech(payload.speech);
      }
    } catch (submitError) {
      const timedOut = submitError instanceof DOMException && submitError.name === 'TimeoutError';
      setError(
        timedOut
          ? `The agent did not answer within ${PROPOSE_TIMEOUT_MS / 1000}s — tap Send to agent again.`
          : 'Network hiccup — try again.',
      );
    } finally {
      setBusy(false);
    }
  }, [buildScanContext, busy, cameraOn, captureFrame, imageDataUrl, playSpeech, stopListening, transcript]);

  const confirmSend = useCallback(async () => {
    if (!pending || confirmBusy) {
      return;
    }

    stopListening();
    setConfirmBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/agent/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl: pending.frame,
          proposal: pending.proposal,
          transcript: pending.requestText,
        }),
        signal: AbortSignal.timeout(PROPOSE_TIMEOUT_MS),
      });

      if (response.status === 401) {
        setNeedsSignIn(true);
        return;
      }

      const payload = (await response.json()) as ProposeResponse;

      if (!response.ok || payload.error) {
        setError(payload.error ?? 'Could not send that to checkout.');
        return;
      }

      setResult(payload);
      setPending(null);
      setTranscript('');
      setInterim('');
      if (payload.speech) {
        setLastSpeech(payload.speech);
        void playSpeech(payload.speech);
      }
    } catch (confirmError) {
      const timedOut = confirmError instanceof DOMException && confirmError.name === 'TimeoutError';
      setError(timedOut ? 'Sending timed out — tap Send to Checkout again.' : 'Network hiccup — try again.');
    } finally {
      setConfirmBusy(false);
    }
  }, [confirmBusy, pending, playSpeech, stopListening]);

  const cancelPending = useCallback(() => {
    stopListening();
    if (pending) {
      // Hand the original wording back so they can edit rather than re-dictate.
      setTranscript(pending.requestText);
    }
    setPending(null);
    setInterim('');
  }, [pending, stopListening]);

  // While a proposal is waiting, the mic answers the question instead of
  // starting a new request — this is the spoken permission grant.
  useEffect(() => {
    if (!pending || confirmBusy) {
      return;
    }
    const heard = transcript.trim();
    if (!heard) {
      return;
    }
    if (CONFIRM_YES.test(heard)) {
      void confirmSend();
    } else if (CONFIRM_NO.test(heard)) {
      cancelPending();
    }
  }, [cancelPending, confirmBusy, confirmSend, pending, transcript]);

  if (needsSignIn) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-4 text-center">
        <div className="panel anim-rise w-full p-9">
          <BrandMark className="mx-auto h-10 w-10 anim-float" />
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-ink">
            Sign in to talk to your purchasing agent
          </h1>
          <p className="mt-2.5 text-sm leading-6 text-mist">
            Auth0 holds the session. Your workspace decides what you may request — and who signs off.
          </p>
          <a className="btn btn-primary mt-7 h-12 w-full" href="/auth/login?returnTo=/request">
            Sign in
          </a>
        </div>
      </main>
    );
  }

  const agentState = confirmBusy ? 'Sending' : busy ? 'Thinking' : listening ? 'Listening' : 'Ready';

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-20 pt-6 sm:px-6">
      <ConsoleHeader
        eyebrow="Loupe"
        title="Ask your purchasing agent"
        right={
          lensLimit ? (
            <span className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/4 px-3 py-2 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-jade" />
              <span className="tabular font-mono text-[11px] tracking-tight text-mist">
                {lensLimit.tierLabel} · {formatDollars(lensLimit.limitCents)} cap
              </span>
            </span>
          ) : null
        }
      />

      <OrgSwitcher />

      <div className="grid gap-4 lg:grid-cols-[1.45fr_1fr]">
        {/* ── Lens column ──
            NOTHING above the viewfinder may carry a filter, transform, backdrop-filter
            or an animation that fills one — any of those makes the ancestor a containing
            block and traps the fullscreen "Big lens" inside this column. Verified in
            Chrome: both `anim-rise` (lingering `filter: blur(0)`) and `anim-rise-sm`
            (animated transform) cage it. So this wrapper stays unstyled and the entrance
            animation lives on the idle button only, which is never a fixed ancestor. */}
        <div className="min-w-0">
          {!cameraOn ? (
            <button
              type="button"
              onClick={() => void startCamera()}
              className="anim-rise group flex min-h-[400px] w-full flex-col items-center justify-center gap-5 rounded-3xl border border-dashed border-white/14 bg-abyss/70 p-10 text-center transition-colors duration-300 hover:border-beam/40 hover:bg-abyss"
            >
              <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/4 transition-colors duration-300 group-hover:border-beam/40">
                <BrandMark className="h-8 w-8 transition-transform duration-700 ease-out group-hover:rotate-90" />
              </span>
              <span>
                <span className="block text-lg font-semibold tracking-tight text-ink">Start live lens</span>
                <span className="mt-1.5 block text-sm text-mist">
                  Point at what you need — boxes are drawn on-device, prices come from the cloud
                </span>
              </span>
              <span className="eyebrow rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-dim">
                camera · on-device detection · scan every 3s
              </span>
            </button>
          ) : (
            <div
              className={
                expanded
                  ? 'fixed inset-0 z-50 flex flex-col bg-black'
                  : 'relative overflow-hidden rounded-3xl border border-white/10 bg-black'
              }
            >
              <div className={expanded ? 'relative min-h-0 flex-1' : 'relative'}>
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className={expanded ? 'h-full w-full object-contain' : 'max-h-[430px] min-h-[430px] w-full object-contain'}
              />
              <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
              <div className="reticle pointer-events-none absolute inset-0" />
              {lensScanning ? <div className="scanline" /> : null}

              <div className="absolute right-3 top-3 flex items-center gap-2">
                <span className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-black/60 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white backdrop-blur-md">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ember shadow-[0_0_8px_2px_rgba(251,113,133,0.85)]" />
                  Lens on
                </span>
                <button
                  type="button"
                  onClick={() => setExpanded((value) => !value)}
                  className="rounded-xl border border-white/15 bg-black/60 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white backdrop-blur-md transition-colors hover:border-white/35 hover:bg-black/80"
                  aria-label={expanded ? 'Shrink lens' : 'Expand lens'}
                >
                  {expanded ? '⤡ Shrink' : '⤢ Big lens'}
                </button>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="rounded-xl border border-white/15 bg-black/60 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white backdrop-blur-md transition-colors hover:border-ember/50 hover:bg-black/80"
                >
                  Stop
                </button>
              </div>
              {videoDevices.length > 0 ? (
                <select
                  value={activeDeviceId ?? ''}
                  onChange={(event) => void startCamera(event.target.value)}
                  className="absolute left-3 top-3 max-w-[55%] appearance-none rounded-xl border border-white/15 bg-black/60 px-3 py-1.5 font-mono text-[11px] font-medium text-white outline-none backdrop-blur-md transition-colors hover:border-white/35"
                >
                  {videoDevices.map((device) => (
                    <option key={device.id} value={device.id} className="text-neutral-900">
                      {device.label}
                    </option>
                  ))}
                </select>
              ) : null}
              {expanded && lensLimit ? (
                <span className="absolute left-1/2 top-3 -translate-x-1/2 rounded-xl border border-white/15 bg-black/60 px-3 py-1.5 font-mono text-[11px] tracking-tight text-white backdrop-blur-md">
                  {lensLimit.tierLabel} · {formatDollars(lensLimit.limitCents)} per-purchase cap
                </span>
              ) : null}
              {lensItems.length > 0 || lensComment || lensStatus || detectorStatus ? (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/75 to-transparent p-4 pt-16">
                  <div className="flex flex-wrap gap-2">
                    {lensItems.map((item, index) => (
                      <span
                        key={`${item.label}-${index}`}
                        style={{ '--d': `${index * 45}ms` } as React.CSSProperties}
                        className={`anim-pop inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium backdrop-blur-md ${
                          item.target
                            ? 'bg-jade text-[#032018] shadow-[0_0_0_2px_rgba(52,211,153,0.35),0_10px_30px_-8px_rgba(52,211,153,0.95)]'
                            : item.over_limit
                              ? 'bg-flare text-[#241a02] shadow-[0_10px_30px_-10px_rgba(251,191,36,0.95)]'
                              : item.kind === 'context'
                                ? 'border border-white/14 bg-white/10 text-white/70'
                                : 'border border-white/20 bg-white/90 text-neutral-900'
                        }`}
                      >
                        <span aria-hidden>{item.target ? '🎯' : STATE_BADGES[item.state]}</span>
                        <span>{item.label}</span>
                        {item.kind === 'product' && item.est_price_cents > 0 ? (
                          <span className="tabular font-mono text-[11px] opacity-75">
                            ~{formatDollars(item.est_price_cents)}
                          </span>
                        ) : null}
                        {item.over_limit && lensLimit ? (
                          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]">
                            over {lensLimit.tierLabel} {formatDollars(lensLimit.limitCents)}
                          </span>
                        ) : null}
                        {item.target ? (
                          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em]">target</span>
                        ) : null}
                      </span>
                    ))}
                  </div>
                  {lensComment ? (
                    <p className="mt-2.5 max-w-2xl text-[13px] italic leading-snug text-white/90">“{lensComment}”</p>
                  ) : null}
                  {lensStatus ? <p className="mt-2 font-mono text-[11px] text-flare">{lensStatus}</p> : null}
                  {detectorStatus ? (
                    <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">
                      {detectorStatus}
                    </p>
                  ) : null}
                </div>
              ) : null}
              </div>
              {expanded && micNote ? (
                <p className="border-t border-flare/30 bg-flare/12 px-5 py-2.5 text-center font-mono text-[12px] leading-5 text-flare">
                  {micNote}
                </p>
              ) : null}
              {expanded ? (
                <div className="flex items-center gap-4 border-t border-white/10 bg-void/95 px-5 py-4">
                  <button
                    type="button"
                    onClick={listening ? stopListening : startListening}
                    disabled={!speechSupported}
                    className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border text-xl transition-all duration-300 ${
                      listening
                        ? 'border-ember/70 bg-ember/15 text-ember shadow-[0_0_30px_-6px_rgba(251,113,133,0.9)]'
                        : 'border-white/15 bg-white/6 text-ink hover:border-beam/45 hover:bg-white/10'
                    } disabled:opacity-40`}
                    aria-label={listening ? 'Stop listening' : 'Start listening'}
                  >
                    {listening ? (
                      <>
                        <span className="mic-ring" />
                        <span className="mic-ring" style={{ animationDelay: '0.7s' }} />
                      </>
                    ) : null}
                    <span className="relative">{listening ? '■' : '🎤'}</span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="eyebrow text-dim">
                      {listening ? 'Listening' : busy ? 'Thinking' : 'Say what you need'}
                    </p>
                    <p className="mt-1 truncate text-[17px] leading-snug text-ink">
                      {(interim ? `${transcript} ${interim}` : transcript).trim() ||
                        'Tap the mic, say what you need, then Send.'}
                    </p>
                  </div>
                  <div className="hidden sm:block">
                    <VoiceBars active={listening || busy} tone={listening ? 'ember' : 'beam'} />
                  </div>
                  <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={busy || !transcript.trim()}
                    className="btn btn-primary h-12 shrink-0 px-6 text-[15px]"
                  >
                    {busy ? 'Thinking…' : 'Send'}
                  </button>
                </div>
              ) : null}
            </div>
          )}
          {cameraError ? (
            <p className="panel-ember mt-3 px-4 py-3 text-[13px] text-ember">{cameraError}</p>
          ) : null}
        </div>

        {/* ── Agent rail ── */}
        <section
          className="panel anim-rise flex min-w-0 flex-col gap-4 p-5"
          style={{ '--d': '110ms' } as React.CSSProperties}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/4">
                <BrandMark className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[15px] font-semibold tracking-tight text-ink">Charlie</p>
                <p className="eyebrow mt-0.5 text-dim">{agentState}</p>
              </div>
            </div>
            <VoiceBars active={listening || busy || confirmBusy} tone={listening ? 'ember' : 'beam'} />
          </div>

          <div className="relative">
            <textarea
              className="field min-h-[150px] resize-y p-4 text-[15px] leading-6"
              placeholder={
                cameraOn
                  ? 'Say “order two of these” — the lens knows what you mean.'
                  : speechSupported
                    ? 'Tap the mic and say what you need — or type it here.'
                    : 'Type what you need (voice input needs Chrome).'
              }
              value={interim ? `${transcript} ${interim}`.trim() : transcript}
              onChange={(event) => setTranscript(event.target.value)}
            />
            {listening ? (
              <span className="eyebrow anim-blink absolute bottom-3 right-3.5 text-ember">● rec</span>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={listening ? stopListening : startListening}
              disabled={!speechSupported}
              className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border text-lg transition-all duration-300 ${
                listening
                  ? 'border-ember/70 bg-ember/15 text-ember shadow-[0_0_30px_-8px_rgba(251,113,133,0.9)]'
                  : 'border-white/15 bg-white/6 text-ink hover:border-beam/45 hover:bg-white/10'
              } disabled:opacity-40`}
              aria-label={listening ? 'Stop listening' : 'Start listening'}
            >
              {listening ? (
                <>
                  <span className="mic-ring" />
                  <span className="mic-ring" style={{ animationDelay: '0.7s' }} />
                </>
              ) : null}
              <span className="relative">{listening ? '■' : '🎤'}</span>
            </button>
            <span className="text-[13px] text-mist">{listening ? 'Listening…' : 'Tap to speak'}</span>
            <button
              type="button"
              onClick={() => void askAdvice()}
              disabled={adviceBusy || busy || !transcript.trim()}
              className="btn btn-ghost ml-auto h-11 px-4 text-[13px]"
            >
              {adviceBusy ? 'Researching…' : '🔍 Is it worth it?'}
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || adviceBusy || !transcript.trim()}
              className="btn btn-primary h-11 px-5"
            >
              {busy ? 'Thinking…' : 'Send to agent'}
            </button>
          </div>

          {micNote ? (
            <p className="anim-rise-sm rounded-xl border border-flare/35 bg-flare/10 px-3.5 py-2.5 text-[12.5px] leading-5 text-flare">
              {micNote}
            </p>
          ) : null}

          {/* What the agent still has in mind. Shown once the camera is off,
              because that is the moment you need to trust it remembers. */}
          {!cameraOn && seenItems.length > 0 ? (
            <div className="anim-rise-sm rounded-xl border border-white/10 bg-white/3 px-3.5 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-beam">
                  Charlie remembers {seenItems.length} item{seenItems.length === 1 ? '' : 's'}
                </p>
                <button
                  type="button"
                  onClick={() => setSeenItems([])}
                  className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-dim transition-colors hover:text-ember"
                >
                  forget
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {seenItems.map((item) => (
                  <span
                    key={item.label}
                    className="rounded-lg border border-white/10 bg-white/4 px-2.5 py-1 text-[12px] text-mist"
                  >
                    {item.label}
                    {item.est_price_dollars > 0 ? (
                      <span className="ml-1.5 font-mono text-[11px] text-dim">
                        ~${Math.round(item.est_price_dollars)}
                      </span>
                    ) : null}
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void priceEverything()}
                disabled={pricedBusy}
                className="btn btn-ghost mt-3 h-10 w-full text-[13px]"
              >
                {pricedBusy ? 'Reading the market…' : `🔍 Price all ${seenItems.length} & find shops`}
              </button>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-4">
            <label className="btn btn-ghost h-10 cursor-pointer px-4 text-[13px]">
              📷 {imageDataUrl ? 'Change photo' : 'Photo fallback'}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => {
                  // Reset the input so picking the SAME photo again still fires onChange.
                  const input = event.currentTarget;
                  const file = input.files?.[0];
                  input.value = '';
                  void handlePhoto(file);
                }}
              />
            </label>
            {!speechSupported ? (
              <span className="font-mono text-[11px] text-flare">voice input unavailable — type instead</span>
            ) : null}
          </div>

          {imageDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt="Attached evidence"
              className="max-h-44 rounded-xl border border-white/10 object-contain"
              src={imageDataUrl}
            />
          ) : null}

          {!pending && !result && voiceNote ? (
            <p className="font-mono text-[11px] leading-relaxed text-dim">{voiceNote}</p>
          ) : null}
        </section>
      </div>

      {error ? (
        <p className="panel-ember anim-rise-sm mt-4 px-4 py-3.5 text-sm leading-6 text-ember">{error}</p>
      ) : null}

      {pricedAll && pricedAll.length > 0 ? (
        <section className="panel anim-rise mt-4 p-6 sm:p-7">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-beam">
              Everything I saw · priced live
            </p>
            <button
              type="button"
              onClick={() => setPricedAll(null)}
              className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-dim transition-colors hover:text-ink"
            >
              dismiss
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-4">
            {pricedAll.map((row) => (
              <div key={row.label} className="border-t border-white/8 pt-4 first:border-t-0 first:pt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="text-[15px] font-medium text-ink">{row.label}</h3>
                  {row.market_low_dollars > 0 ? (
                    <span className="tabular font-mono text-[13.5px] text-mist">
                      ${row.market_low_dollars.toLocaleString()} – ${row.market_high_dollars.toLocaleString()}
                    </span>
                  ) : (
                    <span className="font-mono text-[12px] text-dim">no price found</span>
                  )}
                </div>

                {row.offers.length > 0 ? (
                  <ul className="mt-2 flex flex-col gap-1">
                    {row.offers.map((offer, index) => (
                      <li key={offer.url}>
                        <a
                          className="flex items-center gap-3 rounded-lg border border-white/8 bg-white/3 px-3 py-2 transition-colors hover:border-beam/40 hover:bg-white/6"
                          href={offer.url}
                          rel="noreferrer noopener"
                          target="_blank"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-[12.5px] font-medium text-ink">{offer.merchant}</span>
                            <span className="block truncate text-[11.5px] leading-4 text-dim">{offer.title}</span>
                          </span>
                          <span
                            className={`tabular shrink-0 font-mono text-[13.5px] ${
                              index === 0 ? 'text-jade' : 'text-mist'
                            }`}
                          >
                            ${offer.price_dollars.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1.5 text-[12.5px] text-dim">No shop listings found for this one.</p>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {adviceBusy ? (
        <section className="panel anim-rise mt-4 p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-beam">
            <span className="anim-breathe inline-block">◈</span> reading the market…
          </p>
          <p className="mt-2.5 text-sm leading-6 text-mist">
            Identifying it from the frame, then searching for what it actually sells for.
          </p>
        </section>
      ) : null}

      {advice && !adviceBusy ? (
        <section className="panel anim-rise mt-4 p-6 sm:p-7">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-beam">
              Charlie went and looked{advice.grounded ? ' · live web' : ' · from memory'}
              {adviceWallet ? ` · advising for ${adviceWallet.label}` : ''}
            </p>
            <span
              className={`rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-wider ${
                advice.timing === 'wait'
                  ? 'bg-flare/15 text-flare'
                  : 'bg-jade/15 text-jade'
              }`}
            >
              {advice.timing === 'wait' ? '⏳ worth waiting' : '✓ buy it now'}
            </span>
          </div>

          <h3 className="mt-3.5 text-[19px] font-medium leading-7 text-ink">{advice.item}</h3>

          {adviceWallet ? (
            <p className="mt-1 text-[12.5px] leading-5 text-dim">💳 {adviceWallet.caption}</p>
          ) : null}

          {advice.market_low_dollars > 0 ? (
            <p className="mt-1.5 font-mono text-[15px] tabular-nums text-mist">
              usually ${advice.market_low_dollars.toLocaleString()} – $
              {advice.market_high_dollars.toLocaleString()}
              {advice.verdict !== 'unknown' ? (
                <span
                  className={
                    advice.verdict === 'good_deal'
                      ? 'text-jade'
                      : advice.verdict === 'overpriced'
                        ? 'text-flare'
                        : 'text-dim'
                  }
                >
                  {' '}
                  · {advice.verdict.replace('_', ' ')}
                </span>
              ) : null}
            </p>
          ) : null}

          {advice.headline ? (
            <p className="mt-4 text-[15px] leading-6 text-ink">{advice.headline}</p>
          ) : null}
          {advice.advice ? (
            <p className="mt-2.5 max-w-2xl text-sm leading-6 text-mist">{advice.advice}</p>
          ) : null}

          {advice.offers.length > 0 ? (
            <div className="mt-5 border-t border-white/8 pt-4">
              <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-beam">
                where I can buy it · {advice.offers.length} live listing
                {advice.offers.length === 1 ? '' : 's'}
              </p>
              <ul className="mt-2.5 flex flex-col gap-1.5">
                {advice.offers.map((offer, index) => (
                  <li key={offer.url}>
                    <a
                      className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/4 px-3.5 py-2.5 transition-colors hover:border-beam/40 hover:bg-white/7"
                      href={offer.url}
                      rel="noreferrer noopener"
                      target="_blank"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-medium text-ink">{offer.merchant}</span>
                        <span className="block truncate text-[12px] leading-5 text-dim">{offer.title}</span>
                      </span>
                      {/* Cheapest first, so the best price is the one that reads as won. */}
                      <span
                        className={`tabular shrink-0 font-mono text-[15px] ${index === 0 ? 'text-jade' : 'text-mist'}`}
                      >
                        ${offer.price_dollars.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {advice.sources.length > 0 ? (
            <div className="mt-5 border-t border-white/8 pt-4">
              <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-dim">
                checked {advice.sources.length} source{advice.sources.length === 1 ? '' : 's'} just now
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {advice.sources.map((source) => (
                  <li key={source.url}>
                    <a
                      className="text-[12.5px] leading-5 text-mist underline decoration-white/20 underline-offset-2 transition-colors hover:text-beam"
                      href={source.url}
                      rel="noreferrer noopener"
                      target="_blank"
                    >
                      {source.title || source.url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {pending ? (
        <section className="panel-amber anim-breathe anim-rise mt-4 p-6 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="eyebrow inline-flex items-center gap-2 text-flare">
              <span className="anim-blink h-1.5 w-1.5 rounded-full bg-flare" />
              Needs your OK — not in the cart yet
            </span>
            {lastSpeech ? (
              <button
                type="button"
                onClick={() => void playSpeech(lastSpeech)}
                className="btn btn-ghost h-9 px-3.5 text-[13px]"
              >
                🔊 Replay
              </button>
            ) : null}
          </div>

          <div className="mt-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                {pending.proposal.quantity} × {pending.proposal.item}
              </h2>
              <p className="mt-2.5 max-w-xl text-sm leading-6 text-mist">{pending.proposal.rationale}</p>
            </div>
            <p className="tabular display shrink-0 text-[clamp(2.6rem,6vw,4rem)] text-flare">
              {formatDollars(pending.proposal.total_cents)}
            </p>
          </div>

          {pending.overLimit && pending.limitCents !== null ? (
            <p className="mt-5 flex items-start gap-2.5 rounded-xl border border-flare/40 bg-flare/12 px-4 py-3 text-[13.5px] font-medium leading-6 text-flare">
              <span aria-hidden>⚠</span>
              <span>
                Over your {pending.tierLabel} limit of {formatDollars(pending.limitCents)} — checking out will need
                a plan upgrade.
              </span>
            </p>
          ) : null}

          {/* The catalogue, loaded after the card is already up so a slow
              search can never delay the proposal itself. */}
          {offersBusy ? (
            <p className="mt-5 border-t border-white/10 pt-4 font-mono text-[10.5px] uppercase tracking-[0.16em] text-flare">
              <span className="anim-breathe inline-block">◈</span> finding where to buy it…
            </p>
          ) : null}

          {!offersBusy && offers.length > 0 ? (
            <div className="mt-5 border-t border-white/10 pt-4">
              <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-flare">
                where I can buy it · {offers.length} live listing{offers.length === 1 ? '' : 's'}
              </p>
              <ul className="mt-2.5 flex flex-col gap-1.5">
                {offers.map((offer, index) => (
                  <li key={offer.url}>
                    <a
                      className="flex items-center gap-3 rounded-xl border border-white/12 bg-black/25 px-3.5 py-2.5 transition-colors hover:border-flare/45 hover:bg-black/40"
                      href={offer.url}
                      rel="noreferrer noopener"
                      target="_blank"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-medium text-ink">{offer.merchant}</span>
                        <span className="block truncate text-[12px] leading-5 text-dim">{offer.title}</span>
                      </span>
                      <span
                        className={`tabular shrink-0 font-mono text-[15px] ${index === 0 ? 'text-jade' : 'text-mist'}`}
                      >
                        ${offer.price_dollars.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void confirmSend()}
              disabled={confirmBusy}
              className="btn btn-primary h-11 px-6"
            >
              {confirmBusy ? 'Sending…' : 'Send to Checkout'}
            </button>
            <button
              type="button"
              onClick={cancelPending}
              disabled={confirmBusy}
              className="btn btn-ghost h-11 px-6"
            >
              Cancel
            </button>
            {speechSupported ? (
              <span className="text-[13px] text-mist">
                …or tap 🎤 and say <span className="font-medium text-ink">“yes, send it”</span>
              </span>
            ) : null}
          </div>

          {voiceNote ? <p className="mt-4 font-mono text-[11px] text-dim">{voiceNote}</p> : null}
        </section>
      ) : null}

      {result?.proposal ? (
        <section className="panel-jade anim-rise mt-4 p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
            <div className="flex items-center gap-3.5">
              <span className="text-jade">
                <SentCheck />
              </span>
              <div className="min-w-0">
                <p className="eyebrow text-jade">In the cart</p>
                <h2 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                  {result.proposal.quantity} × {result.proposal.item}
                </h2>
              </div>
            </div>
            <p className="tabular display shrink-0 text-[clamp(2.2rem,5vw,3.4rem)] text-jade">
              {formatDollars(result.proposal.total_cents)}
            </p>
          </div>

          <p className="mt-3.5 max-w-xl text-sm leading-6 text-mist">{result.proposal.rationale}</p>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/8 pt-4">
            {[
              result.proposal.category,
              `request ${result.request?.id.slice(0, 8)}`,
              'awaiting checkout',
            ].map((chip, index) => (
              <span
                key={chip}
                className={`rounded-lg border border-white/10 bg-white/4 px-2.5 py-1.5 font-mono text-[11px] tracking-tight ${
                  index === 2 ? 'text-flare' : 'text-mist'
                }`}
              >
                {chip}
              </span>
            ))}
            {lastSpeech ? (
              <button
                type="button"
                onClick={() => void playSpeech(lastSpeech)}
                className="btn btn-ghost ml-auto h-9 px-3.5 text-[13px]"
              >
                🔊 Replay
              </button>
            ) : null}
          </div>

          {voiceNote ? <p className="mt-4 font-mono text-[11px] text-dim">{voiceNote}</p> : null}
        </section>
      ) : null}
    </main>
  );
}
