import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types";
import { postInclude, toPostDto } from "../utils/transformers";
import { createNotification } from "../utils/notifications";
import { NotificationType } from "@prisma/client";

const router = Router();

const likeSchema = z.object({
  likedPostId: z.number().int().positive(),
});

router.post("/create", requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = likeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const userId = req.userId!;
  const { likedPostId } = parsed.data;

  const post = await prisma.post.findUnique({
    where: { id: likedPostId },
    include: postInclude,
  });

  if (!post) {
    return res.status(404).json({ error: "Post not found" });
  }

  try {
    await prisma.like.create({
      data: { userId, postId: likedPostId },
    });
  } catch (error) {
    // already liked
  }

  await createNotification({
    type: NotificationType.LIKE,
    senderId: userId,
    receiverId: post.authorId,
    referenceId: post.id,
    message: post.text.slice(0, 140),
  });

  const updatedPost = await prisma.post.findUnique({
    where: { id: likedPostId },
    include: postInclude,
  });

  return res.json(updatedPost ? toPostDto(updatedPost) : null);
});

router.post("/delete", requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = likeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const userId = req.userId!;
  const { likedPostId } = parsed.data;

  await prisma.like.deleteMany({
    where: { userId, postId: likedPostId },
  });

  const updatedPost = await prisma.post.findUnique({
    where: { id: likedPostId },
    include: postInclude,
  });

  return res.json(updatedPost ? toPostDto(updatedPost) : null);
});

export default router;
