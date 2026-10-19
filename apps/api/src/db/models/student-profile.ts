import { model, Schema, type Types } from "mongoose";
import {
  SKILL_SLUGS,
  US_STATE_CODES,
  type SkillSlug,
  type UsStateCode,
} from "@pitchperfect/shared";
import { schemaOptions } from "../schema-options.js";

export interface StudentProfileAttrs {
  userId: Types.ObjectId;
  school: string;
  major: string;
  gradYear: number;
  targetRole: string;
  industry: string;
  state: UsStateCode;
  resumeFileId?: Types.ObjectId;
  lessonsCompleted: SkillSlug[];
}

const text = { type: String, required: true, trim: true } as const;

const studentProfileSchema = new Schema<StudentProfileAttrs>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    school: text,
    major: text,
    gradYear: { type: Number, required: true },
    targetRole: text,
    industry: text,
    state: { type: String, enum: US_STATE_CODES, required: true },
    resumeFileId: Schema.Types.ObjectId,
    lessonsCompleted: { type: [{ type: String, enum: SKILL_SLUGS }], default: [] },
  },
  schemaOptions(),
);

export const StudentProfile = model<StudentProfileAttrs>("StudentProfile", studentProfileSchema);
