import { Router } from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types";
import { upload, persistFile, deleteStoredFile } from "../utils/fileStorage";
import { postInclude, toPostDto } from "../utils/transformers";
import { publishEvent } from "../events/publisher";
import { createRateLimiter } from "../middleware/rateLimit";
import { env } from "../env";

const router = Router();

const idsSchema = z.array(z.number().int().positive()).min(1);
const idSchema = z.number().int().positive();

const postCreateLimiter = createRateLimiter({
  keyPrefix: "rl:post-create",
  windowMs: env.RATE_LIMIT_WRITE_WINDOW_MS,
  maxRequests: env.RATE_LIMIT_WRITE_MAX_REQUESTS,
  getIdentifier: (req) =>
    req.userId != null ? `user:${req.userId}` : req.ip ?? "anonymous",
});

router.post("/get-posts", async (req, res) => {
  const parsed = idsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid post ids payload" });
  }

  const posts = await prisma.post.findMany({
    where: { id: { in: parsed.data } },
    include: postInclude,
  });

  const dto = posts.map(toPostDto);
  return res.json(dto);
});

router.get("/get-post/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid post id" });
  }

  const post = await prisma.post.findUnique({
    where: { id },
    include: postInclude,
  });

  if (!post) {
    return res.status(404).json({ error: "Post not found" });
  }

  return res.json(toPostDto(post));
});

router.get("/hydrate/:id", async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid post id" });
  }

  const viewerId = resolveViewerId(req);

  const pollInclude =
    viewerId != null
      ? {
          include: {
            choices: {
              select: {
                id: true,
                choice: true,
                _count: { select: { votes: true } },
              },
            },
            votes: {
              where: { userId: viewerId },
              select: { choiceId: true },
            },
          },
        }
      : {
          include: {
            choices: {
              select: {
                id: true,
                choice: true,
                _count: { select: { votes: true } },
              },
            },
          },
        };

  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      likes: { select: { userId: true } },
      bookmarks: { select: { userId: true } },
      replies: { select: { id: true } },
      retweets: { select: { userId: true } },
      media: true,
      poll: pollInclude,
      author: {
        select: {
          id: true,
          displayName: true,
          username: true,
          profilePictureUrl: true,
        },
      },
      _count: {
        select: {
          likes: true,
          bookmarks: true,
          retweets: true,
          replies: true,
        },
      },
    },
  });

  if (!post) {
    return res.status(404).json({ error: "Post not found" });
  }

  let viewerFollowsAuthor = false;
  if (viewerId && viewerId !== post.author.id) {
    const follow = await prisma.follow.findFirst({
      where: { followerId: viewerId, followingId: post.author.id },
      select: { id: true },
    });
    viewerFollowsAuthor = !!follow;
  }

  const viewerState = {
    viewerId: viewerId ?? null,
    liked: viewerId ? post.likes.some((like) => like.userId === viewerId) : false,
    bookmarked: viewerId
      ? post.bookmarks.some((bookmark) => bookmark.userId === viewerId)
      : false,
    retweeted: viewerId
      ? post.retweets.some((retweet) => retweet.userId === viewerId)
      : false,
    followingAuthor: viewerFollowsAuthor,
    pollChoiceId:
      viewerId && post.poll && "votes" in post.poll
        ? ((post.poll as typeof post.poll & { votes: Array<{ choiceId: number }> })?.votes?.[0]?.choiceId ??
          null)
        : null,
  };

  const poll =
    post.poll != null
      ? {
          id: post.poll.id,
          expiresAt: post.poll.expiresAt,
          choices: post.poll.choices.map((choice) => ({
            id: choice.id,
            label: choice.choice,
            votes: choice._count.votes,
          })),
          totalVotes: post.poll.choices.reduce(
            (sum, choice) => sum + choice._count.votes,
            0
          ),
        }
      : null;

  return res.json({
    id: post.id,
    text: post.text,
    createdAt: post.createdAt,
    parentId: post.parentId,
    media: post.media.map((media) => ({
      id: media.id,
      url: media.url,
      mimeType: media.mimeType,
    })),
    author: post.author,
    counts: post._count,
    viewerState,
    poll,
  });
});

router.post(
  "/create",
  requireAuth,
  postCreateLimiter,
  upload.array("images", 4),
  async (req: AuthenticatedRequest, res) => {
    const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
    const parentId =
      req.body.parentId !== undefined && req.body.parentId !== null
        ? Number(req.body.parentId)
        : null;

    const files = (req.files as Express.Multer.File[]) ?? [];
    const pollChoicesRaw = req.body.pollChoices;
    const pollExpiryRaw = req.body.pollExpiry;

    const pollChoices = Array.isArray(pollChoicesRaw)
      ? pollChoicesRaw.filter((choice) => typeof choice === "string" && choice.trim().length > 0).map((c) => c.trim())
      : typeof pollChoicesRaw === "string" && pollChoicesRaw.trim().length > 0
        ? [pollChoicesRaw.trim()]
        : [];

    const pollExpiryParts = Array.isArray(pollExpiryRaw)
      ? pollExpiryRaw.map((value) => Number(value))
      : typeof pollExpiryRaw === "string"
        ? [Number(pollExpiryRaw)]
        : [];

    const hasContent =
      text.length > 0 ||
      files.length > 0 ||
      (pollChoices.length >= 2 && pollExpiryParts.some((part) => part > 0));

    if (!hasContent) {
      return res.status(400).json({ error: "Post requires text, media, or poll" });
    }

    if (parentId !== null && Number.isNaN(parentId)) {
      return res.status(400).json({ error: "Invalid parent id" });
    }

    try {
      const shouldCreatePoll =
        pollChoices.length >= 2 && pollExpiryParts.some((part) => part > 0);

      const mediaUploads =
        files.length > 0
          ? await Promise.all(
              files.map(async (file) => {
                const stored = await persistFile(file.buffer, file.mimetype);
                return {
                  mimeType: file.mimetype,
                  url: stored.url,
                  key: stored.key,
                };
              })
            )
          : [];

      const createdPost = await prisma.post.create({
        data: {
          text,
          parentId,
          authorId: req.userId!,
          ...(mediaUploads.length > 0
            ? {
                media: {
                  create: mediaUploads.map((media) => ({
                    fileName: media.key,
                    mimeType: media.mimeType,
                    url: media.url,
                  })),
                },
              }
            : {}),
          ...(shouldCreatePoll
            ? {
                poll: {
                  create: {
                    expiresAt: computeExpiryDate(pollExpiryParts),
                    choices: {
                      create: pollChoices.map((choice) => ({ choice })),
                    },
                  },
                },
              }
            : {}),
        },
      });

      const fullPost = await prisma.post.findUnique({
        where: { id: createdPost.id },
        include: postInclude,
      });

      if (!fullPost) {
        return res.status(500).json({ error: "Failed to load post" });
      }

      await publishEvent("posts.created", {
        id: fullPost.id,
        authorId: fullPost.authorId,
        parentId: fullPost.parentId,
        createdAtMs: fullPost.createdAt.getTime(),
      });

      return res.status(201).json({ id: fullPost.id });
    } catch (error) {
      console.error("Failed to create post", error);
      return res.status(500).json({ error: "Failed to create post" });
    }
  }
);

router.post("/delete", requireAuth, async (req: AuthenticatedRequest, res) => {
  // Allow either raw ID or { postId }
  const extractId = (): number | undefined => {
    if (typeof req.body === "number") return req.body;
    if (typeof req.body === "string") {
      const parsed = Number.parseInt(req.body, 10);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    if (req.body && typeof req.body.postId === "number") return req.body.postId;
    if (req.body && typeof req.body.postId === "string") {
      const parsed = Number.parseInt(req.body.postId, 10);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  };

  const bodyId = extractId();

  const parsed = idSchema.safeParse(bodyId);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid post id" });
  }

  const postId = parsed.data;

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { authorId: true, parentId: true },
  });

  if (!post) return res.status(404).json({ error: "Post not found" });
  if (post.authorId !== req.userId) {
    return res.status(403).json({ error: "Not allowed to delete this post" });
  }

  try {
    // collect the target post and its direct replies
    const relatedPosts = await prisma.post.findMany({
      where: { OR: [{ id: postId }, { parentId: postId }] },
      select: { id: true },
    });
    const relatedIds = relatedPosts.map((p) => p.id);

    const mediaEntries = await prisma.postMedia.findMany({
      where: { postId: { in: relatedIds } },
      select: { fileName: true },
    });

    await prisma.$transaction(async (tx) => {
      // polls tied to these posts
      const polls = await tx.poll.findMany({
        where: { postId: { in: relatedIds } },
        select: { id: true },
      });
      const pollIds = polls.map((p) => p.id);

      if (pollIds.length) {
        await tx.pollVote.deleteMany({ where: { pollId: { in: pollIds } } });
        await tx.pollChoice.deleteMany({ where: { pollId: { in: pollIds } } });
        await tx.poll.deleteMany({ where: { id: { in: pollIds } } });
      }

      await tx.notification.deleteMany({ where: { postId: { in: relatedIds } } });
      await tx.retweet.deleteMany({ where: { postId: { in: relatedIds } } });
      await tx.like.deleteMany({ where: { postId: { in: relatedIds } } });
      await tx.bookmark.deleteMany({ where: { postId: { in: relatedIds } } });
      await tx.postMedia.deleteMany({ where: { postId: { in: relatedIds } } });

      // delete replies first, then parent
      await tx.post.deleteMany({
        where: { id: { in: relatedIds.filter((id) => id !== postId) } },
      });
      await tx.post.delete({ where: { id: postId } });
    });
    await Promise.all(mediaEntries.map((media) => deleteStoredFile(media.fileName)));

    await publishEvent("posts.deleted", {
      id: postId,
      authorId: post.authorId,
      parentId: post.parentId,
      deletedBy: req.userId,
      deletedAtMs: Date.now(),
    });

    return res.json({ success: true, id: postId });
  } catch (error) {
    console.error("Failed to delete post", error);
    return res.status(500).json({ error: "Failed to delete post" });
  }
});

function computeExpiryDate(pollExpiryParts: number[]) {
  const normalize = (value: number) => (Number.isFinite(value) ? value : 0);
  const [daysRaw = 0, hoursRaw = 0, minutesRaw = 0] = pollExpiryParts;
  const days = normalize(daysRaw);
  const hours = normalize(hoursRaw);
  const minutes = normalize(minutesRaw);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  expiresAt.setHours(expiresAt.getHours() + hours);
  expiresAt.setMinutes(expiresAt.getMinutes() + minutes);
  return expiresAt;
}

export default router;

function resolveViewerId(req: AuthenticatedRequest) {
  if (req.userId) return req.userId;
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return undefined;

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string | number };
    const sub =
      typeof payload.sub === "string"
        ? Number.parseInt(payload.sub, 10)
        : payload.sub;
    return Number.isFinite(sub) ? Number(sub) : undefined;
  } catch {
    return undefined;
  }
}
