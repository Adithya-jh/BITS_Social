import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types";
import { postInclude, toPostDto } from "../utils/transformers";

const router = Router();

const bookmarkSchema = z.object({
  bookmarkedPost: z.number().int().positive(),
});

router.post(
  "/create",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const parsed = bookmarkSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const userId = req.userId!;
    const { bookmarkedPost } = parsed.data;

    try {
      await prisma.bookmark.create({
        data: { userId, postId: bookmarkedPost },
      });
    } catch {
      // already bookmarked
    }

    const post = await prisma.post.findUnique({
      where: { id: bookmarkedPost },
      include: postInclude,
    });

    return res.json(post ? toPostDto(post) : null);
  }
);

router.post(
  "/delete",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const parsed = bookmarkSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const userId = req.userId!;
    const { bookmarkedPost } = parsed.data;

    await prisma.bookmark.deleteMany({
      where: { userId, postId: bookmarkedPost },
    });

    const post = await prisma.post.findUnique({
      where: { id: bookmarkedPost },
      include: postInclude,
    });

    return res.json(post ? toPostDto(post) : null);
  }
);

export default router;
