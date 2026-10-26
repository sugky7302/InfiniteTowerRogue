import { logger } from "@shared/logger";

export const config: { onUnhandledError: (this: void, error: unknown) => void; checkSignalSync: boolean } = {
  onUnhandledError: error => logger.error(error),
  checkSignalSync: true,
};

export function reportUnhandledError(error: unknown): void {
  try {
    config.onUnhandledError(error);
  } catch (handlerError) {
    logger.error(handlerError);
  }
}
