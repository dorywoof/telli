# telli

Play chords in the air. telli turns your webcam into an instrument: your left hand picks notes, your right hand shapes the sound.

**Live demo:** open `index.html` through any static server and allow camera access.

## How it works

- **Left hand — notes.** Raise fingers to pick a scale degree: 1 finger = I, 5 fingers = V. Index + pinky = VI, add the thumb for VII. Tilt your hand to flip major and minor.
- **Right hand — expression.** Hand height controls volume, 1-4 fingers pick the chord style (triad, first inversion, 7th, 9th), tilting sweeps the filter, thumb pointing down drops an octave.
- **Theremin mode.** Right hand height sets pitch, left hand height sets volume.

Four instruments: synth, organ, piano and guitar. Twelve keys. Nine interface languages with automatic detection.

All processing happens in the browser. Video never leaves the device.

## Running locally

```
python -m http.server 8756
```

Then open http://localhost:8756. Chrome or Edge on desktop works best; stand about an arm's length from the camera in good lighting.

## Stack

- [MediaPipe Hand Landmarker](https://developers.google.com/mediapipe) for hand tracking
- [Tone.js](https://tonejs.github.io/) for synthesis and sampling
- Plain HTML, CSS and JavaScript — no build step

## License

MIT
