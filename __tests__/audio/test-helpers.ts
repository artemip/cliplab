/**
 * Test helpers for audio tests.
 * Provides minimal AudioBuffer/AudioContext mocks for Node environment.
 */

/** Create a fake AudioBuffer with the given channel data. */
export function createTestBuffer(
  channelData: Float32Array[],
  sampleRate = 44100
): AudioBuffer {
  const length = channelData[0]?.length ?? 0;
  return {
    length,
    duration: length / sampleRate,
    sampleRate,
    numberOfChannels: channelData.length,
    getChannelData(channel: number) {
      return channelData[channel] ?? new Float32Array(0);
    },
    copyFromChannel: vi.fn(),
    copyToChannel: vi.fn(),
  } as unknown as AudioBuffer;
}

/** Generate a sine wave as Float32Array. */
export function generateSineWave(
  frequency: number,
  sampleRate: number,
  durationSeconds: number
): Float32Array {
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const data = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    data[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  return data;
}

/** Generate silence as Float32Array. */
export function generateSilence(
  sampleRate: number,
  durationSeconds: number
): Float32Array {
  return new Float32Array(Math.floor(sampleRate * durationSeconds));
}

/** Build a valid WAV Buffer from raw PCM Int16 samples. */
export function buildWavBuffer(
  samples: Int16Array,
  sampleRate = 44100,
  channels = 1,
  bitsPerSample = 16
): Buffer {
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = channels * bytesPerSample;
  const dataSize = samples.length * bytesPerSample;
  const headerSize = 44;
  const buffer = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(headerSize + dataSize - 8, 4);
  buffer.write("WAVE", 8, "ascii");

  // fmt chunk
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16); // chunk size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(samples[i], headerSize + i * bytesPerSample);
  }

  return buffer;
}

/** Build a WAV Buffer with 8-bit samples. */
export function buildWav8BitBuffer(
  samples: Uint8Array,
  sampleRate = 44100
): Buffer {
  const dataSize = samples.length;
  const headerSize = 44;
  const buffer = Buffer.alloc(headerSize + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(headerSize + dataSize - 8, 4);
  buffer.write("WAVE", 8, "ascii");

  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34); // 8-bit

  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    buffer.writeUInt8(samples[i], headerSize + i);
  }

  return buffer;
}
