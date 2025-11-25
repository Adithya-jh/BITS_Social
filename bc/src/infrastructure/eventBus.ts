import { Kafka, logLevel } from "kafkajs";
import { env } from "../env";
import { logger } from "./logger";

const brokers = env.KAFKA_BROKERS.split(",").map((broker) => broker.trim());

export const kafka = new Kafka({
  clientId: "bits-social-api",
  brokers,
  logLevel: logLevel.ERROR,
});

export const createProducer = () => {
  const producer = kafka.producer();
  const connect = producer.connect();

  connect
    .then(() => logger.info("Kafka producer ready"))
    .catch((err) => logger.error({ err }, "Kafka producer connection failed"));

  return producer;
};

export const createConsumer = (groupId: string) => {
  const consumer = kafka.consumer({ groupId });
  const connect = consumer.connect();

  connect
    .then(() => logger.info({ groupId }, "Kafka consumer ready"))
    .catch((err) =>
      logger.error({ err, groupId }, "Kafka consumer connection failed")
    );

  return consumer;
};
