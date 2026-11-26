/** In-memory stand-in for the cloud save service: same contract as the real transport (see js/cloud/cloudSync.js). */
export function createFakeCloud() {
  const rows = new Map();
  const cloud = {
    rows,
    /** "before": the request never reaches the server; "after": it is applied but the response is lost. */
    failNext: null,
    async get({ slot }) {
      const r = rows.get(slot);
      return r ? { revision: r.revision, schemaVersion: r.schemaVersion, data: r.data } : null;
    },
    async put({ slot, expectedRevision, schemaVersion, data, idempotencyKey }) {
      const fail = cloud.failNext;
      cloud.failNext = null;
      if (fail === "before") throw new Error("network down");
      const r = rows.get(slot) || { revision: 0, lastKey: null };
      let result;
      if (r.lastKey === idempotencyKey) result = { revision: r.revision };
      else if (expectedRevision !== r.revision) result = { conflict: true, revision: r.revision };
      else {
        rows.set(slot, { revision: r.revision + 1, schemaVersion, data, lastKey: idempotencyKey });
        result = { revision: r.revision + 1 };
      }
      if (fail === "after") throw new Error("response lost");
      return result;
    },
  };
  return cloud;
}
