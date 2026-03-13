import winston from "winston";

const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const LOG_FORMAT = process.env.LOG_FORMAT || "json";

const formats =
  LOG_FORMAT === "json"
    ? winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      )
    : winston.format.combine(
        winston.format.timestamp(),
        winston.format.colorize(),
        winston.format.simple()
      );

export const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: formats,
  defaultMeta: { service: "sss-backend" },
  transports: [new winston.transports.Console()],
});
