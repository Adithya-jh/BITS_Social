import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { toUserDto, userInclude } from "../utils/transformers";

const router = Router();

const idsSchema = z.array(z.number().int().positive()).min(1);

router.post("/get-users", async (req, res) => {
  const parsed = idsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid user id payload" });
  }

  const users = await prisma.user.findMany({
    where: { id: { in: parsed.data } },
    include: userInclude,
  });

  return res.json(users.map(toUserDto));
});

router.get("/get-user", async (req, res) => {
  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid user id" });
  }

  const user = await prisma.user.findUnique({
    where: { id },
    include: userInclude,
  });

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  return res.json(toUserDto(user));
});

router.get("/get-top-five", async (_req, res) => {
  const users = await prisma.user.findMany({
    take: 5,
    orderBy: [
      { followers: { _count: "desc" } },
      { createdAt: "desc" },
    ],
    select: { id: true },
  });

  return res.json(users.map((u) => u.id));
});

const discoverSchema = z.object({
  cursor: z.coerce.number().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

router.get("/get-discover", async (req, res) => {
  const parsed = discoverSchema.safeParse({
    cursor: req.query.cursor,
    limit: req.query.limit,
  });

  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { cursor, limit } = parsed.data;
  const cursorDate = cursor ? new Date(cursor) : new Date(Date.now() + 60_000);

  const users = await prisma.user.findMany({
    where: { createdAt: { lte: cursorDate } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: userInclude,
  });

  const nextCursor =
    users.length === limit
      ? users[users.length - 1]?.createdAt.getTime() ?? null
      : null;

  return res.json({
    users: users.map((user) => user.id),
    nextCursor,
  });
});

router.get("/search", async (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!query) return res.json([]);

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { displayName: { contains: query, mode: "insensitive" } },
        { username: { contains: query, mode: "insensitive" } },
      ],
    },
    take: 10,
    select: { id: true },
  });

  return res.json(users.map((u) => u.id));
});

export default router;
