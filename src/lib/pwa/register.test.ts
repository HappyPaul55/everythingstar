import { describe, expect, test } from "bun:test";
import { shouldRegister, type RegisterEnv } from "./register";

const BASE: RegisterEnv = {
  production: true,
  protocol: "https:",
  hostname: "everythingstar.happypaul55.com",
  hasServiceWorker: true,
  native: false,
};

describe("shouldRegister", () => {
  test("a production https page with a worker registers it", () => {
    expect(shouldRegister(BASE)).toBe(true);
  });

  test("development never registers: there is no built worker", () => {
    expect(shouldRegister({ ...BASE, production: false })).toBe(false);
  });

  test("a browser without a worker is left alone", () => {
    expect(shouldRegister({ ...BASE, hasServiceWorker: false })).toBe(false);
  });

  test("the native WebView keeps its own worker", () => {
    expect(shouldRegister({ ...BASE, native: true })).toBe(false);
  });

  test("http is refused except on a local host", () => {
    expect(shouldRegister({ ...BASE, protocol: "http:", hostname: "example.com" })).toBe(
      false,
    );
    expect(shouldRegister({ ...BASE, protocol: "http:", hostname: "localhost" })).toBe(
      true,
    );
    expect(shouldRegister({ ...BASE, protocol: "http:", hostname: "127.0.0.1" })).toBe(
      true,
    );
  });
});
