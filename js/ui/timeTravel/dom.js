/** The one DOM lookup helper the time-travel screen's modules share. */
export const $ = (selector, root = document) => root.querySelector(selector);
