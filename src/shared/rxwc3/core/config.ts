import { logger } from "@shared/logger";
import { protectedCall } from "./protected-call";

export const config: {
    onUnhandledError: (this: void, error: unknown) => void;
    checkSignalSync: boolean;
} = {
    onUnhandledError: (error) => logger.error(error),
    checkSignalSync: true,
};

export function reportUnhandledError(error: unknown): void {
    const [ok, handlerError] = protectedCall(config.onUnhandledError, error);
    if (!ok) {
        logger.error(handlerError);
    }
}
