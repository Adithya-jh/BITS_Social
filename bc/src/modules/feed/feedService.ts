import { readReplica, prisma } from '../../prisma';
import { redis } from '../../infrastructure/redisClient';
import { logger } from '../../infrastructure/logger';

export type FeedType =
  | 'For You'
  | 'Following'
  | 'Liked'
  | 'Posts'
  | 'Replies'
  | 'Media'
  | 'Saved'
  | 'Notifications';

type FeedPage = {
  posts: number[];
  nextCursor: number | null;
};

type FeedInput = {
  type: FeedType;
  cursorDate: Date;
  limit: number;
  userId?: number;
};

const cacheKey = (input: FeedInput) => {
  const cursor = input.cursorDate.getTime();
  return [
    'feed',
    input.type.replace(/\s+/g, '').toLowerCase(),
    input.userId ?? 'public',
    cursor,
    input.limit,
  ].join(':');
};

const ttlSeconds = 10;

const FOR_YOU_KEY = 'timeline:forYou';
const userTimelineKey = (id: number) => `timeline:user:${id}`;
const followingTimelineKey = (id: number) => `timeline:following:${id}`;

export async function fetchFeed(input: FeedInput): Promise<FeedPage> {
  const key = cacheKey(input);

  const cached = await redis.get(key);
  if (cached) {
    logger.debug({ key }, 'feed cache hit');
    return JSON.parse(cached);
  }

  const page = await buildFeed(input);

  await redis.set(key, JSON.stringify(page), 'EX', ttlSeconds).catch((err) => {
    logger.warn({ err }, 'Failed to write feed cache');
  });

  return page;
}

async function buildFeed(input: FeedInput): Promise<FeedPage> {
  const timelineKey = getTimelineKey(input.type, input.userId);
  if (timelineKey) {
    const timelinePage = await fetchTimelinePage(timelineKey, input);
    if (timelinePage && timelinePage.posts.length > 0) {
      if (timelinePage.posts.length >= input.limit) {
        return timelinePage;
      }

      const dbPage = await resolveFeed(input);
      if (dbPage.posts.length === 0) {
        return timelinePage;
      }

      return mergeTimelineWithDb(timelinePage, dbPage, input.limit);
    }
  }

  return resolveFeed(input);
}

function mergeTimelineWithDb(
  timelinePage: FeedPage,
  dbPage: FeedPage,
  limit: number
): FeedPage {
  const posts = [...timelinePage.posts];
  const seen = new Set(posts);

  for (const id of dbPage.posts) {
    if (!seen.has(id)) {
      posts.push(id);
    }
    if (posts.length === limit) {
      break;
    }
  }

  const usedDbPosts = posts.length > timelinePage.posts.length;
  const nextCursor =
    usedDbPosts && dbPage.nextCursor != null
      ? dbPage.nextCursor
      : timelinePage.nextCursor ?? dbPage.nextCursor ?? null;

  return { posts, nextCursor };
}

function getTimelineKey(type: FeedType, userId?: number) {
  if (type === 'For You') return FOR_YOU_KEY;
  if (type === 'Tweets' && userId) return userTimelineKey(userId);
  if (type === 'Following' && userId) return followingTimelineKey(userId);
  return null;
}

async function fetchTimelinePage(
  key: string,
  input: FeedInput
): Promise<FeedPage | null> {
  try {
    const cursorMs = input.cursorDate.getTime();
    const results = await redis.zrevrangebyscore(
      key,
      cursorMs,
      '-inf',
      'WITHSCORES',
      'LIMIT',
      0,
      input.limit
    );
    if (!results || results.length === 0) return null;

    const posts: number[] = [];
    let lastScore: number | null = null;

    for (let i = 0; i < results.length; i += 2) {
      const id = Number(results[i]);
      const score = Number(results[i + 1]);
      if (!Number.isFinite(id) || !Number.isFinite(score)) continue;
      posts.push(id);
      lastScore = score;
    }

    if (posts.length === 0) return null;
    const hasMore = posts.length === input.limit;
    return { posts, nextCursor: hasMore ? lastScore : null };
  } catch (err) {
    logger.warn({ err, key }, 'Failed to read timeline key');
    return null;
  }
}

async function resolveFeed(input: FeedInput): Promise<FeedPage> {
  const client = readReplica ?? prisma;
  const { type, cursorDate, limit, userId } = input;

  let ids: number[] = [];
  let lastTimestamp: number | null = null;

  switch (type) {
    case 'For You': {
      const posts = await client.post.findMany({
        where: { parentId: null, createdAt: { lte: cursorDate } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, createdAt: true },
      });
      ids = posts.map((p) => p.id);
      lastTimestamp = posts.at(-1)?.createdAt.getTime() ?? null;
      break;
    }
    case 'Following': {
      if (!userId) break;
      const following = await client.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
      });
      const followingIds = following.map((f) => f.followingId);
      if (followingIds.length === 0) break;
      const posts = await client.post.findMany({
        where: {
          authorId: { in: followingIds },
          parentId: null,
          createdAt: { lte: cursorDate },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, createdAt: true },
      });
      ids = posts.map((p) => p.id);
      lastTimestamp = posts.at(-1)?.createdAt.getTime() ?? null;
      break;
    }
    case 'Tweets': {
      if (!userId) break;
      const posts = await client.post.findMany({
        where: {
          authorId: userId,
          parentId: null,
          createdAt: { lte: cursorDate },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, createdAt: true },
      });
      ids = posts.map((p) => p.id);
      lastTimestamp = posts.at(-1)?.createdAt.getTime() ?? null;
      break;
    }
    case 'Replies': {
      if (!userId) break;
      const posts = await client.post.findMany({
        where: {
          authorId: userId,
          parentId: { not: null },
          createdAt: { lte: cursorDate },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, createdAt: true },
      });
      ids = posts.map((p) => p.id);
      lastTimestamp = posts.at(-1)?.createdAt.getTime() ?? null;
      break;
    }
    case 'Liked': {
      if (!userId) break;
      const posts = await client.post.findMany({
        where: {
          likes: { some: { userId } },
          createdAt: { lte: cursorDate },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, createdAt: true },
      });
      ids = posts.map((p) => p.id);
      lastTimestamp = posts.at(-1)?.createdAt.getTime() ?? null;
      break;
    }
    case 'Saved': {
      if (!userId) break;
      const posts = await client.post.findMany({
        where: {
          bookmarks: { some: { userId } },
          createdAt: { lte: cursorDate },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, createdAt: true },
      });
      ids = posts.map((p) => p.id);
      lastTimestamp = posts.at(-1)?.createdAt.getTime() ?? null;
      break;
    }
    case 'Media': {
      if (!userId) break;
      const posts = await client.post.findMany({
        where: {
          authorId: userId,
          media: { some: {} },
          createdAt: { lte: cursorDate },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, createdAt: true },
      });
      ids = posts.map((p) => p.id);
      lastTimestamp = posts.at(-1)?.createdAt.getTime() ?? null;
      break;
    }
    case 'Notifications': {
      if (!userId) break;
      const notifications = await client.notification.findMany({
        where: {
          receiverId: userId,
          createdAt: { lte: cursorDate },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, createdAt: true },
      });
      ids = notifications.map((n) => n.id);
      lastTimestamp = notifications.at(-1)?.createdAt.getTime() ?? null;
      break;
    }
  }

  const hasMore = ids.length === limit;
  return {
    posts: ids,
    nextCursor: hasMore ? lastTimestamp : null,
  };
}
