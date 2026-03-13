import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { AudioLevelPayload, MidiEventPayload } from '../types';

export function useTauriEvents() {
  const [audioLevel, setAudioLevel] = useState(0);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  // Smoothed level for display — avoids too-jittery meter
  const smoothRef = useRef(0);

  useEffect(() => {
    let destroyed = false;

    const unlistenAudio = listen<AudioLevelPayload>('audio-level', (event) => {
      if (destroyed) return;
      // Exponential moving average: fast attack, slow release
      const raw = event.payload.rms;
      smoothRef.current = raw > smoothRef.current
        ? raw * 0.7 + smoothRef.current * 0.3   // fast attack
        : raw * 0.05 + smoothRef.current * 0.95; // slow release
      setAudioLevel(smoothRef.current);
    });

    const unlistenMidi = listen<MidiEventPayload>('midi-event', (event) => {
      if (destroyed) return;
      const { note, is_note_on } = event.payload;
      setActiveNotes((prev) => {
        const next = new Set(prev);
        if (is_note_on) next.add(note);
        else next.delete(note);
        return next;
      });
    });

    return () => {
      destroyed = true;
      unlistenAudio.then((f) => f());
      unlistenMidi.then((f) => f());
    };
  }, []);

  return { audioLevel, activeNotes };
}
