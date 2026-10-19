import { model, Schema } from "mongoose";
import { schemaOptions } from "../schema-options.js";

export interface UsageDayAttrs {
  /** UTC calendar day, `YYYY-MM-DD`. */
  day: string;
  inputTokens: number;
  outputTokens: number;
  sessions: number;
}

const counter = { type: Number, default: 0, min: 0 } as const;

const usageDaySchema = new Schema<UsageDayAttrs>(
  {
    day: { type: String, required: true, unique: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    inputTokens: counter,
    outputTokens: counter,
    sessions: counter,
  },
  schemaOptions(),
);

export const UsageDay = model<UsageDayAttrs>("UsageDay", usageDaySchema);
