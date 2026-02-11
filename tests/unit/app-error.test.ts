import { describe, it, expect } from "bun:test";
import {
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  rateLimited,
  validation,
  internal,
  httpStatus,
  ErrorCode,
} from "../../src/core/errors/app-error.js";

describe("AppError", () => {
  it("badRequest → 400", () => {
    const e = badRequest("oops");
    expect(e.code).toBe(ErrorCode.BAD_REQUEST);
    expect(httpStatus(e.code)).toBe(400);
    expect(e.message).toBe("oops");
  });

  it("unauthorized → 401", () => {
    expect(httpStatus(unauthorized().code)).toBe(401);
  });

  it("forbidden → 403", () => {
    expect(httpStatus(forbidden().code)).toBe(403);
  });

  it("notFound → 404", () => {
    const e = notFound("User");
    expect(e.message).toBe("User not found");
    expect(httpStatus(e.code)).toBe(404);
  });

  it("conflict → 409", () => {
    expect(httpStatus(conflict("dup").code)).toBe(409);
  });

  it("validation → 422 with details", () => {
    const e = validation({ email: "required" });
    expect(httpStatus(e.code)).toBe(422);
    expect(e.details).toEqual({ email: "required" });
  });

  it("rateLimited → 429", () => {
    expect(httpStatus(rateLimited().code)).toBe(429);
  });

  it("internal → 500", () => {
    expect(httpStatus(internal().code)).toBe(500);
  });
});
