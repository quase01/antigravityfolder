let audioCtx = null;
let isMuted = false;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

export const sound = {
  toggleMute() {
    isMuted = !isMuted;
    localStorage.setItem("mystic_hatchery_muted", isMuted ? "true" : "false");
    return isMuted;
  },

  setMute(state) {
    isMuted = state;
    localStorage.setItem("mystic_hatchery_muted", isMuted ? "true" : "false");
  },

  getMuted() {
    // Read from localStorage if initialized
    const saved = localStorage.getItem("mystic_hatchery_muted");
    if (saved !== null) {
      isMuted = saved === "true";
    }
    return isMuted;
  },

  playClick() {
    if (isMuted) return;
    initAudio();
    if (!audioCtx) return;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(440, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
  },

  playWiggle() {
    if (isMuted) return;
    initAudio();
    if (!audioCtx) return;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(120, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(60, audioCtx.currentTime + 0.15);

    // Add slight tremolo
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
  },

  playCrack() {
    if (isMuted) return;
    initAudio();
    if (!audioCtx) return;

    // Synthesize cracking using high-pass filtered noise
    const bufferSize = audioCtx.sampleRate * 0.05; // 50ms buffer
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    
    // Fill buffer with random noise
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = buffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 1500;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);

    noiseNode.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    noiseNode.start();
    noiseNode.stop(audioCtx.currentTime + 0.05);

    // Play a secondary lower snapping click for weight
    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.03);
    
    oscGain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    oscGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.03);

    osc.connect(oscGain);
    oscGain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.03);
  },

  playHatch() {
    if (isMuted) return;
    initAudio();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;

    // Arpeggio notes (C major triad to G major triad, ending in a lush C major 7th)
    const notes = [
      261.63, // C4
      329.63, // E4
      392.00, // G4
      523.25, // C5
      659.25, // E5
      783.99, // G5
      987.77, // B5 (creates Maj7 color!)
      1046.50 // C6
    ];

    notes.forEach((freq, index) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + index * 0.08);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.12, now + index * 0.08 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.08 + 0.4);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(now + index * 0.08);
      osc.stop(now + index * 0.08 + 0.45);
    });

    // Sustained backing pad chord
    const padNotes = [130.81, 196.00, 329.63, 493.88]; // C3, G3, E4, B4
    padNotes.forEach((freq) => {
      const osc = audioCtx.createOscillator();
      const filter = audioCtx.createBiquadFilter();
      const gain = audioCtx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now + 0.4);
      
      // Warm filter envelope
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(300, now + 0.4);
      filter.frequency.exponentialRampToValueAtTime(1200, now + 0.8);
      filter.frequency.exponentialRampToValueAtTime(200, now + 2.5);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.6);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 2.8);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(now + 0.4);
      osc.stop(now + 2.8);
    });
  }
};
