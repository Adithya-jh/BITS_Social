import { Prisma } from "@prisma/client";
import { deriveTopics } from "./topicExtractor";

export const postInclude = Prisma.validator<Prisma.PostInclude>()({
  likes: { select: { userId: true } },
  bookmarks: { select: { userId: true } },
  replies: { select: { id: true } },
  retweets: { select: { userId: true } },
  media: true,
  poll: { select: { id: true, expiresAt: true } },
});

export type PostWithRelations = Prisma.PostGetPayload<{ include: typeof postInclude }>;

export function toPostDto(post: PostWithRelations) {
  return {
    id: post.id,
    userId: post.authorId,
    text: post.text,
    createdAt: post.createdAt.toISOString(),
    likedBy: post.likes.map((l) => l.userId),
    bookmarkedBy: post.bookmarks.map((b) => b.userId),
    parentId: post.parentId ?? undefined,
    replies: post.replies.map((r) => r.id),
    retweetedBy: post.retweets.map((r) => r.userId),
    postMedia: post.media.map((media) => ({
      id: media.id,
      postId: media.postId,
      fileName: media.fileName,
      mimeType: media.mimeType,
      url: media.url,
      createdAt: media.createdAt.toISOString(),
    })),
    pollId: post.poll?.id,
    pollExpiryTimeStamp: post.poll ? post.poll.expiresAt.toISOString() : "",
    topics: deriveTopics(post.text),
  };
}

export const userInclude = Prisma.validator<Prisma.UserInclude>()({
  posts: { select: { id: true, parentId: true } },
  likes: { select: { postId: true } },
  bookmarks: { select: { postId: true } },
  followers: { select: { followerId: true } },
  following: { select: { followingId: true } },
  retweets: { select: { postId: true } },
});

export type UserWithRelations = Prisma.UserGetPayload<{ include: typeof userInclude }>;

export function toUserDto(user: UserWithRelations) {
  const username =
    user.username ??
    user.email?.split("@")[0] ??
    `user-${user.id.toString(36).padStart(4, "0")}`;

  const posts = user.posts ?? [];
  const replies = posts.filter((p) => p.parentId != null).map((p) => p.id);
  const mainPosts = posts.filter((p) => p.parentId == null).map((p) => p.id);

  return {
    id: user.id,
    username,
    email: user.email ?? "",
    displayName: user.displayName,
    bio: user.bio ?? "",
    createdAt: user.createdAt.toISOString(),
    posts: mainPosts,
    replies,
    likedPosts: user.likes.map((l) => l.postId),
    bookmarkedPosts: user.bookmarks.map((b) => b.postId),
    followers: user.followers.map((f) => f.followerId),
    following: user.following.map((f) => f.followingId),
    retweets: user.retweets.map((r) => r.postId),
    profilePictureUrl: user.profilePictureUrl,
    bannerImageUrl: user.bannerImageUrl ?? "",
    pinnedPostId: user.pinnedPostId ?? null,
    verified: user.verified,
    campus: user.campus ?? null,
  };
}

export type NotificationEntity = Prisma.NotificationGetPayload<Record<string, never>>;

export function toNotificationDto(notification: NotificationEntity) {
  return {
    id: notification.id,
    senderId: notification.senderId,
    receiverId: notification.receiverId,
    referenceId: notification.referenceId ?? 0,
    text: notification.message ?? "",
    type: notification.type.toLowerCase(),
    createdAt: notification.createdAt.toISOString(),
    seen: notification.seen,
  };
}
