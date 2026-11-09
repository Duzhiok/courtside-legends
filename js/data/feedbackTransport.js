/**
 * Where Player Voice submissions go. Nothing is registered today, so Submit stays disabled and honest. A real
 * adapter (the server endpoint planned in ADR-010; never client-held credentials) registers itself here:
 *   setFeedbackTransport(async ({ category, stars, note, lang, owner, attachments }) => true | false)
 * `attachments` are [{ id, name, type, size, width, height, blob }] already <= 2 MB each.
 */
let transport = null;
export const setFeedbackTransport = (fn) => { transport = typeof fn === "function" ? fn : null; };
export const getFeedbackTransport = () => transport;
