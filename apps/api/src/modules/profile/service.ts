import mongoose, { Types } from "mongoose";
import type {
  EmployerProfileUpdate,
  EmployerProfileView,
  PublicUser,
  ResumeInfo,
  StudentProfileUpdate,
  StudentProfileView,
} from "@pitchperfect/shared";
import { toEmployerProfileView, toPublicUser, toStudentProfileView } from "../../db/mappers.js";
import { EmployerProfile, StudentProfile, User } from "../../db/models/index.js";
import { NotFoundError, UnauthenticatedError } from "../../errors.js";
import { assertPdf, deleteResume, saveResume } from "../../services/files.js";
import { removeResumeCopies } from "../applications/resume-copies.js";

/** The user and role profile as the client should now show them. */
export interface ProfileResult<Profile> {
  user: PublicUser;
  profile: Profile;
}

type Names = Pick<StudentProfileUpdate, "firstName" | "lastName">;

/** Names live on the user, not the role profile; returns the user either way. */
async function applyNames(userId: string, { firstName, lastName }: Names): Promise<PublicUser> {
  const set = {
    ...(firstName !== undefined && { "name.first": firstName }),
    ...(lastName !== undefined && { "name.last": lastName }),
  };
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: set },
    { returnDocument: "after", runValidators: true },
  ).lean();
  if (!user) throw new UnauthenticatedError();
  return toPublicUser(user);
}

export async function updateStudentProfile(
  userId: string,
  { firstName, lastName, ...fields }: StudentProfileUpdate,
): Promise<ProfileResult<StudentProfileView>> {
  const user = await applyNames(userId, { firstName, lastName });
  const profile = await StudentProfile.findOneAndUpdate(
    { userId },
    { $set: fields },
    { returnDocument: "after", runValidators: true },
  ).lean();
  if (!profile) throw new NotFoundError();
  return { user, profile: toStudentProfileView(profile) };
}

export async function updateEmployerProfile(
  userId: string,
  { firstName, lastName, ...fields }: EmployerProfileUpdate,
): Promise<ProfileResult<EmployerProfileView>> {
  const user = await applyNames(userId, { firstName, lastName });
  const profile = await EmployerProfile.findOneAndUpdate(
    { userId },
    { $set: fields },
    { returnDocument: "after", runValidators: true },
  ).lean();
  if (!profile) throw new NotFoundError();
  return { user, profile: toEmployerProfileView(profile) };
}

/** Records consent the first time only; later calls return the original timestamp. */
export async function recordPracticeConsent(userId: string): Promise<string> {
  await User.updateOne(
    { _id: userId, practiceConsentAt: null },
    { $set: { practiceConsentAt: new Date() } },
  );
  const user = await User.findById(userId).select("practiceConsentAt").lean();
  if (!user?.practiceConsentAt) throw new UnauthenticatedError();
  return user.practiceConsentAt.toISOString();
}

/**
 * Stores the upload as the student's only résumé. The new file is saved first and the profile
 * switched to it in one update; only then is the old file removed, so a failure never leaves
 * the student without a résumé they had.
 */
export async function replaceResume(userId: string, upload: Buffer): Promise<ResumeInfo> {
  await assertPdf(upload);
  const fileId = await saveResume(new Types.ObjectId(userId), upload);
  const uploadedAt = new Date().toISOString();
  let previous;
  try {
    previous = await StudentProfile.findOneAndUpdate(
      { userId },
      { $set: { resumeFileId: fileId } },
      { returnDocument: "before", projection: { resumeFileId: 1 } },
    ).lean();
    if (!previous) throw new NotFoundError();
  } catch (error) {
    await deleteResume(fileId);
    throw error;
  }
  if (previous.resumeFileId) await deleteResume(previous.resumeFileId);
  return { uploadedAt, sizeBytes: upload.length };
}

/** The stored file id of the student's résumé; 404 if they have none. */
export async function resumeFileIdOf(userId: string): Promise<mongoose.Types.ObjectId> {
  const profile = await StudentProfile.findOne({ userId }).select("resumeFileId").lean();
  if (!profile?.resumeFileId) throw new NotFoundError("No résumé uploaded");
  return profile.resumeFileId;
}

/**
 * Removes the résumé if there is one, and the copies on applications already sent: deleting it
 * takes it back from every employer. (A new upload leaves those copies alone.)
 */
export async function removeResume(userId: string): Promise<void> {
  const previous = await StudentProfile.findOneAndUpdate(
    { userId },
    { $unset: { resumeFileId: 1 } },
    { returnDocument: "before", projection: { resumeFileId: 1 } },
  ).lean();
  await removeResumeCopies({ studentId: userId });
  if (previous?.resumeFileId) await deleteResume(previous.resumeFileId);
}
