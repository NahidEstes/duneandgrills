import { useEffect, useRef, useState } from 'react';
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { results: { isFinal: boolean; [index: number]: { transcript: string } }[] }) => void) | null;
  onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null;
  start(): void; abort(): void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
export function useDictation(onText: (text: string) => void, onError: (text: string) => void) {
  const supported = typeof window !== 'undefined' && !!((window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition);
  const [listening, setListening] = useState(false);
  const active = useRef<Recognition | null>(null);
  const callbacks = useRef({ onText, onError });
  useEffect(() => { callbacks.current = { onText, onError }; }, [onText, onError]);
  useEffect(() => {
    return () => { if (active.current) { active.current.onresult = null; active.current.onerror = null; active.current.onend = null; active.current.abort(); active.current = null; } };
  }, []);
  function stop() {
    if (active.current) { active.current.onresult = null; active.current.onerror = null; active.current.onend = null; active.current.abort(); active.current = null; }
    setListening(false);
  }
  function start() {
    if (active.current) return;
    const w = window as SpeechWindow;
    const Constructor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Constructor) return;
    const recognition = new Constructor();
    active.current = recognition;
    recognition.lang = 'en-US'; recognition.continuous = false; recognition.interimResults = false;
    recognition.onresult = event => {
      const result = event.results[0];
      if (result?.isFinal && result[0]?.transcript) callbacks.current.onText(result[0].transcript.trim());
    };
    recognition.onerror = event => { if (event.error !== 'aborted') callbacks.current.onError(event.error === 'not-allowed' ? 'Microphone access was declined. Type your note instead.' : 'Voice input is unavailable right now. Type your note or use keyboard dictation.'); };
    recognition.onend = () => { active.current = null; setListening(false); };
    try { recognition.start(); setListening(true); }
    catch { stop(); callbacks.current.onError('Could not start voice input. Type your note instead.'); }
  }
  return { supported, listening, start, stop };
}
