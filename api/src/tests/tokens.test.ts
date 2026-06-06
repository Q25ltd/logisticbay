/**
 * Unit tests for token generation helpers in lib/tokens.ts.
 * No database required — pure JWT encode/decode.
 */
import "dotenv/config";
import "../lib/env.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateAccessToken, generateRefreshToken } from "../lib/tokens.js";

const PAYLOAD = { userId: 1, companyId: 1, role: "planner" };

test("generateAccessToken issues an 8-hour token", () => {
  const token   = generateAccessToken(PAYLOAD);
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());

  assert.ok(typeof payload.exp === "number", "exp must be present");
  assert.ok(typeof payload.iat === "number", "iat must be present");

  const ttlSeconds = payload.exp - payload.iat;
  assert.equal(ttlSeconds, 8 * 60 * 60, `Access token TTL must be 8h (28800 s), got ${ttlSeconds}s`);
});

test("generateRefreshToken issues a 30-day token", () => {
  const token   = generateRefreshToken(PAYLOAD);
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());

  assert.ok(typeof payload.exp === "number", "exp must be present");
  assert.ok(typeof payload.iat === "number", "iat must be present");

  const ttlSeconds = payload.exp - payload.iat;
  assert.equal(ttlSeconds, 30 * 24 * 60 * 60, `Refresh token TTL must be 30d (2592000 s), got ${ttlSeconds}s`);
});
