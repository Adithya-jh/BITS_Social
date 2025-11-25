import { Router } from "express";
import { z } from "zod";
import { fetchFeed } from "../modules/feed/feedService";
import { logger } from "../infrastructure/logger";

const router = Router();

const feedSchema = z.object({
  type: z.enum([
    "For You",
    "Following",
    "Liked",
    "Tweets",
    "Replies",
    "Media",
    "Saved",
    "Notifications",
  ]),
  cursor: z.coerce.number().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  userId: z.coerce.number().int().optional(),
});

router.get("/get-feed-page", async (req, res) => {
  const parsed = feedSchema.safeParse({
    type: req.query.type,
    cursor: req.query.cursor,
    limit: req.query.limit,
    userId: req.query.userId,
  });

  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { type, cursor, limit, userId } = parsed.data;
  const cursorMs =
    typeof cursor === "number" && cursor > 0 ? cursor : Date.now() + 60_000;
  const cursorDate = new Date(cursorMs);

  try {
    const page = await fetchFeed({
      type,
      cursorDate,
      limit,
      userId,
    });
    return res.json(page);
  } catch (error) {
    logger.error({ error, type, userId }, "Failed to build feed");
    return res.status(500).json({ error: "Failed to load feed" });
  }
});

export default router;
