import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types";
import { postInclude, toPostDto } from "../utils/transformers";
import { createNotification } from "../utils/notifications";
import { NotificationType } from "@prisma/client";

const router = Router();

const retweetSchema = z.object({
  referenceId: z.number().int().positive(),
});

router.post(
  "/create",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const parsed = retweetSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const userId = req.userId!;
    const { referenceId } = parsed.data;

    const post = await prisma.post.findUnique({
      where: { id: referenceId },
      include: postInclude,
    });

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    try {
      await prisma.retweet.create({
        data: { userId, postId: referenceId },
      });
    } catch {
      // already retweeted
    }

    await createNotification({
      type: NotificationType.REPOST,
      senderId: userId,
      receiverId: post.authorId,
      referenceId: post.id,
      message: post.text.slice(0, 140),
    });

    const updatedPost = await prisma.post.findUnique({
      where: { id: referenceId },
      include: postInclude,
    });

    return res.json(updatedPost ? toPostDto(updatedPost) : null);
  }
);

router.post(
  "/delete",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const parsed = retweetSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const userId = req.userId!;
    const { referenceId } = parsed.data;

    await prisma.retweet.deleteMany({
      where: { userId, postId: referenceId },
    });

    const post = await prisma.post.findUnique({
      where: { id: referenceId },
      include: postInclude,
    });

    return res.json(post ? toPostDto(post) : null);
  }
);

export default router;
