/**
 * Shutter sound for the in-app camera, made with Web Audio (no sound file, nothing loaded from the network).
 * Two short filtered noise clicks, like a mechanical shutter. Fails silently where audio is unavailable.
 */
let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Call from a tap (opening the camera, switching the sound on) so the browser lets the sound play later. */
export function primeShutterSound(): void {
  context();
}

export function playShutterSound(): void {
  const ac = context();
  if (!ac) return;
  try {
    const rate = ac.sampleRate;
    const len = Math.floor(rate * 0.14);
    const buf = ac.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / rate;
      const env = Math.exp(-t * 70) + (t > 0.07 ? 0.7 * Math.exp(-(t - 0.07) * 80) : 0);
      d[i] = (Math.random() * 2 - 1) * env;
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    const band = ac.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2400;
    band.Q.value = 0.8;
    const gain = ac.createGain();
    gain.gain.value = 0.7;
    src.connect(band).connect(gain).connect(ac.destination);
    src.start();
  } catch {
    /* audio blocked: the flash and vibration still show the capture */
  }
}
