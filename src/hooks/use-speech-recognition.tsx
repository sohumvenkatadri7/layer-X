import { useState, useEffect, useCallback, useRef } from "react";

interface UseSpeechRecognitionOptions {
  continuous?: boolean;
  language?: string;
  interimResults?: boolean;
  keywords?: string[];
  keywordBoost?: number;
  deepgramModel?: string;
  smartFormat?: boolean;
  punctuate?: boolean;
  numerals?: boolean;
  profanityFilter?: boolean;
  vadEvents?: boolean;
  endpointingMs?: number;
  utteranceEndMs?: number;
  chunkMs?: number;
  audioBitsPerSecond?: number;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
}

interface UseSpeechRecognitionReturn {
  transcript: string;
  finalTranscript: string;
  isListening: boolean;
  error: string | null;
  permissionDenied: boolean;
  browserSupportsSpeech: boolean;
  isMicrophoneAvailable: boolean;
  startListening: () => Promise<void>;
  stopListening: () => void;
  toggleListening: () => Promise<void>;
  resetTranscript: () => void;
  requestMicrophonePermission: () => Promise<boolean>;
}

// Helper function to convert number words to digits for crypto commands
function normalizeNumbers(text: string): string {
  if (!text) return text;

  const numberMap: Record<string, string> = {
    zero: "0",
    one: "1",
    two: "2",
    three: "3",
    four: "4",
    five: "5",
    six: "6",
    seven: "7",
    eight: "8",
    nine: "9",
    ten: "10",
    eleven: "11",
    twelve: "12",
    thirteen: "13",
    fourteen: "14",
    fifteen: "15",
    sixteen: "16",
    seventeen: "17",
    eighteen: "18",
    nineteen: "19",
    twenty: "20",
    thirty: "30",
    forty: "40",
    fifty: "50",
    sixty: "60",
    seventy: "70",
    eighty: "80",
    ninety: "90",
    hundred: "100",
  };

  let normalized = text.toLowerCase();

  Object.entries(numberMap).forEach(([word, digit]) => {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    normalized = normalized.replace(regex, digit);
  });

  // Convert spoken decimals like "1 point 5" into "1.5".
  normalized = normalized.replace(/\b(\d+)\s+point\s+(\d+)\b/gi, "$1.$2");

  normalized = normalized.replace(/\b(sol|soul|solve|sold|salt)\b/gi, "SOL");
  normalized = normalized.replace(/\b(usdc|u s d c)\b/gi, "USDC");
  normalized = normalized.replace(/\b(jup|jupiter)\b/gi, "JUP");
  normalized = normalized.replace(/\b(eth|ethereum)\b/gi, "ETH");

  // Deepgram with smart_format often appends periods at the end.
  // Strip trailing punctuation so it doesn't break our regex or contact matching.
  normalized = normalized.replace(/[.,!?]+$/, "");

  // Canonicalize transfer commands into a stable shape for parser reliability.
  normalized = normalized.replace(
    /\b(send|transfer)\s+(\d+(?:\.\d+)?)\s*(SOL|USDC|JUP|ETH)\s+to\s+(?:at\s+)?@?([a-zA-Z0-9_.-]+)/i,
    (_match, _verb, amount, token, recipient) =>
      `send ${amount} ${String(token).toUpperCase()} to @${String(recipient).toLowerCase()}`,
  );

  normalized = normalized.replace(
    /\b(?:swap|exchange|convert)\s+(\d+(?:\.\d+)?)\s*(SOL|USDC|JUP|ETH)\s+(?:to|for|into)\s+(SOL|USDC|JUP|ETH)\b/i,
    (_match, amount, fromToken, toToken) =>
      `swap ${amount} ${String(fromToken).toUpperCase()} to ${String(toToken).toUpperCase()}`,
  );

  // Fallback formatting for partial phrases that are not full transfer commands.
  normalized = normalized.replace(/\bto\s+(?:at\s+)?(?!@)([a-zA-Z][a-zA-Z0-9_.-]*)\b/gi, "to @$1");
  normalized = normalized.replace(/\bat\s+(?!@)([a-zA-Z][a-zA-Z0-9_.-]*)\b/gi, "@$1");

  // Keep handle casing predictable for matching against normalized contact names.
  normalized = normalized.replace(
    /@([a-zA-Z0-9_.-]+)/g,
    (_m, handle) => `@${handle.toLowerCase()}`,
  );

  return normalized;
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {},
): UseSpeechRecognitionReturn {
  const {
    language = "en-US",
    interimResults = true,
    keywords = [],
    keywordBoost = 10,
    deepgramModel = "nova-2",
    smartFormat = true,
    punctuate = true,
    numerals = true,
    profanityFilter = false,
    vadEvents = true,
    endpointingMs = 500,
    utteranceEndMs = 1200,
    chunkMs = 250,
    audioBitsPerSecond = 128000,
    onResult,
    onError,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isMicrophoneAvailable, setIsMicrophoneAvailable] = useState(true);

  const [transcript, setTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const lastProcessedRef = useRef<string>("");
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track accumulated string across utterances
  const accumulatedRef = useRef("");

  const resetTranscript = useCallback(() => {
    setTranscript("");
    setFinalTranscript("");
    lastProcessedRef.current = "";
    accumulatedRef.current = "";
  }, []);

  const requestMicrophonePermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop the stream right away, we just wanted permission validation
      stream.getTracks().forEach((track) => track.stop());
      setIsMicrophoneAvailable(true);
      setPermissionDenied(false);
      setError(null);
      return true;
    } catch (err) {
      console.error(err);
      setIsMicrophoneAvailable(false);
      setPermissionDenied(true);
      setError("Microphone access denied. Please allow it in the browser.");
      return false;
    }
  }, []);

  const stopListening = useCallback(() => {
    setIsListening(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (socketRef.current) {
      // Disconnect cleanly
      socketRef.current.send(JSON.stringify({ type: "CloseStream" }));
      setTimeout(() => {
        if (socketRef.current) socketRef.current.close();
      }, 500);
    }

    // Dispatch final update
    if (accumulatedRef.current && onResult) {
      const normalized = normalizeNumbers(accumulatedRef.current.trim());
      onResult(normalized, true);
    }
  }, [onResult]);

  const startListening = useCallback(async () => {
    setError(null);
    resetTranscript();

    if (!isMicrophoneAvailable) {
      const granted = await requestMicrophonePermission();
      if (!granted) return;
    }

    try {
      // 1. Fetch a temporary token from our server
      const apiUrl =
        import.meta.env.VITE_CONTACTS_API_URL || (import.meta.env.PROD ? "/api" : "http://localhost:8787");
      const tokenRes = await fetch(`${apiUrl}/speech-token`);
      if (!tokenRes.ok) {
        throw new Error("Failed to authenticate speech recognition.");
      }

      const { key: deepgramToken } = await tokenRes.json();

      // 2. Open Microphone Stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // 3. Connect to Deepgram WebSocket API
      const wsParams = new URLSearchParams({
        language,
        model: deepgramModel,
        smart_format: String(smartFormat),
        punctuate: String(punctuate),
        numerals: String(numerals),
        profanity_filter: String(profanityFilter),
        vad_events: String(vadEvents),
        interim_results: String(interimResults),
      });

      if (endpointingMs > 0) {
        wsParams.set("endpointing", String(endpointingMs));
      }

      if (utteranceEndMs > 0) {
        wsParams.set("utterance_end_ms", String(utteranceEndMs));
      }

      if (keywords.length > 0) {
        for (const keyword of keywords) {
          const trimmed = keyword.trim();
          if (!trimmed) continue;
          wsParams.append("keywords", `${trimmed}:${keywordBoost}`);
        }
      }

      const wssUrl = `wss://api.deepgram.com/v1/listen?${wsParams.toString()}`;
      const socket = new WebSocket(wssUrl, ["token", deepgramToken]);

      socketRef.current = socket;

      socket.onopen = () => {
        setIsListening(true);

        // Start streaming mic data
        const recorderOptions: MediaRecorderOptions = {
          audioBitsPerSecond,
        };

        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          recorderOptions.mimeType = "audio/webm;codecs=opus";
        }

        const mediaRecorder = new MediaRecorder(stream, recorderOptions);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.addEventListener("dataavailable", (event) => {
          if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
            socket.send(event.data);
          }
        });

        mediaRecorder.start(chunkMs);
      };

      socket.onmessage = (message) => {
        const received = JSON.parse(message.data);

        if (received.type === "Results") {
          const transcriptChunk = received.channel?.alternatives[0]?.transcript;
          const isFinal = Boolean(received.is_final);

          if (!transcriptChunk) return;

          // Replace transcript text context
          const currentViewingText = accumulatedRef.current
            ? `${accumulatedRef.current} ${transcriptChunk}`
            : transcriptChunk;

          if (interimResults || isFinal) {
            setTranscript(currentViewingText);
          }

          if (isFinal) {
            accumulatedRef.current = currentViewingText;
            setFinalTranscript(currentViewingText);
          }

          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

          debounceTimerRef.current = setTimeout(() => {
            const normalized = normalizeNumbers(currentViewingText);
            if (normalized !== lastProcessedRef.current) {
              if (onResult) onResult(normalized, isFinal);
              lastProcessedRef.current = normalized;
            }
          }, 300);
        }
      };

      socket.onclose = () => {
        setIsListening(false);
        stream.getTracks().forEach((track) => track.stop());
      };

      socket.onerror = (err) => {
        console.error("WebSocket error:", err);
        setError("Network error communicating with speech recognition service.");
        stopListening();
      };
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to start speech recognition.");
      setIsListening(false);
      if (onError) onError(err instanceof Error ? err.message : String(err));
    }
  }, [
    audioBitsPerSecond,
    chunkMs,
    deepgramModel,
    endpointingMs,
    isMicrophoneAvailable,
    interimResults,
    keywordBoost,
    language,
    keywords,
    numerals,
    profanityFilter,
    punctuate,
    requestMicrophonePermission,
    resetTranscript,
    smartFormat,
    stopListening,
    utteranceEndMs,
    vadEvents,
    onError,
    onResult,
  ]);

  const toggleListening = useCallback(async () => {
    if (isListening) stopListening();
    else await startListening();
  }, [isListening, startListening, stopListening]);

  return {
    transcript,
    finalTranscript,
    isListening,
    error,
    permissionDenied,
    browserSupportsSpeech: true, // Websockets work anywhere
    isMicrophoneAvailable,
    startListening,
    stopListening,
    toggleListening,
    resetTranscript,
    requestMicrophonePermission,
  };
}
