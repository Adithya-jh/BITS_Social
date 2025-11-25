import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types";
import { toUserDto, userInclude } from "../utils/transformers";
import { createNotification } from "../utils/notifications";
import { NotificationType } from "@prisma/client";

const router = Router();

const followSchema = z.object({
  followedId: z.number().int().positive(),
});

router.post("/follow", requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = followSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const followerId = req.userId!;
  const { followedId } = parsed.data;

  if (followerId === followedId) {
    return res.status(400).json({ error: "Cannot follow yourself" });
  }

  try {
    await prisma.follow.create({
      data: {
        followerId,
        followingId: followedId,
      },
    });
  } catch (error) {
    // ignore unique constraint (already following)
  }

  await createNotification({
    type: NotificationType.FOLLOW,
    senderId: followerId,
    receiverId: followedId,
    referenceId: followerId,
  });

  const updatedUser = await prisma.user.findUnique({
    where: { id: followedId },
    include: userInclude,
  });

  return res.json(updatedUser ? toUserDto(updatedUser) : null);
});

router.post(
  "/unfollow",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const parsed = followSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const followerId = req.userId!;
    const { followedId } = parsed.data;

    await prisma.follow.deleteMany({
      where: { followerId, followingId: followedId },
    });

    const updatedUser = await prisma.user.findUnique({
      where: { id: followedId },
      include: userInclude,
    });

    return res.json(updatedUser ? toUserDto(updatedUser) : null);
  }
);

export default router;
