import { ApiClient } from "./accounts";

interface PublicJob {
  id: string;
  slug: string;
  title: string;
  company: { name: string; verification: "verified" | "unverified" | "suspended" };
}

/** The first open job on the public board whose company has this verification state. */
export async function publicJob(verification: "verified" | "unverified"): Promise<PublicJob> {
  const api = await ApiClient.open();
  try {
    const { items } = await api.json<{ items: PublicJob[] }>("GET", "/jobs?pageSize=50");
    const job = items.find((item) => item.company.verification === verification);
    if (!job) throw new Error(`The seeded board has no job from a ${verification} company`);
    return job;
  } finally {
    await api.dispose();
  }
}
