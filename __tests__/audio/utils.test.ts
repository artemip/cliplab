import { describe, it, expect } from "vitest";
import { generatePeaks, audioBufferToWav } from "@/lib/audio/utils";
import { createTestBuffer, generateSineWave, generateSilence } from "./test-helpers";

describe("generatePeaks", () => {
  it("returns the requested number of buckets", () => {
    const buffer = createTestBuffer([new Float32Array(44100)]);
    expect(generatePeaks(buffer, 50)).toHaveLength(50);
    expect(generatePeaks(buffer, 200)).toHaveLength(200);
  });

  it("returns all zeros for silence", () => {
    const silence = generateSilence(44100, 1);
    const buffer = createTestBuffer([silence]);
    const peaks = generatePeaks(buffer, 100);

    expect(peaks.every((p) => p === 0)).toBe(true);
  });

  it("returns peaks near 1.0 for full-scale signal", () => {
    const data = new Float32Array(44100);
    for (let i = 0; i < data.length; i++) data[i] = i % 2 === 0 ? 1 : -1;
    const buffer = createTestBuffer([data]);
    const peaks = generatePeaks(buffer, 100);

    expect(peaks.every((p) => p >= 0.99)).toBe(true);
  });

  it("returns values between 0 and 1 for sine wave", () => {
    const sine = generateSineWave(440, 44100, 1);
    const buffer = createTestBuffer([sine]);
    const peaks = generatePeaks(buffer, 100);

    expect(peaks.every((p) => p >= 0 && p <= 1)).toBe(true);
    expect(peaks.some((p) => p > 0.9)).toBe(true);
  });

  it("handles very short buffers", () => {
    const buffer = createTestBuffer([new Float32Array(10)]);
    const peaks = generatePeaks(buffer, 100);

    expect(peaks).toHaveLength(100);
  });

  it("uses first channel for multi-channel audio", () => {
    const ch0 = new Float32Array(44100).fill(0.5);
    const ch1 = new Float32Array(44100).fill(0);
    const buffer = createTestBuffer([ch0, ch1]);
    const peaks = generatePeaks(buffer, 10);

    expect(peaks.every((p) => p === 0.5)).toBe(true);
  });
});

describe("audioBufferToWav", () => {
  it("produces a Blob with audio/wav MIME type", () => {
    const buffer = createTestBuffer([new Float32Array(44100)]);
    const wav = audioBufferToWav(buffer);

    expect(wav).toBeInstanceOf(Blob);
    expect(wav.type).toBe("audio/wav");
  });

  it("produces correct file size for mono signal", () => {
    const numFrames = 44100;
    const buffer = createTestBuffer([new Float32Array(numFrames)]);
    const wav = audioBufferToWav(buffer);

    // 44 bytes header + numFrames * 2 bytes (16-bit) * 1 channel
    expect(wav.size).toBe(44 + numFrames * 2);
  });

  it("produces correct file size for stereo signal", () => {
    const numFrames = 44100;
    const buffer = createTestBuffer([
      new Float32Array(numFrames),
      new Float32Array(numFrames),
    ]);
    const wav = audioBufferToWav(buffer);

    expect(wav.size).toBe(44 + numFrames * 2 * 2);
  });

  it("WAV header has correct RIFF/WAVE markers", async () => {
    const buffer = createTestBuffer([new Float32Array(100)]);
    const wav = audioBufferToWav(buffer);
    const arrayBuf = await wav.arrayBuffer();
    const view = new DataView(arrayBuf);

    // RIFF
    expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)))
      .toBe("RIFF");
    // WAVE
    expect(String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11)))
      .toBe("WAVE");
    // fmt
    expect(String.fromCharCode(view.getUint8(12), view.getUint8(13), view.getUint8(14), view.getUint8(15)))
      .toBe("fmt ");
    // data
    expect(String.fromCharCode(view.getUint8(36), view.getUint8(37), view.getUint8(38), view.getUint8(39)))
      .toBe("data");
  });

  it("WAV header has correct sample rate and channel count", async () => {
    const buffer = createTestBuffer(
      [new Float32Array(100), new Float32Array(100)],
      48000
    );
    const wav = audioBufferToWav(buffer);
    const arrayBuf = await wav.arrayBuffer();
    const view = new DataView(arrayBuf);

    expect(view.getUint16(22, true)).toBe(2); // channels
    expect(view.getUint32(24, true)).toBe(48000); // sample rate
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
  });

  it("encodes a full-scale sample correctly", async () => {
    const data = new Float32Array([1.0, -1.0]);
    const buffer = createTestBuffer([data]);
    const wav = audioBufferToWav(buffer);
    const arrayBuf = await wav.arrayBuffer();
    const view = new DataView(arrayBuf);

    // First sample (1.0 → 0x7FFF = 32767)
    expect(view.getInt16(44, true)).toBe(32767);
    // Second sample (-1.0 → -0x8000 = -32768)
    expect(view.getInt16(46, true)).toBe(-32768);
  });

  it("clamps values outside [-1, 1]", async () => {
    const data = new Float32Array([2.0, -2.0]);
    const buffer = createTestBuffer([data]);
    const wav = audioBufferToWav(buffer);
    const arrayBuf = await wav.arrayBuffer();
    const view = new DataView(arrayBuf);

    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32768);
  });

  it("round-trips through server-side peak parser", async () => {
    // Generate a sine wave, encode to WAV, parse peaks server-side
    const { generatePeaksFromWav } = await import(
      "@/lib/audio/waveform-server"
    );

    const sine = generateSineWave(440, 44100, 0.5);
    const audioBuffer = createTestBuffer([sine], 44100);
    const wav = audioBufferToWav(audioBuffer);
    const wavArrayBuf = await wav.arrayBuffer();
    const nodeBuffer = Buffer.from(wavArrayBuf);

    const peaks = generatePeaksFromWav(nodeBuffer, 50);

    expect(peaks).toHaveLength(50);
    expect(peaks.some((p) => p > 0.9)).toBe(true);
    expect(peaks.every((p) => p >= 0 && p <= 1)).toBe(true);
  });
});
