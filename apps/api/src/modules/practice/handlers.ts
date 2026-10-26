import type { RequestHandler } from "express";
import {
  signalsSelfHarm,
  SUPPORT_LINE,
  type AttemptListQuerySchema,
  type StartPracticeSchema,
  type TurnSchema,
} from "@pitchperfect/shared";
import { userOf } from "../../middleware/auth.js";
import { getInput, type IdParamSchema } from "../../middleware/validate.js";
import { practicePartnerOf } from "../../services/coach-probe.js";
import { getQuota } from "./quota.js";
import {
  coachOf,
  deleteAttempt,
  endSession,
  getAttempt,
  listAttempts,
  ownAttemptId,
  type PracticeDeps,
} from "./service.js";
import { openSse, watchDisconnect } from "./sse.js";
import { startSession } from "./start.js";
import { releaseTurnLock } from "./turn-lock.js";
import { prepareTurn, runTurn } from "./turns.js";

interface WithId {
  params: typeof IdParamSchema;
}

export function practiceHandlers(deps: PracticeDeps) {
  return {
    quota: (async (_req, res) => {
      const [quota, coach] = await Promise.all([
        getQuota(deps.config, userOf(res).id, new Date()),
        deps.coachProbe(),
      ]);
      res.json({ ...quota, practicePartner: practicePartnerOf(coach) });
    }) satisfies RequestHandler,

    start: (async (_req, res) => {
      const { body } = getInput<{ body: typeof StartPracticeSchema }>(res);
      res.status(201).json(await startSession(deps, userOf(res).id, body));
    }) satisfies RequestHandler,

    get: (async (_req, res) => {
      const { params } = getInput<WithId>(res);
      res.json({ attempt: await getAttempt(userOf(res).id, params.id) });
    }) satisfies RequestHandler,

    /**
     * A turn that signals suicide or self-harm gets the support message here, before the turn
     * rate limit and before anything that could refuse the turn: the token cap, the turn limit,
     * an expired or ended session, a coach that is down. It is answered locally, so it calls no
     * coach, costs no tokens and stores nothing. Only the body check and the attempt's owner come
     * first. Any other turn goes on to `turn`.
     */
    support: (async (req, res, next) => {
      const { params, body } = getInput<WithId & { body: typeof TurnSchema }>(res);
      if (!signalsSelfHarm(body.text)) {
        next();
        return;
      }
      await ownAttemptId(userOf(res).id, params.id);
      const stream = openSse(res, watchDisconnect(res));
      stream.send({ type: "support", text: SUPPORT_LINE });
      stream.close();
      req.log.info({ attemptId: params.id, outcome: "support" }, "practice turn finished");
    }) satisfies RequestHandler,

    /** Errors before the stream opens are JSON; after that they are an `error` event. */
    turn: (async (req, res) => {
      const left = watchDisconnect(res);
      const { params, body } = getInput<WithId & { body: typeof TurnSchema }>(res);
      const coach = coachOf(deps);
      const prepared = await prepareTurn(deps.config, userOf(res).id, params.id);
      if (left.aborted) {
        // Gone before the turn started: the coach is never called and nothing is charged.
        if (prepared.kind === "ready") await releaseTurnLock(prepared.lock);
        req.log.info({ attemptId: params.id, outcome: "client_left" }, "practice turn finished");
        return;
      }
      const stream = openSse(res, left);
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
