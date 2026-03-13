const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiNoteToName(note: number): string {
  const octave = Math.floor(note / 12) - 1;
  const name = NOTE_NAMES[note % 12];
  return `${name}${octave}`;
}

export function isBlackKey(note: number): boolean {
  return [1, 3, 6, 8, 10].includes(note % 12);
}

export interface KeyInfo {
  midiNote: number;
  isBlack: boolean;
  x: number;
  width: number;
}

const WHITE_KEY_W = 14;

/** Build key layout for MIDI notes 21 (A0) to 108 (C8) */
export function buildKeyboard(): KeyInfo[] {
  const keys: KeyInfo[] = [];

  // White keys
  let whiteCount = 0;
  for (let note = 21; note <= 108; note++) {
    if (!isBlackKey(note)) {
      keys.push({ midiNote: note, isBlack: false, x: whiteCount * WHITE_KEY_W, width: WHITE_KEY_W - 1 });
      whiteCount++;
    }
  }

  // Black keys (overlaid on top of white keys in render order)
  whiteCount = 0;
  for (let note = 21; note <= 108; note++) {
    if (!isBlackKey(note)) {
      whiteCount++;
    } else {
      const x = (whiteCount - 1) * WHITE_KEY_W + WHITE_KEY_W - 4;
      keys.push({ midiNote: note, isBlack: true, x, width: 8 });
    }
  }

  return keys;
}

export const KEYBOARD_WIDTH = 52 * WHITE_KEY_W; // 728px
