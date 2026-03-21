import { Hono } from "hono";
import { cors } from "hono/cors";
import { ZodError } from "zod/v4";
import clipsRouter from "./clips";

const app = new Hono().basePath("/api");

app.use("*", cors());

app.onError((err, c) => {
  // Structured validation errors
  if (err instanceof ZodError) {
    return c.json(
      {
        error: "Validation failed",
        issues: err.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      400
    );
  }

  console.error(`[cliplab] ${err.message}`, err.stack);
  return c.json({ error: "Internal server error" }, 500);
});

app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.route("/clips", clipsRouter);

export default app;
