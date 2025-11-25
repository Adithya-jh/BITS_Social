import { NotificationType } from "@prisma/client";
import { prisma } from "../prisma";

type NotifyParams = {
  type: NotificationType;
  senderId: number;
  receiverId: number;
  referenceId?: number;
  message?: string;
};

export async function createNotification({
  type,
  senderId,
  receiverId,
  referenceId,
  message,
}: NotifyParams) {
  if (senderId === receiverId) return null;

  return prisma.notification.create({
    data: {
      type,
      senderId,
      receiverId,
      referenceId: referenceId ?? null,
      message: message ?? "",
    },
  });
}
