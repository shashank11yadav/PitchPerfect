import { model, Schema, type Types } from "mongoose";
import {
  ATTEMPT_STATUSES,
  LLM_PROVIDERS,
  ScorecardSchema,
  SKILL_SLUGS,
  STAGES,
  TRANSCRIPT_ROLES,
  type AttemptStatus,
  type LlmProvider,
  type Scorecard,
  type ScenarioPrivate,
  type ScenarioPublic,
  type SkillSlug,
  type Stage,
  type TranscriptRole,
} from "@pitchperfect/shared";
import { schemaOptions } from "../schema-options.js";

interface StoredTranscriptEntry {
  role: TranscriptRole;
  text: string;
  at: Date;
  flagged: boolean;
}

export interface PracticeAttemptAttrs {
  studentId: Types.ObjectId;
  skill: SkillSlug;
  jobId?: Types.ObjectId;
  status: AttemptStatus;
  scenarioPublic: ScenarioPublic;
  scenarioPrivate: ScenarioPrivate;
  transcript: StoredTranscriptEntry[];
  guardFlags: number;
  /** Conversation stage reached so far; it only ever moves forward. */
  stage: Stage;
  scorecard: Scorecard | null;
  provider: LlmProvider;
  model: string;
  tokens: { input: number; output: number };
  startedAt: Date;
  endedAt?: Date;
  expiresAt: Date;
  /** In-flight turn lock: a turn may start only when this is null or in the past. */
  turnLockUntil: Date | null;
}

const required = { type: String, required: true } as const;

const scenarioPublicSchema = new Schema<ScenarioPublic>(
  {
    personaName: required,
    personaTitle: required,
    companyType: required,
    personality: required,
    openingLine: required,
  },
  { _id: false },
);

const scenarioPrivateSchema = new Schema<ScenarioPrivate>(
  {
    hiddenObjections: { type: [String], default: [] },
    winConditions: { type: [String], default: [] },
  },
  { _id: false },
);

const transcriptEntrySchema = new Schema<StoredTranscriptEntry>(
  {
    role: { type: String, enum: TRANSCRIPT_ROLES, required: true },
    text: required,
    at: { type: Date, default: Date.now },
    flagged: { type: Boolean, default: false },
  },
  { _id: false },
);

const practiceAttemptSchema = new Schema<PracticeAttemptAttrs>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    skill: { type: String, enum: SKILL_SLUGS, required: true },
    jobId: { type: Schema.Types.ObjectId, ref: "Job" },
    status: { type: String, enum: ATTEMPT_STATUSES, default: "active" },
    scenarioPublic: { type: scenarioPublicSchema, required: true },
    // Excluded from queries unless asked for with `.select("+scenarioPrivate")`.
    scenarioPrivate: { type: scenarioPrivateSchema, required: true, select: false },
    transcript: { type: [transcriptEntrySchema], default: [] },
    guardFlags: { type: Number, default: 0, min: 0 },
    stage: { type: String, enum: STAGES, default: "opening" },
    // Stored as given; the shared Scorecard schema is the single definition of its shape.
    scorecard: {
      type: Schema.Types.Mixed,
      default: null,
      validate: {
        validator: (value: unknown) => value === null || ScorecardSchema.safeParse(value).success,
        message: "Scorecard is malformed",
      },
    },
    provider: { type: String, enum: LLM_PROVIDERS, required: true },
    model: required,
    tokens: {
      input: { type: Number, default: 0, min: 0 },
      output: { type: Number, default: 0, min: 0 },
    },
    startedAt: { type: Date, default: Date.now },
    endedAt: Date,
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    turnLockUntil: { type: Date, default: null },
  },
  schemaOptions(["scenarioPrivate"]),
);

practiceAttemptSchema.index({ studentId: 1, startedAt: -1 });

export const PracticeAttempt = model<PracticeAttemptAttrs>(
  "PracticeAttempt",
  practiceAttemptSchema,
);
