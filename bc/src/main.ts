import express from "express";
import cors from "cors";
import path from "path";
import { env } from "./env";
import authRouter from "./routes/auth";
import postsRouter from "./routes/posts";
import feedRouter from "./routes/feed";
import usersRouter from "./routes/users";
import followsRouter from "./routes/follows";
import likesRouter from "./routes/likes";
import bookmarksRouter from "./routes/bookmarks";
import retweetsRouter from "./routes/retweets";
import notificationsRouter from "./routes/notifications";
import pollsRouter from "./routes/polls";
import { logger } from "./infrastructure/logger";
import { redis } from "./infrastructure/redisClient";
import "./events/publisher";
import { startPostFanoutConsumer } from "./consumers/postFanoutConsumer";
import { createRateLimiter } from "./middleware/rateLimit";

const app = express();

const globalRateLimiter = createRateLimiter({
  keyPrefix: "rl:global",
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
  skip: (req) => req.path.startsWith("/health"),
});

app.use(
  cors({
    origin: env.CLIENT_ORIGIN ?? true,
    credentials: true,
  })
);
app.use(express.json({ limit: "5mb" }));
app.use(globalRateLimiter);

const uploadsPath = path.resolve(__dirname, "..", "uploads");
app.use("/uploads", express.static(uploadsPath));

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.get("/health/ready", async (_req, res) => {
  const redisStatus = redis.status === "ready";
  res.json({
    status: redisStatus ? "ok" : "degraded",
  });
});

app.use("/api/auth", authRouter);
app.use("/api/posts", postsRouter);
app.use("/api/feed", feedRouter);
app.use("/api/users", usersRouter);
app.use("/api/follows", followsRouter);
app.use("/api/likes", likesRouter);
app.use("/api/bookmarks", bookmarksRouter);
app.use("/api/retweets", retweetsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/polls", pollsRouter);

app.use(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err }, "Unhandled error");
    res.status(500).json({ error: "Unexpected server error" });
  }
);

app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, kafkaBrokers: env.KAFKA_BROKERS },
    "API listening"
  );
});

startPostFanoutConsumer().catch((err) => {
  logger.error({ err }, "Failed to start post fanout consumer");
});
