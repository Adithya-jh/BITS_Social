import { useCallback, useEffect, useRef, useState } from "react";
import { FaMicrophone, FaMicrophoneSlash } from "react-icons/fa";

type VoiceComposeButtonProps = {
  onTextReady: (text: string) => void;
  disabled?: boolean;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous?: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  results: Array<{ 0: { transcript: string } }>;
};

type SpeechRecognitionErrorEventLike = {
  error: string;
};

const professionalPatterns = [
  /make (it|this)? (sound )?(?:much )?(?:more )?(professional|formal)/gi,
  /make (it|this)? professional/gi,
  /make (?:this|it) sound polished/gi,
];

export function VoiceComposeButton({
  onTextReady,
  disabled,
}: VoiceComposeButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState<string>("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const manualStopRef = useRef(false);
  const recordingRef = useRef(false);
  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(""), 2500);
    return () => window.clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    recordingRef.current = isRecording;
  }, [isRecording]);

  const stopRecording = () => {
    if (!recognitionRef.current) return;
    manualStopRef.current = true;
    recognitionRef.current.stop();
  };

  const handleTranscript = useCallback(
    (transcript: string) => {
      const processed = buildPostFromTranscript(transcript);
      if (!processed) {
        setStatus("Didn't catch that. Please try again.");
        return;
      }
      onTextReady(processed);
      setStatus("Voice draft inserted");
    },
    [onTextReady]
  );

  const startRecording = () => {
    if (disabled) return;
    const SpeechRecognitionCtor: SpeechRecognitionConstructor | undefined =
      typeof window !== "undefined"
        ? ((window as any).SpeechRecognition ||
            (window as any).webkitSpeechRecognition)
        : undefined;

    if (!SpeechRecognitionCtor) {
      setStatus("Voice capture not supported in this browser.");
      return;
    }

    if (isRecording) {
      stopRecording();
      return;
    }

    try {
      manualStopRef.current = false;
      const recognition: SpeechRecognitionLike = new SpeechRecognitionCtor();
      recognition.lang = "en-US";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.continuous = true;
      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map((result) => result[0].transcript)
          .join(" ");
        handleTranscript(transcript);
        manualStopRef.current = false;
        // keep recording unless stopped by user
        recordingRef.current = true;
      };
      recognition.onerror = (event) => {
        setStatus(
          event.error === "not-allowed"
            ? "Microphone permission denied."
            : "Voice capture failed."
        );
        manualStopRef.current = false;
        setIsRecording(false);
      };
      recognition.onend = () => {
        if (manualStopRef.current) {
          manualStopRef.current = false;
          setIsRecording(false);
          setStatus("Stopped");
          return;
        }
        // auto-restart to keep listening until user stops
        if (recordingRef.current) {
          setTimeout(() => {
            try {
              recognition.start();
            } catch (_) {
              setIsRecording(false);
            }
          }, 150);
        }
      };
      recognitionRef.current = recognition;
      recognition.start();
      setIsRecording(true);
      setStatus("Listening...");
    } catch (error) {
      console.error("Voice capture error", error);
      setStatus("Unable to access microphone.");
      setIsRecording(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={startRecording}
        disabled={disabled}
        aria-pressed={isRecording}
        className={`p-2 rounded-full transition-colors ${
          disabled
            ? "cursor-not-allowed opacity-40"
            : "hover:bg-white/10 text-(--color-main)"
        }`}
        title={isRecording ? "Stop recording" : "Compose with your voice"}
      >
        {isRecording ? <FaMicrophoneSlash /> : <FaMicrophone />}
      </button>
      {status && (
        <p className="absolute left-1/2 -translate-x-1/2 top-full mt-1 whitespace-nowrap text-[10px] text-twitterTextAlt">
          {status}
        </p>
      )}
    </div>
  );
}

function buildPostFromTranscript(transcript: string) {
  if (!transcript) return "";
  let cleaned = transcript.trim();
  if (!cleaned) return "";

  let shouldProfessionalize = false;
  professionalPatterns.forEach((pattern) => {
    pattern.lastIndex = 0;
    if (pattern.test(cleaned)) {
      shouldProfessionalize = true;
    }
    pattern.lastIndex = 0;
    cleaned = cleaned.replace(pattern, "");
  });

  cleaned = cleaned
    .replace(/^post( about| that)?/i, "")
    .replace(/^please\s+/i, "")
    .replace(/\bthanks?\b/i, "thank you")
    .replace(/make it sound great/gi, "")
    .replace(/make it nice/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";

  return shouldProfessionalize ? professionalizeText(cleaned) : cleaned.trim();
}

function professionalizeText(text: string) {
  let refined = sentenceCase(text);
  const replacements = [
    { from: /\bgot\b/gi, to: "received" },
    { from: /\bgotta\b/gi, to: "must" },
    { from: /\bcan't\b/gi, to: "cannot" },
    { from: /\bi'm\b/gi, to: "I am" },
    { from: /\bhey\b/gi, to: "Hello" },
    { from: /\bhi\b/gi, to: "Hello" },
    { from: /\bguys\b/gi, to: "everyone" },
  ];
  replacements.forEach(({ from, to }) => {
    refined = refined.replace(from, to);
  });

  refined = refined.replace(/\bi\b/g, "I");
  refined = ensurePeriod(refined);

  if (/^(Hello|I am|Please|Thank)/i.test(refined)) {
    return refined;
  }
  return `I am pleased to share that ${refined.charAt(0).toLowerCase() === refined.charAt(0)
    ? refined.charAt(0).toUpperCase() + refined.slice(1)
    : refined}`;
}

function sentenceCase(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return ensurePeriod(capitalized);
}

function ensurePeriod(text: string) {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}
