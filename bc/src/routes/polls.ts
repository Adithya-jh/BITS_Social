import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types";

const router = Router();

router.get("/:pollId/choices", async (req, res) => {
  const pollId = Number(req.params.pollId);
  if (!Number.isInteger(pollId) || pollId <= 0) {
    return res.status(400).json({ error: "Invalid poll id" });
  }

  const choices = await prisma.pollChoice.findMany({
    where: { pollId },
    select: {
      id: true,
      choice: true,
      pollId: true,
      _count: { select: { votes: true } },
    },
  });

  return res.json(
    choices.map((c) => ({
      id: c.id,
      choice: c.choice,
      pollId: c.pollId,
      voteCount: c._count.votes,
    }))
  );
});

router.get("/:pollId/getPollVote", requireAuth, async (req: AuthenticatedRequest, res) => {
  const pollId = Number(req.params.pollId);
  if (!Number.isInteger(pollId) || pollId <= 0) {
    return res.status(400).json({ error: "Invalid poll id" });
  }

  const vote = await prisma.pollVote.findFirst({
    where: { pollId, userId: req.userId! },
    select: { choiceId: true },
  });

  return res.json(vote ? vote.choiceId : -1);
});

const voteSchema = z.object({
  pollId: z.number().int().positive(),
  choiceId: z.number().int().positive(),
});

router.post("/submit-vote", requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = voteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid vote payload" });
  }

  const { pollId, choiceId } = parsed.data;

  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    include: { choices: { select: { id: true } } },
  });

  if (!poll) {
    return res.status(404).json({ error: "Poll not found" });
  }

  if (poll.expiresAt <= new Date()) {
    return res.status(400).json({ error: "Poll has expired" });
  }

  const validChoice = poll.choices.some((c) => c.id === choiceId);
  if (!validChoice) {
    return res.status(400).json({ error: "Invalid choice for poll" });
  }

  // prevent duplicate votes
  await prisma.pollVote.deleteMany({
    where: { pollId, userId: req.userId! },
  });

  await prisma.pollVote.create({
    data: { pollId, choiceId, userId: req.userId! },
  });

  const choices = await prisma.pollChoice.findMany({
    where: { pollId },
    select: {
      id: true,
      choice: true,
      pollId: true,
      _count: { select: { votes: true } },
    },
  });

  return res.json(
    choices.map((c) => ({
      id: c.id,
      choice: c.choice,
      pollId: c.pollId,
      voteCount: c._count.votes,
    }))
  );
});

export default router;
