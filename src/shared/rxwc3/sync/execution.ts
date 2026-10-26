let localExecution = false;

export function isLocalExecution(): boolean { return localExecution; }

export function runLocal<T>(callback: (this: void) => T): T {
  const previous = localExecution;
  localExecution = true;
  try { return callback(); } finally { localExecution = previous; }
}
