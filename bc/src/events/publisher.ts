import { createProducer } from "../infrastructure/eventBus";
import { logger } from "../infrastructure/logger";

const producer = createProducer();

type EventPayload = Record<string, unknown>;

export async function publishEvent(topic: string, payload: EventPayload) {
  try {
    await producer.send({
      topic,
      messages: [{ value: JSON.stringify(payload) }],
    });
  } catch (err) {
    logger.error({ err, topic }, "Failed to publish event");
  }
}
