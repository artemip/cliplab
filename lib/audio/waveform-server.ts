/**
 * Server-side WAV peak generation.
 * Parses WAV PCM data and downsamples into normalized peaks for waveform display.
 */

const DEFAULT_PEAK_COUNT = 100;

function emptyPeaks(count: number): number[] {
  return new Array(count).fill(0);
}

export function generatePeaksFromWav(
  buffer: Buffer,
  bucketCount = DEFAULT_PEAK_COUNT
): number[] {
  if (buffer.length < 44) return emptyPeaks(bucketCount);

  const riff = buffer.toString("ascii", 0, 4);
  const format = buffer.toString("ascii", 8, 12);
  if (riff !== "RIFF" || format !== "WAVE") return emptyPeaks(bucketCount);

  // Walk chunks to find fmt + data
  let offset = 12;
  let channels = 1;
  let bitsPerSample = 16;
  let dataStart = 0;
  let dataSize = 0;

  while (offset < buffer.length - 8) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);

    if (chunkId === "fmt ") {
      channels = buffer.readUInt16LE(offset + 10);
      bitsPerSample = buffer.readUInt16LE(offset + 22);
    } else if (chunkId === "data") {
      dataStart = offset + 8;
      dataSize = chunkSize;
      break;
    }

    offset += 8 + chunkSize;
  }

  if (dataStart === 0 || dataSize === 0) return emptyPeaks(bucketCount);

  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = Math.floor(dataSize / (bytesPerSample * channels));
  if (totalSamples === 0) return emptyPeaks(bucketCount);

  const samplesPerBucket = Math.max(1, Math.floor(totalSamples / bucketCount));
  const maxValue = Math.pow(2, bitsPerSample - 1);
  const peaks: number[] = [];

  for (let i = 0; i < bucketCount; i++) {
    let max = 0;
    const bucketStart = i * samplesPerBucket;
    const bucketEnd = Math.min(bucketStart + samplesPerBucket, totalSamples);

    for (let s = bucketStart; s < bucketEnd; s++) {
      const byteOffset = dataStart + s * bytesPerSample * channels;
      if (byteOffset + bytesPerSample > buffer.length) break;

      let sample: number;
      if (bitsPerSample === 16) {
        sample = buffer.readInt16LE(byteOffset);
      } else if (bitsPerSample === 32) {
        sample = buffer.readInt32LE(byteOffset);
      } else {
        // 8-bit WAV is unsigned (0-255, center at 128)
        sample = buffer.readUInt8(byteOffset) - 128;
      }

      const abs = Math.abs(sample) / maxValue;
      if (abs > max) max = abs;
    }

    peaks.push(Math.min(1, max));
  }

  return peaks;
}
