# telli

Air guitar, except it actually makes sound.

telli turns your webcam into an instrument. Your left hand picks the notes, your right hand does everything else. No MIDI controller, no install, no account. Open the page, show it your hands, play.

*"telli" is Turkish for "stringed" — as in stringed instrument. Except there are no strings. You get the idea.*

## The left hand

Count fingers to pick a note:

- 1 finger is the first degree of the scale, 5 fingers is the fifth
- index + pinky (yes, the rock sign) gets you the sixth
- throw in the thumb for the seventh
- tilt your hand sideways and the chord goes minor. Tilt back, major again.

Close your fist and everything goes quiet. That's the whole interface.

## The right hand

This is where it gets fun:

- raise or lower your hand to control volume
- hold up 1 to 4 fingers to change the chord flavor: plain triad, first inversion, 7th, 9th
- tilt to sweep the filter from dark to bright
- point your thumb down to drop an octave

## Theremin mode

Switch modes in the top bar and wave your hands like a 1920s sci-fi soundtrack. Right hand is pitch, left hand is volume.

## Sounds

Five instruments: synth, organ, piano (real sampled piano), guitar, and electric guitar with a crunchy chorus-drenched tone. Twelve keys to play in. The interface speaks nine languages and picks yours automatically.

## Privacy

Your camera feed never leaves your machine. Hand tracking runs entirely in the browser, there is no server, nothing is uploaded anywhere. Check the network tab if you don't believe me.

## Run it

```
python -m http.server 8756
```

Open http://localhost:8756, allow the camera, stand about an arm's length back. Good lighting helps a lot. Chrome or Edge on desktop works best.

## Built with

- [MediaPipe Hand Landmarker](https://developers.google.com/mediapipe) for the hand tracking
- [Tone.js](https://tonejs.github.io/) for every sound you hear
- vanilla HTML, CSS and JS. No framework, no build step, nothing to compile.

## License

MIT
