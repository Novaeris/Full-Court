import { describe, expect, it } from "vitest";
import {
  FREE_AGENCY_DAYS,
  SALARY_CAP_BASE,
  acceptChance,
  askingSalary,
  askingYears,
  hardCeiling,
  lateSigningPrice,
  maxSalary,
  maxYearsFor,
  midLevelException,
  minSalary,
  offerScore,
  rookieContract,
  salaryCap,
  signingRoute,
} from "../index";

const CAP = SALARY_CAP_BASE;

describe("the cap", () => {
  it("starts at $125 million and rises 3% a year", () => {
    expect(salaryCap(0)).toBe(125_000);
    expect(salaryCap(1)).toBe(128_800);
    expect(salaryCap(10)).toBeGreaterThan(salaryCap(9));
    expect(salaryCap(50) / salaryCap(0)).toBeCloseTo(1.03 ** 50, 2);
  });

  it("puts the ceiling 20% above the cap, and everything else in proportion", () => {
    expect(hardCeiling(CAP)).toBe(150_000);
    expect(minSalary(CAP)).toBe(1_000);
    expect(maxSalary(CAP)).toBe(37_500);
    expect(midLevelException(CAP)).toBe(10_000);
    expect(freeAgencyDays()).toBe(21);
  });
});

function freeAgencyDays() {
  return FREE_AGENCY_DAYS;
}

describe("asking prices", () => {
  const ask = (overall: number, potential = overall, age = 26) =>
    askingSalary({ overall, potential, age }, CAP);

  it("rise steeply from the minimum to the maximum", () => {
    expect(ask(40)).toBe(minSalary(CAP));
    expect(ask(90)).toBe(maxSalary(CAP));
    let previous = 0;
    for (let overall = 40; overall <= 95; overall++) {
      expect(ask(overall)).toBeGreaterThanOrEqual(previous);
      previous = ask(overall);
    }
    expect(ask(70)).toBeGreaterThan(ask(60) * 2);
  });

  it("count potential for the young more than for veterans", () => {
    expect(ask(55, 75, 20)).toBeGreaterThan(ask(55, 75, 30));
  });

  it("are lower for the old", () => {
    expect(ask(75, 75, 35)).toBeLessThan(ask(75, 75, 28));
  });

  it("scale with the cap", () => {
    const player = { overall: 72, potential: 72, age: 27 };
    expect(askingSalary(player, salaryCap(10))).toBeGreaterThan(
      askingSalary(player, salaryCap(0)),
    );
  });

  it("ask for shorter deals as players age", () => {
    expect(askingYears(21)).toBeGreaterThan(askingYears(31));
    expect(askingYears(36)).toBe(1);
    expect(maxYearsFor(36)).toBe(2);
    expect(maxYearsFor(25)).toBe(5);
  });
});

describe("rookie contracts", () => {
  it("pay the first pick 8% of the cap, less for each pick, and the second round the minimum", () => {
    expect(rookieContract(1, 1, CAP)).toEqual({ salary: 10_000, years: 3 });
    let previous = Infinity;
    for (let pick = 1; pick <= 30; pick++) {
      const { salary } = rookieContract(pick, 1, CAP);
      expect(salary).toBeLessThanOrEqual(previous);
      expect(salary).toBeGreaterThanOrEqual(minSalary(CAP));
      previous = salary;
    }
    expect(rookieContract(40, 2, CAP)).toEqual({
      salary: minSalary(CAP),
      years: 2,
    });
  });
});

describe("how a team can sign a player", () => {
  const base = { cap: CAP, rights: false, mleAvailable: true };

  it("uses cap room first", () => {
    expect(signingRoute({ ...base, payroll: 100_000, salary: 20_000 })).toBe(
      "room",
    );
  });

  it("lets any team sign a minimum contract, even over the cap", () => {
    expect(
      signingRoute({ ...base, payroll: 140_000, salary: minSalary(CAP) }),
    ).toBe("minimum");
  });

  it("lets a team re-sign its own free agent over the cap", () => {
    expect(
      signingRoute({ ...base, payroll: 130_000, salary: 15_000, rights: true }),
    ).toBe("rights");
    expect(
      signingRoute({
        ...base,
        payroll: 130_000,
        salary: 15_000,
        rights: false,
      }),
    ).toBeNull();
  });

  it("gives the mid-level exception once, for up to 8% of the cap", () => {
    expect(signingRoute({ ...base, payroll: 130_000, salary: 10_000 })).toBe(
      "mle",
    );
    expect(
      signingRoute({ ...base, payroll: 130_000, salary: 10_100 }),
    ).toBeNull();
    expect(
      signingRoute({
        ...base,
        payroll: 130_000,
        salary: 10_000,
        mleAvailable: false,
      }),
    ).toBeNull();
  });

  it("never lets payroll pass the hard ceiling, whatever the route", () => {
    expect(
      signingRoute({ ...base, payroll: 145_000, salary: 10_000, rights: true }),
    ).toBeNull();
    expect(
      signingRoute({ ...base, payroll: 149_500, salary: minSalary(CAP) }),
    ).toBeNull();
    expect(
      signingRoute({ ...base, payroll: 149_000, salary: minSalary(CAP) }),
    ).toBe("minimum");
  });

  it("refuses a salary outside the minimum and maximum", () => {
    expect(signingRoute({ ...base, payroll: 50_000, salary: 500 })).toBeNull();
    expect(
      signingRoute({ ...base, payroll: 50_000, salary: maxSalary(CAP) + 10 }),
    ).toBeNull();
  });
});

describe("how free agents decide", () => {
  it("never accept under 80% of the asking price and always accept 110%", () => {
    expect(acceptChance(0.79, 10)).toBe(0);
    expect(acceptChance(1.1, 1)).toBe(1);
    expect(acceptChance(1.5, 1)).toBe(1);
  });

  it("are likelier to accept a better offer, and later in free agency", () => {
    expect(acceptChance(1, 1)).toBeGreaterThan(acceptChance(0.9, 1));
    expect(acceptChance(0.9, 15)).toBeGreaterThan(acceptChance(0.9, 1));
    expect(acceptChance(0.9, 21)).toBeLessThanOrEqual(1);
  });

  it("count the old team's offer a little extra", () => {
    expect(offerScore(10_000, true)).toBeGreaterThan(offerScore(10_000, false));
  });

  it("price a late signing at 75% of the ask, never below the minimum", () => {
    expect(lateSigningPrice(20_000, CAP)).toBe(15_000);
    expect(lateSigningPrice(1_000, CAP)).toBe(minSalary(CAP));
  });
});
