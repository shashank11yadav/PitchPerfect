/** Start of the UTC day `offset` days from `now`'s. */
export const utcDay = (now: Date, offset = 0) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));

/** Start of the UTC calendar month `offset` months from `now`'s. */
export const utcMonth = (now: Date, offset = 0) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));

/** Whole seconds from `now` to `then`, at least one: a `Retry-After` is never zero. */
export const secondsUntil = (now: Date, then: Date) =>
  Math.max(1, Math.ceil((then.getTime() - now.getTime()) / 1000));
