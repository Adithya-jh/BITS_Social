import { createConsumer } from "../infrastructure/eventBus";
import { redis } from "../infrastructure/redisClient";
import { logger } from "../infrastructure/logger";
import { prisma, readReplica } from "../prisma";

const consumer = createConsumer("feed-fanout");

const FOR_YOU_KEY = "timeline:forYou";
const userTimelineKey = (id: number) => `timeline:user:${id}`;
const followingTimelineKey = (id: number) => `timeline:following:${id}`;
const MAX_ENTRIES = 2000;

const graphClient = readReplica ?? prisma;

export async function startPostFanoutConsumer() {
  await consumer.subscribe({ topic: "posts.created", fromBeginning: true });
  await consumer.subscribe({ topic: "posts.deleted", fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) return;
      const payload = JSON.parse(message.value.toString());

      switch (topic) {
        case "posts.created":
          await handlePostCreated(payload);
          break;
        case "posts.deleted":
          await handlePostDeleted(payload);
          break;
      }
    },
  });

  logger.info("Post fan-out consumer running");
}

async function handlePostCreated(payload: any) {
  const { id, authorId, parentId, createdAtMs } = payload;
  if (!id || !authorId) return;

  const score =
    typeof createdAtMs === "number" && Number.isFinite(createdAtMs)
      ? createdAtMs
      : Date.now();
  const idString = id.toString();

  const userKey = userTimelineKey(Number(authorId));

  const multi = redis.multi();
  multi.zadd(userKey, score, idString);
  if (!parentId) {
    multi.zadd(FOR_YOU_KEY, score, idString);
  }
  await multi.exec();

  await Promise.all([
    trimTimeline(userKey),
    parentId ? Promise.resolve() : trimTimeline(FOR_YOU_KEY),
  ]);

  if (!parentId) {
    await fanoutToFollowers(Number(authorId), idString, score);
  }
}

async function handlePostDeleted(payload: any) {
  const { id, authorId, parentId } = payload;
  if (!id) return;
  const idString = id.toString();

  const keys = [FOR_YOU_KEY];
  if (authorId) {
    keys.push(userTimelineKey(Number(authorId)));
  }

  const multi = redis.multi();
  keys.forEach((key) => multi.zrem(key, idString));
  await multi.exec();

  if (!parentId && authorId) {
    await removeFromFollowers(Number(authorId), idString);
  }
}

async function fanoutToFollowers(
  authorId: number,
  postId: string,
  score: number
) {
  try {
    const followers = await getFollowerIds(authorId);
    if (!followers.length) return;

    const pipeline = redis.pipeline();
    followers.forEach((followerId) =>
      pipeline.zadd(followingTimelineKey(followerId), score, postId)
    );
    await pipeline.exec();

    await Promise.all(
      followers.map((id) => trimTimeline(followingTimelineKey(id)))
    );
  } catch (err) {
    logger.error({ err, authorId }, "Failed to fan-out following timeline");
  }
}

async function removeFromFollowers(authorId: number, postId: string) {
  try {
    const followers = await getFollowerIds(authorId);
    if (!followers.length) return;

    const pipeline = redis.pipeline();
    followers.forEach((id) =>
      pipeline.zrem(followingTimelineKey(id), postId)
    );
    await pipeline.exec();
  } catch (err) {
    logger.error({ err, authorId }, "Failed to remove post from followers");
  }
}

async function getFollowerIds(userId: number) {
  const rows = await graphClient.follow.findMany({
    where: { followingId: userId },
    select: { followerId: true },
  });
  return rows.map((row) => row.followerId);
}

async function trimTimeline(key: string) {
  try {
    const count = await redis.zcard(key);
    const excess = count - MAX_ENTRIES;
    if (excess > 0) {
      await redis.zremrangebyrank(key, 0, excess - 1);
    }
  } catch (err) {
    logger.warn({ err, key }, "Failed to trim timeline key");
  }
}
