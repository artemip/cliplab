import { describe, it, expect } from "vitest";
import { generatePeaksFromWav } from "@/lib/audio/waveform-server";
import { buildWavBuffer, buildWav8BitBuffer } from "./test-helpers";

describe("generatePeaksFromWav", () => {
  it("returns correct number of peaks for valid WAV", () => {
    const samples = new Int16Array(44100); // 1 second of silence
    const buffer = buildWavBuffer(samples);
    const peaks = generatePeaksFromWav(buffer, 50);

    expect(peaks).toHaveLength(50);
  });

  it("returns all zeros for silence", () => {
    const samples = new Int16Array(44100);
    const buffer = buildWavBuffer(samples);
    const peaks = generatePeaksFromWav(buffer);

    expect(peaks.every((p) => p === 0)).toBe(true);
  });

  it("returns peaks near 1.0 for full-scale signal", () => {
    const samples = new Int16Array(44100);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = i % 2 === 0 ? 32767 : -32768; // full-scale square wave
    }
    const buffer = buildWavBuffer(samples);
    const peaks = generatePeaksFromWav(buffer);

    expect(peaks.every((p) => p >= 0.99)).toBe(true);
  });

  it("returns values normalized between 0 and 1", () => {
    const samples = new Int16Array(44100);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.floor(Math.sin(i * 0.1) * 16384); // half-scale sine
    }
    const buffer = buildWavBuffer(samples);
    const peaks = generatePeaksFromWav(buffer);

    expect(peaks.every((p) => p >= 0 && p <= 1)).toBe(true);
    expect(peaks.some((p) => p > 0.4)).toBe(true); // should have some energy
  });

  it("handles 8-bit WAV files", () => {
    const samples = new Uint8Array(44100);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = i % 2 === 0 ? 255 : 0; // full-scale 8-bit
    }
    const buffer = buildWav8BitBuffer(samples);
    const peaks = generatePeaksFromWav(buffer);

    expect(peaks).toHaveLength(100);
    expect(peaks.some((p) => p > 0.9)).toBe(true);
  });

  it("returns empty peaks for empty buffer", () => {
    const peaks = generatePeaksFromWav(Buffer.alloc(0), 50);
    expect(peaks).toHaveLength(50);
    expect(peaks.every((p) => p === 0)).toBe(true);
  });

  it("returns empty peaks for non-WAV data", () => {
    const peaks = generatePeaksFromWav(Buffer.from("not a wav file"), 50);
    expect(peaks).toHaveLength(50);
    expect(peaks.every((p) => p === 0)).toBe(true);
  });

  it("returns empty peaks for truncated WAV header", () => {
    const buffer = Buffer.alloc(20);
    buffer.write("RIFF", 0, "ascii");
    buffer.write("WAVE", 8, "ascii");
    const peaks = generatePeaksFromWav(buffer);

    expect(peaks).toHaveLength(100);
    expect(peaks.every((p) => p === 0)).toBe(true);
  });

  it("returns empty peaks for WAV with no data chunk", () => {
    const buffer = Buffer.alloc(44);
    buffer.write("RIFF", 0, "ascii");
    buffer.writeUInt32LE(36, 4);
    buffer.write("WAVE", 8, "ascii");
    buffer.write("fmt ", 12, "ascii");
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(1, 22); // mono
    buffer.writeUInt32LE(44100, 24);
    buffer.writeUInt32LE(88200, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    // No data chunk

    const peaks = generatePeaksFromWav(buffer);
    expect(peaks.every((p) => p === 0)).toBe(true);
  });

  it("respects custom bucket count", () => {
    const samples = new Int16Array(44100);
    const buffer = buildWavBuffer(samples);

    expect(generatePeaksFromWav(buffer, 10)).toHaveLength(10);
    expect(generatePeaksFromWav(buffer, 200)).toHaveLength(200);
  });
});
