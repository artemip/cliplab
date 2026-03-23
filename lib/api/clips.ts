import { nanoid } from "nanoid";
import { writeFile, mkdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { db } from "@/lib/db";
import { clips } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { generatePeaksFromWav } from "@/lib/audio/waveform-server";
import type { CreateClipInput } from "@/lib/schemas/clips";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

export async function createClip(
  file: File,
  input: CreateClipInput,
  rawFile?: File
) {
  await mkdir(UPLOADS_DIR, { recursive: true });

  const id = nanoid(8);
  const filename = `${id}.wav`;
  const filepath = path.join(UPLOADS_DIR, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filepath, buffer);

  // Save raw (unfiltered) audio if provided — enables re-editing
  let rawFilename: string | null = null;
  if (rawFile) {
    rawFilename = `${id}_raw.wav`;
    const rawBuffer = Buffer.from(await rawFile.arrayBuffer());
    await writeFile(path.join(UPLOADS_DIR, rawFilename), rawBuffer);
  }

  const peaks = generatePeaksFromWav(buffer);

  const [clip] = await db
    .insert(clips)
    .values({
      id,
      name: input.name,
      duration: input.duration,
      filename,
      rawFilename,
      peaks,
      filterConfig: input.filterConfig ?? null,
      createdAt: new Date(),
    })
    .returning();

  return clip;
}

export async function listClips(limit: number, offset: number) {
  const result = await db
    .select()
    .from(clips)
    .orderBy(desc(clips.createdAt))
    .limit(limit)
    .offset(offset);

  return result;
}

export async function getClip(id: string) {
  const [clip] = await db.select().from(clips).where(eq(clips.id, id));
  return clip ?? null;
}

export async function getClipAudioPath(id: string) {
  const clip = await getClip(id);
  if (!clip) return null;

  const filepath = path.join(UPLOADS_DIR, clip.filename);
  return existsSync(filepath) ? filepath : null;
}

export async function updateClip(
  id: string,
  file: File,
  input: CreateClipInput,
  rawFile?: File
) {
  const existing = await getClip(id);
  if (!existing) return null;

  await mkdir(UPLOADS_DIR, { recursive: true });

  // Overwrite rendered audio
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOADS_DIR, existing.filename), buffer);

  // Overwrite or create raw audio
  let rawFilename = existing.rawFilename;
  if (rawFile) {
    rawFilename = rawFilename || `${id}_raw.wav`;
    const rawBuffer = Buffer.from(await rawFile.arrayBuffer());
    await writeFile(path.join(UPLOADS_DIR, rawFilename), rawBuffer);
  } else if (rawFilename) {
    // No raw file provided — remove stale raw audio
    await unlink(path.join(UPLOADS_DIR, rawFilename)).catch(() => {});
    rawFilename = null;
  }

  const peaks = generatePeaksFromWav(buffer);

  const [clip] = await db
    .update(clips)
    .set({
      name: input.name,
      duration: input.duration,
      rawFilename,
      peaks,
      filterConfig: input.filterConfig ?? null,
    })
    .where(eq(clips.id, id))
    .returning();

  return clip;
}

export async function getClipRawAudioPath(id: string) {
  const clip = await getClip(id);
  if (!clip?.rawFilename) return null;

  const filepath = path.join(UPLOADS_DIR, clip.rawFilename);
  return existsSync(filepath) ? filepath : null;
}
