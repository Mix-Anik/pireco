import sounddevice as sd
import wave
import mido
import threading
import time

audio_device = 47
midi_input = 'Roland Digital Piano 1'
samplerate = 44100
channels = 2
duration = 20
audio_chunks = []
midi_events = []

def record_audio():
    def callback(indata, frames, time_info, status):
        audio_chunks.append(bytes(indata))

    with sd.RawInputStream(
        device=audio_device,
        samplerate=samplerate,
        channels=channels,
        dtype="int16",
        callback=callback
    ):
        sd.sleep(duration * 1000)

def record_midi():
    with mido.open_input(midi_input) as port:
        start = time.time()
        while time.time() - start < duration:
            for msg in port.iter_pending():
                midi_events.append((time.time() - start, msg))

audio_thread = threading.Thread(target=record_audio)
midi_thread = threading.Thread(target=record_midi)

audio_thread.start()
midi_thread.start()

audio_thread.join()
midi_thread.join()

# Write WAV
with wave.open("recording.wav", "wb") as wf:
    wf.setnchannels(channels)
    wf.setsampwidth(2)
    wf.setframerate(samplerate)
    for chunk in audio_chunks:
        wf.writeframes(chunk)

# Write MIDI
mid = mido.MidiFile()
track = mido.MidiTrack()
mid.tracks.append(track)

last_time = 0
ticks_per_second = 480

for t, msg in midi_events:
    delta = int((t - last_time) * ticks_per_second)
    msg.time = delta
    track.append(msg)
    last_time = t

mid.save("recording.mid")

print("Saved recording.wav and recording.mid")
