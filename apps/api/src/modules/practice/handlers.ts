import type { RequestHandler } from "express";
import type { AttemptListQuerySchema, StartPracticeSchema, TurnSchema } from "@pitchperfect/shared";
import { userOf } from "../../middleware/auth.js";
import { getInput, type IdParamSchema } from "../../middleware/validate.js";
import { getQuota } from "./quota.js";
import {
  coachOf,
  deleteAttempt,
  endSession,
  getAttempt,
  listAttempts,
  startSession,
  type PracticeDeps,
} from "./service.js";
import { openSse } from "./sse.js";
import { prepareTurn, runTurn } from "./turns.js";

interface WithId {
  params: typeof IdParamSchema;
}

export function practiceHandlers(deps: PracticeDeps) {
  return {
    quota: (async (_req, res) => {
      res.json(await getQuota(deps.config, userOf(res).id, new Date()));
    }) satisfies RequestHandler,

    start: (async (_req, res) => {
      const { body } = getInput<{ body: typeof StartPracticeSchema }>(res);
      res.status(201).json(await startSession(deps, userOf(res).id, body));
    }) satisfies RequestHandler,

    get: (async (_req, res) => {
      const { params } = getInput<WithId>(res);
      res.json({ attempt: await getAttempt(userOf(res).id, params.id) });
    }) satisfies RequestHandler,

    /** Errors before the stream opens are JSON; after that they are an `error` event. */
    turn: (async (req, res) => {
      const { params, body } = getInput<WithId & { body: typeof TurnSchema }>(res);
      const coach = coachOf(deps);
      const prepared = await prepareTurn(userOf(res).id, params.id);
      const stream = openSse(res);
      try {
        if (prepared.kind === "ended") stream.send({ type: "ended", reason: prepared.reason });
        else await runTurn({ coach, log: req.log, stream }, prepared.lock, body.text);
      } finally {
        stream.close();
      }
    }) satisfies RequestHandler,

    end: (async (_req, res) => {
      const { params } = getInput<WithId>(res);
      res.json({ attempt: await endSession(deps, userOf(res).id, params.id) });
    }) satisfies RequestHandler,

    list: (async (_req, res) => {
      const { query } = getInput<{ query: typeof AttemptListQuerySchema }>(res);
      res.json(await listAttempts(userOf(res).id, query));
    }) satisfies RequestHandler,

    remove: (async (_req, res) => {
      const { params } = getInput<WithId>(res);
      await deleteAttempt(userOf(res).id, params.id);
      res.status(204).end();
    }) satisfies RequestHandler,
  };
}
