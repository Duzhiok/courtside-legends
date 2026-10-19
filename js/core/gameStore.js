export function createGameStore(initialState) {
  validateState(initialState);

  let state = initialState;
  const listeners = new Set();

  function getState() {
    return state;
  }

  function replaceState(nextState, meta) {
    validateState(nextState);

    const previousState = state;
    state = nextState;
    for (const listener of listeners) {
      listener(state, previousState, meta);
    }
  }

  function update(updater, meta) {
    if (typeof updater !== "function") {
      throw new TypeError("updater must be a function");
    }

    const nextState = updater(state);
    if (nextState === state) {
      throw new Error("update must return a new root object");
    }
    replaceState(nextState, meta);
  }

  function subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("listener must be a function");
    }

    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { getState, replaceState, update, subscribe };
}

function validateState(state) {
  if (state === null || typeof state !== "object") {
    throw new TypeError("state must be a non-null object");
  }
}
