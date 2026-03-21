/**
 * Audio utility functions — peak generation, buffer conversion, WAV encoding.
 */

/**
 * Downsample an AudioBuffer into a normalized peaks array for waveform display.
 * Returns values in [0, 1] representing max amplitude per bucket.
 */
export function generatePeaks(
  buffer: AudioBuffer,
  bucketCount = 100
): number[] {
  const channelData = buffer.getChannelData(0);
  const samplesPerBucket = Math.max(
    1,
    Math.floor(channelData.length / bucketCount)
  );
  const peaks: number[] = [];

  for (let i = 0; i < bucketCount; i++) {
    let max = 0;
    const start = i * samplesPerBucket;
    const end = Math.min(start + samplesPerBucket, channelData.length);

    for (let s = start; s < end; s++) {
      const abs = Math.abs(channelData[s]);
      if (abs > max) max = abs;
    }

    peaks.push(Math.min(1, max));
  }

  return peaks;
}

/**
 * Decode a Blob (audio file) into an AudioBuffer using the given AudioContext.
 */
export async function blobToAudioBuffer(
  blob: Blob,
  ctx: BaseAudioContext
): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  return ctx.decodeAudioData(arrayBuffer);
}

/**
 * Encode an AudioBuffer to WAV format (PCM 16-bit).
 * Returns a Blob containing the WAV file.
 */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const numFrames = buffer.length;
  const dataSize = numFrames * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Interleave channel data and write PCM samples
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  let offset = headerSize;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += bytesPerSample;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
