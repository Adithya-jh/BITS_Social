import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types";
import { toNotificationDto } from "../utils/transformers";

const router = Router();

router.get(
  "/get-unseen",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const userId = req.userId!;

    const unseen = await prisma.notification.findMany({
      where: { receiverId: userId, seen: false },
      select: { id: true },
    });

    await prisma.notification.updateMany({
      where: { receiverId: userId, seen: false },
      data: { seen: true },
    });

    return res.json(unseen.map((n) => n.id));
  }
);

const idsSchema = z.array(z.number().int().positive()).min(1);

router.post(
  "/get-notifications",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const parsed = idsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid ids payload" });
    }

    const notifications = await prisma.notification.findMany({
      where: {
        id: { in: parsed.data },
        receiverId: req.userId!,
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json(notifications.map(toNotificationDto));
  }
);

export default router;
