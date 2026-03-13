# Pireco <sup><sup><sub>/pˈirɛkɔ/</sub></sup></sup>

> Simple audio & MIDI recorder for desktop — built with Tauri 2, Rust, and React.

![App Preview](assets/preview.gif)

## Features

- **Audio recording** — capture from any input device with live waveform and VU meter visualization
- **MIDI recording** — optionally record MIDI alongside audio; both are saved in sync
- **Playback** — instant playback after recording with a seekable waveform
- **Device persistence** — remembers your last selected audio and MIDI devices across launches
- **Keyboard shortcut** — press `Space` to start / stop recording

## Stack

| Layer    | Tech                          |
|----------|-------------------------------|
| Shell    | Tauri 2 (Rust backend)        |
| Frontend | React + TypeScript + Vite     |
| Audio    | cpal 0.15                     |
| MIDI     | midir 0.10                    |
| Output   | WAV (hound) + MIDI            |

## Installation

Go to the [latest release](../../releases/latest) and download the file for your platform:

| Platform | File |
|----------|------|
| Windows | `.msi` installer |
| macOS | `.dmg` disk image |
| Linux (Ubuntu/Debian) | `.deb` package |
| Linux (Fedora/RHEL) | `.rpm` package |
| Linux (universal) | `.AppImage` |

> **Linux note:** The `.AppImage` works on any distro without installation — just make it executable (`chmod +x`) and run it.

## Usage

1. Select an **Audio Input** device from the sidebar
2. Optionally select a **MIDI Input** device
3. Press **Record** (or `Space`) to start
4. Press **Stop** (or `Space`) to finish
5. **Play** back, then **Save** the WAV (+ MIDI if recorded)

## Output

Recordings are saved via a file dialog. Audio is exported as a **WAV** file; if MIDI was captured, a matching **.mid** file is saved alongside it.

## Development

**Prerequisites:** Node.js, Rust + Cargo, and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```bash
# Install dependencies
npm install

# Run in development
npm run tauri dev

# Build for production
npm run tauri build
```