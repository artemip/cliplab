import { nanoid } from "nanoid";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { db } from "@/lib/db";
import { clips } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { generatePeaksFromWav } from "@/lib/audio/waveform-server";
import type { CreateClipInput } from "@/lib/schemas/clips";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

export async function createClip(file: File, input: CreateClipInput) {
  await mkdir(UPLOADS_DIR, { recursive: true });

  const id = nanoid(8);
  const filename = `${id}.wav`;
  const filepath = path.join(UPLOADS_DIR, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filepath, buffer);

  const peaks = generatePeaksFromWav(buffer);

  const [clip] = await db
    .insert(clips)
    .values({
      id,
      name: input.name,
      duration: input.duration,
      filename,
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
