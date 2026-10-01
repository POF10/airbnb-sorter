// In-memory stand-ins for the app's storage contract: { get(key, fallback), set(key, value) }.
export function memoryStorage() {
  const data = new Map();
  return {
    get: (key, fallback) => (data.has(key) ? structuredClone(data.get(key)) : fallback),
    set: (key, value) => { data.set(key, structuredClone(value)); },
  };
}

// The same, but every call answers with a promise, like chrome.storage.local.
export function asyncStorage() {
  const sync = memoryStorage();
  return {
    get: async (key, fallback) => sync.get(key, fallback),
    set: async (key, value) => sync.set(key, value),
  };
}

// Fail on every call: by throwing (sync) or by rejecting (async).
export const brokenStorage = {
  get: () => { throw new Error('boom'); },
  set: () => { throw new Error('quota'); },
};
export const rejectingStorage = {
  get: async () => { throw new Error('boom'); },
  set: async () => { throw new Error('quota'); },
};

// Runs fn with console.warn captured instead of printed; resolves to the captured calls (one argument array each).
export async function captureWarnings(fn) {
  const warn = console.warn;
  const calls = [];
  console.warn = (...args) => { calls.push(args); };
  try {
    await fn();
  } finally {
    console.warn = warn;
  }
  return calls;
}
