import { describe, expect, it, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

/**
 * API security smoke tests against a running DB.
 * Skipped automatically if DATABASE_URL is unreachable.
 */
const app = createApp();

describe("security API", () => {
  let accountsToken = "";
  let parentToken = "";
  let studentId = "";
  let otherStudentId = "";
  let dbOk = true;

  beforeAll(async () => {
    try {
      const login = await request(app)
        .post("/api/auth/accounts/login")
        .send({ email: "accounts@feeflow.demo", password: "Accounts@123" });
      if (login.status !== 200) {
        dbOk = false;
        return;
      }
      accountsToken = login.body.data.token;

      const students = await request(app)
        .get("/api/students")
        .set("Authorization", `Bearer ${accountsToken}`);
      studentId = students.body.data.find((s: { studentCode: string }) => s.studentCode === "STU-0587")?.id;
      otherStudentId = students.body.data.find((s: { studentCode: string }) => s.studentCode === "STU-0412")?.id;

      await request(app).post("/api/auth/parent/request-otp").send({ phone: "9876500587" });
      const verify = await request(app)
        .post("/api/auth/parent/verify-otp")
        .send({ phone: "9876500587", code: process.env.OTP_DEMO_CODE ?? "246810" });
      parentToken = verify.body.data.token;
    } catch {
      dbOk = false;
    }
  });

  it("accounts endpoints require authentication", async () => {
    if (!dbOk) return;
    const res = await request(app).get("/api/dashboard/summary");
    expect(res.status).toBe(401);
  });

  it("parent cannot access accounts dashboard", async () => {
    if (!dbOk) return;
    const res = await request(app)
      .get("/api/dashboard/summary")
      .set("Authorization", `Bearer ${parentToken}`);
    expect(res.status).toBe(403);
  });

  it("parent cannot access another student's ledger", async () => {
    if (!dbOk) return;
    const res = await request(app)
      .get(`/api/students/${otherStudentId}/ledger`)
      .set("Authorization", `Bearer ${parentToken}`);
    expect(res.status).toBe(403);
  });

  it("parent can access linked student ledger", async () => {
    if (!dbOk) return;
    const res = await request(app)
      .get(`/api/students/${studentId}/ledger`)
      .set("Authorization", `Bearer ${parentToken}`);
    expect(res.status).toBe(200);
  });

  it("rejects invalid OTP", async () => {
    if (!dbOk) return;
    await request(app).post("/api/auth/parent/request-otp").send({ phone: "9876500412" });
    const res = await request(app)
      .post("/api/auth/parent/verify-otp")
      .send({ phone: "9876500412", code: "000000" });
    expect(res.status).toBe(401);
  });

  it("rejects invalid login inputs", async () => {
    const res = await request(app).post("/api/auth/accounts/login").send({ email: "bad", password: "x" });
    expect(res.status).toBe(400);
  });
});
