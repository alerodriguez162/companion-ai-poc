import cors from "cors";
import express from "express";
import { ZodError } from "zod";
import { config } from "./config.js";
import { isAppError } from "./errors.js";
import { log } from "./logger.js";
import { requestIdMiddleware } from "./request-id.js";
import { charactersRouter } from "./routes/characters.js";
import { conversationsRouter } from "./routes/conversations.js";
import { healthRouter } from "./routes/health.js";

export function createApp(): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(requestIdMiddleware);
  app.use(
    cors({
      origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(",").map((item) => item.trim()),
    }),
  );
  app.use(express.json({ limit: "32kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "api" });
  });

  app.use("/api", healthRouter);
  app.use("/api", charactersRouter);
  app.use("/api", conversationsRouter);

  app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof ZodError) {
      res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Invalid request",
        details: config.nodeEnv === "development" ? error.flatten() : undefined,
        requestId: req.requestId,
      });
      return;
    }
    if (isAppError(error)) {
      res.status(error.status).json({
        code: error.code,
        message: error.message,
        requestId: req.requestId,
      });
      return;
    }
    log("error", "unhandled error", { requestId: req.requestId });
    res.status(500).json({
      code: "INTERNAL_ERROR",
      message: "Unexpected server error",
      requestId: req.requestId,
    });
  });

  return app;
}
