import mongoose from "mongoose";
import type { EmployerDashboard } from "@pitchperfect/shared";
import { Application, Job } from "../../db/models/index.js";
import { anyOf, OPEN_STATUSES } from "../applications/closing.js";
import { applicantViews } from "./applicants.service.js";
import type { CompanyDoc } from "./ownership.js";

const RECENT_COUNT = 5;

export async function dashboardFor(company: CompanyDoc): Promise<EmployerDashboard> {
  const jobs = await Job.find({ companyId: company._id }).select("title status").lean();
  const jobIds = anyOf(jobs.map((job) => job._id));
  const inCompany = { jobId: jobIds };
  const [applicants, interviewsUpcoming, recent] = await Promise.all([
    Application.countDocuments({ ...inCompany, status: anyOf(OPEN_STATUSES) }),
    Application.countDocuments({
      ...inCompany,
      status: "interview",
      "interview.startsAt": mongoose.trusted({ $gt: new Date() }),
    }),
    Application.find(inCompany).sort({ createdAt: -1, _id: -1 }).limit(RECENT_COUNT).lean(),
  ]);
  const titleOf = new Map(jobs.map((job) => [job._id.toString(), job.title]));
  const views = await applicantViews(recent);
  const jobOf = new Map(
    recent.map((application) => [application._id.toString(), application.jobId]),
  );
  return {
    activeJobs: jobs.filter((job) => job.status === "active").length,
    drafts: jobs.filter((job) => job.status === "draft").length,
    applicants,
    interviewsUpcoming,
    recentApplications: views.flatMap((view) => {
      const jobId = jobOf.get(view.id)?.toString();
      return jobId === undefined ? [] : [{ ...view, jobId, jobTitle: titleOf.get(jobId) ?? "" }];
    }),
  };
}
