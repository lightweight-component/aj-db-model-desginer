import { describe, expect, it } from "vitest";
import { isTypeSupported } from "./dialects";

describe("database dialect types", () => {
  /**
   * Verifies that MySQL INTEGER is accepted as an alias of INT.
   */
  it("accepts the MySQL INTEGER alias", (): void => {
    expect(isTypeSupported("mysql", "INTEGER")).toBe(true);
    expect(isTypeSupported("mysql", "INTEGER UNSIGNED")).toBe(false);
  });

  /**
   * Verifies that aliases remain scoped to their database dialect.
   */
  it("does not apply MySQL aliases to unrelated dialects", (): void => {
    expect(isTypeSupported("sqlite", "INTEGER")).toBe(true);
    expect(isTypeSupported("postgresql", "INT")).toBe(false);
  });

  /**
   * Verifies the Generic, MariaDB, and Oracle type catalogues expose native suggestions.
   */
  it("supports the additional database dialect catalogues", (): void => {
    expect(isTypeSupported("generic", "INTEGER")).toBe(true);
    expect(isTypeSupported("mariadb", "INTEGER")).toBe(true);
    expect(isTypeSupported("oracle", "VARCHAR2(255)")).toBe(true);
  });
});
