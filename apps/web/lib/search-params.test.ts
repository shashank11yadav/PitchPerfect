import { describe, expect, it } from "vitest";
import {
  applicationParam,
  createdParam,
  jobIdParam,
  jobStatusParam,
  pageParam,
  routeJobId,
  skillParam,
  type SearchParams,
} from "./search-params";

const query = (values: Record<string, string | string[]>): SearchParams => Promise.resolve(values);
const ID = "0123456789abcdef01234567";

describe("search params", () => {
  it("reads ?page= as a whole number from 1, else 1", async () => {
    await expect(pageParam(query({ page: "3" }))).resolves.toBe(3);
    await expect(pageParam(query({ page: ["2", "5"] }))).resolves.toBe(2);
    for (const page of ["0", "-1", "1.5", "two", ""]) {
      await expect(pageParam(query({ page }))).resolves.toBe(1);
    }
    await expect(pageParam(query({}))).resolves.toBe(1);
  });

  it("keeps ?skill= only when it names a skill", async () => {
    await expect(skillParam(query({ skill: "pitching" }))).resolves.toBe("pitching");
    await expect(skillParam(query({ skill: "juggling" }))).resolves.toBeUndefined();
  });

  it("keeps an id in the query or the route only when it looks like one", async () => {
    await expect(jobIdParam(query({ jobId: ID }))).resolves.toBe(ID);
    await expect(applicationParam(query({ application: ID }))).resolves.toBe(ID);
    await expect(routeJobId(Promise.resolve({ id: ID }))).resolves.toBe(ID);
    for (const id of ["123", `${ID}0`, "zzzzzzzzzzzzzzzzzzzzzzzz", "../etc"]) {
      await expect(jobIdParam(query({ jobId: id }))).resolves.toBeUndefined();
      await expect(applicationParam(query({ application: id }))).resolves.toBeUndefined();
      await expect(routeJobId(Promise.resolve({ id }))).resolves.toBeUndefined();
    }
  });

  it("keeps ?status= and ?created= only when they name a known value", async () => {
    await expect(jobStatusParam(query({ status: "active" }))).resolves.toBe("active");
    await expect(jobStatusParam(query({ status: "deleted" }))).resolves.toBeUndefined();
    await expect(createdParam(query({ created: "draft" }))).resolves.toBe("draft");
    await expect(createdParam(query({ created: "closed" }))).resolves.toBeUndefined();
  });
});
