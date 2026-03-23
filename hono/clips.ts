import { Hono } from "hono";
import { createClip, listClips, getClip, getClipAudioPath, getClipRawAudioPath } from "@/lib/api/clips";
import { createClipSchema, clipListParamsSchema } from "@/lib/schemas/clips";
import { readFile } from "fs/promises";

const clips = new Hono();

clips.get("/", async (c) => {
  const params = clipListParamsSchema.parse({
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
  });
  const result = await listClips(params.limit, params.offset);
  return c.json(result);
});

clips.get("/:id", async (c) => {
  const clip = await getClip(c.req.param("id"));
  if (!clip) return c.json({ error: "Clip not found" }, 404);
  return c.json(clip);
});

clips.get("/:id/audio", async (c) => {
  const audioPath = await getClipAudioPath(c.req.param("id"));
  if (!audioPath) return c.json({ error: "Clip not found" }, 404);

  const data = await readFile(audioPath);
  return new Response(data, {
    headers: {
      "Content-Length": String(data.byteLength),
      "Content-Type": "audio/wav",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});

clips.get("/:id/raw", async (c) => {
  const rawPath = await getClipRawAudioPath(c.req.param("id"));
  if (!rawPath) return c.json({ error: "Raw audio not available" }, 404);

  const data = await readFile(rawPath);
  return new Response(data, {
    headers: {
      "Content-Length": String(data.byteLength),
      "Content-Type": "audio/wav",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});

clips.post("/", async (c) => {
  const formData = await c.req.formData();
  const audioFile = formData.get("audio");
  const name = formData.get("name");
  const duration = formData.get("duration");
  const filterConfig = formData.get("filterConfig");

  if (!(audioFile instanceof File)) {
    return c.json({ error: "Audio file is required" }, 400);
  }

  const parsed = createClipSchema.parse({
    name: name?.toString(),
    duration: duration?.toString(),
    filterConfig: filterConfig?.toString(),
  });

  const rawFile = formData.get("raw");
  const clip = await createClip(
    audioFile,
    parsed,
    rawFile instanceof File ? rawFile : undefined
  );
  return c.json(clip, 201);
});

export default clips;
