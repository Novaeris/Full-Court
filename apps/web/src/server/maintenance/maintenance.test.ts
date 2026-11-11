import { afterEach, describe, expect, it } from "vitest";
import { maintenanceEnabled, maintenanceResponse } from "./maintenance";

afterEach(() => {
  delete process.env.MAINTENANCE_MODE;
});

describe("maintenance mode", () => {
  it("is off unless MAINTENANCE_MODE is exactly on", () => {
    expect(maintenanceEnabled()).toBe(false);
    process.env.MAINTENANCE_MODE = "true";
    expect(maintenanceEnabled()).toBe(false);
    process.env.MAINTENANCE_MODE = "on";
    expect(maintenanceEnabled()).toBe(true);
  });

  it("answers pages with a 503 HTML page", async () => {
    const response = maintenanceResponse("/leagues");
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("600");
    expect(await response.text()).toContain("Down for maintenance");
  });

  it("answers the API with the JSON error envelope", async () => {
    const response = maintenanceResponse("/api/v1/leagues");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: "maintenance",
        message: "Full Court is down for maintenance. Try again soon.",
      },
    });
  });
});
