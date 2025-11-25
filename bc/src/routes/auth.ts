import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../prisma';
import { env } from '../env';
import { requireAuth } from '../middleware/auth';
import type { AuthenticatedRequest } from '../types';
import { upload, persistFile } from '../utils/fileStorage';
import type { User } from '@prisma/client';

const router = Router();
const googleClient = new OAuth2Client(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET
);

const loginSchema = z.object({
  token: z.string().min(1),
});

router.post('/google-login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const tokenInfo = await googleClient.getTokenInfo(parsed.data.token);
    if (!tokenInfo.email || !tokenInfo.sub) {
      return res.status(400).json({ error: 'Unable to read Google profile' });
    }

    const allowedException = 'jayahari273@gmail.com';
    const allowedDomains = [
      '@goa.bits-pilani.ac.in',
      // '@pilani.bits-pilani.ac.in',
      '@pilani.ac.in',
      '@hyderabad.bits-pilani.ac.in',
      '@dubai.bits-pilani.ac.in',
    ];
    const emailLower = tokenInfo.email.toLowerCase();
    const isAllowed =
      emailLower === allowedException ||
      allowedDomains.some((domain) => emailLower.endsWith(domain));

    if (!isAllowed) {
      return res.status(403).json({
        error: 'Email domain not allowed. Please use your BITS Pilani account.',
      });
    }

    const profileResponse = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      {
        headers: { Authorization: `Bearer ${parsed.data.token}` },
      }
    );

    if (!profileResponse.ok) {
      return res.status(400).json({ error: 'Failed to fetch Google profile' });
    }

    const profile = (await profileResponse.json()) as {
      picture?: string;
      name?: string;
    };

    const baseUsername = tokenInfo.email?.split('@')[0] ?? tokenInfo.sub;
    const normalizedUsername = baseUsername
      ?.toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 15);
    const username =
      normalizedUsername && normalizedUsername.length > 0
        ? normalizedUsername
        : `user_${tokenInfo.sub}`;

    const profilePictureUrl =
      profile.picture ??
      `https://api.dicebear.com/8.x/thumbs/svg?seed=${encodeURIComponent(
        tokenInfo.sub
      )}`;

    const user = await prisma.user.upsert({
      where: { googleId: tokenInfo.sub },
      update: {
        email: tokenInfo.email,
        displayName: profile.name ?? tokenInfo.email,
        ...(profile.picture ? { profilePictureUrl } : {}),
        username,
      },
      create: {
        googleId: tokenInfo.sub,
        email: tokenInfo.email,
        displayName: profile.name ?? tokenInfo.email,
        profilePictureUrl,
        username,
      },
    });

    const jwtToken = jwt.sign({ sub: user.id }, env.JWT_SECRET, {
      expiresIn: '7d',
    });

    return res.json({ token: jwtToken, user });
  } catch (error) {
    console.error('Google login failed', error);
    return res
      .status(500)
      .json({ error: 'Unable to authenticate with Google' });
  }
});

router.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.json(user);
});

const onboardingSchema = z.object({
  username: z.string().min(3).max(30),
  campus: z.enum(['PILANI', 'GOA', 'HYDERABAD', 'DUBAI']),
});

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100),
  username: z.string().min(3).max(30),
  bio: z.string().max(280).optional(),
});

router.post(
  '/onboard',
  requireAuth,
  upload.single('banner'),
  async (req: AuthenticatedRequest, res) => {
    const parsed = onboardingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const bannerFile = req.file;
    const bannerUpload = bannerFile
      ? await persistFile(bannerFile.buffer, bannerFile.mimetype)
      : undefined;
    const bannerImageUrl = bannerUpload?.url;

    try {
      const updated = await prisma.user.update({
        where: { id: req.userId! },
        data: {
          username: parsed.data.username,
          campus: parsed.data.campus,
          ...(bannerImageUrl ? { bannerImageUrl } : {}),
        },
      });
      return res.json(updated);
    } catch (err: any) {
      if (err.code === 'P2002') {
        return res.status(409).json({ error: 'Username already exists' });
      }
      console.error('Onboarding failed', err);
      return res.status(500).json({ error: 'Unable to save profile' });
    }
  }
);

router.post(
  '/update-profile',
  requireAuth,
  upload.fields([
    { name: 'profilePicture', maxCount: 1 },
    { name: 'bannerImage', maxCount: 1 },
  ]),
  async (req: AuthenticatedRequest, res) => {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const profilePicFile = (req.files as any)?.profilePicture?.[0] as
      | Express.Multer.File
      | undefined;
    const bannerFile = (req.files as any)?.bannerImage?.[0] as
      | Express.Multer.File
      | undefined;

    const profileUpload = profilePicFile
      ? await persistFile(profilePicFile.buffer, profilePicFile.mimetype)
      : undefined;
    const bannerUpload = bannerFile
      ? await persistFile(bannerFile.buffer, bannerFile.mimetype)
      : undefined;

    const profilePictureUrl = profileUpload?.url;
    const bannerImageUrl = bannerUpload?.url;

    try {
      const updatedUser = await prisma.user.update({
        where: { id: req.userId! },
        data: {
          displayName: parsed.data.displayName,
          username: parsed.data.username,
          bio: parsed.data.bio ?? null,
          ...(profilePictureUrl ? { profilePictureUrl } : {}),
          ...(bannerImageUrl ? { bannerImageUrl } : {}),
        },
      });

      return res.json(updatedUser);
    } catch (err: any) {
      if (err.code === 'P2002') {
        return res.status(409).json({ error: 'Username already exists' });
      }
      console.error('Update profile failed', err);
      return res.status(500).json({ error: 'Unable to update profile' });
    }
  }
);

router.post(
  '/delete-account',
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const userId = req.userId!;
    try {
      await prisma.$transaction(async (tx) => {
        const polls = await tx.poll.findMany({
          where: { post: { authorId: userId } },
          select: { id: true },
        });
        const pollIds = polls.map((p) => p.id);

        if (pollIds.length) {
          await tx.pollVote.deleteMany({ where: { pollId: { in: pollIds } } });
          await tx.pollChoice.deleteMany({
            where: { pollId: { in: pollIds } },
          });
          await tx.poll.deleteMany({ where: { id: { in: pollIds } } });
        }

        const userPostIds = (
          await tx.post.findMany({
            where: { authorId: userId },
            select: { id: true },
          })
        ).map((p) => p.id);

        const allPostIds = [
          ...userPostIds,
          ...(
            await tx.post.findMany({
              where: { parent: { authorId: userId } },
              select: { id: true },
            })
          ).map((p) => p.id),
        ];

        if (allPostIds.length) {
          await tx.notification.deleteMany({
            where: { postId: { in: allPostIds } },
          });
          await tx.retweet.deleteMany({
            where: { postId: { in: allPostIds } },
          });
          await tx.like.deleteMany({ where: { postId: { in: allPostIds } } });
          await tx.bookmark.deleteMany({
            where: { postId: { in: allPostIds } },
          });
          await tx.postMedia.deleteMany({
            where: { postId: { in: allPostIds } },
          });
        }

        await tx.notification.deleteMany({
          where: { OR: [{ senderId: userId }, { receiverId: userId }] },
        });
        await tx.retweet.deleteMany({ where: { userId } });
        await tx.like.deleteMany({ where: { userId } });
        await tx.bookmark.deleteMany({ where: { userId } });
        await tx.pollVote.deleteMany({ where: { userId } });
        await tx.follow.deleteMany({
          where: { OR: [{ followerId: userId }, { followingId: userId }] },
        });
        await tx.post.deleteMany({ where: { authorId: userId } });
        await tx.user.delete({ where: { id: userId } });
      });

      return res.json({ success: true });
    } catch (err) {
      console.error('Delete account failed', err);
      return res.status(500).json({ error: 'Failed to delete account' });
    }
  }
);

export default router;
