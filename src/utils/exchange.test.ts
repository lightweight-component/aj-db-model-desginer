import { describe, expect, it } from "vitest";
import type { SchemaDiagram, SchemaTable } from "../types/schema";
import { exportDbml, parseDbml } from "./dbml";
import { exportMarkdown } from "./exchange";
import {
  CURRENT_SCHEMA_VERSION,
  validateSchemaDiagram,
} from "./schemaCompatibility";
import { parseSqlDdl } from "./sqlImport";
import { generateSql } from "./sql";

describe("diagram exchange compatibility", () => {
  /**
   * Verifies diagrams without the current version are not migrated implicitly.
   */
  it("rejects legacy JSON diagrams", (): void => {
    const result = validateSchemaDiagram({
      dialect: "mysql",
      tables: [
        {
          id: 1,
          name: "parent",
          fields: [{ id: 11, name: "id", type: "INT", primary: true }],
        },
        {
          id: 2,
          name: "child",
          fields: [{ id: 21, name: "parent_id", type: "INT" }],
        },
      ],
      relations: [
        {
          id: 3,
          sourceTableId: 2,
          sourceFieldId: 21,
          targetTableId: 1,
          targetFieldId: 11,
          onDelete: "cascade",
        },
      ],
      notes: [{ id: 4, title: "Legacy", content: "old text" }],
    });

    expect(result.diagram).toBeNull();
    expect(result.error).toBe(
      `formatVersion must be ${CURRENT_SCHEMA_VERSION}.`,
    );
  });

  /**
   * Verifies future versions and broken field references fail with model paths.
   */
  it("rejects incompatible JSON with precise paths", (): void => {
    expect(
      validateSchemaDiagram({ formatVersion: CURRENT_SCHEMA_VERSION + 1 })
        .error,
    ).toBe(`formatVersion must be ${CURRENT_SCHEMA_VERSION}.`);
    const result = validateSchemaDiagram({
      formatVersion: CURRENT_SCHEMA_VERSION,
      name: "Invalid relationship",
      dialect: "mysql",
      settings: {
        gridVisible: true,
        snapToGrid: false,
        relationRouteStyle: "orthogonal",
        showCardinality: true,
      },
      enums: [],
      customTypes: [],
      notes: [],
      areas: [],
      tables: [
        {
          id: "a",
          name: "a",
          x: 0,
          y: 0,
          width: 260,
          color: "#ffffff",
          comment: "",
          collapsed: false,
          locked: false,
          indexes: [],
          fields: [
            {
              id: "a1",
              name: "id",
              type: "INT",
              primary: true,
              nullable: false,
              unique: true,
              comment: "",
              defaultValue: "",
            },
          ],
        },
      ],
      relations: [
        {
          id: "r",
          sourceTableId: "a",
          sourceFieldIds: ["missing"],
          targetTableId: "a",
          targetFieldIds: ["a1"],
          cardinality: "many-to-one",
          constraintName: "",
          onDelete: "NO ACTION",
          onUpdate: "NO ACTION",
        },
      ],
    });

    expect(result.error).toContain("relations[0].sourceFieldIds");
  });

  /**
   * Verifies composite keys, indexes, decimal types, and ALTER foreign keys.
   */
  it("imports production-style SQL DDL", (): void => {
    const diagram: SchemaDiagram = parseSqlDdl(
      `
CREATE TABLE [dbo].[accounts] (
  tenant_id INT NOT NULL,
  id INT NOT NULL,
  balance DECIMAL(12, 4) DEFAULT 0,
  CONSTRAINT pk_accounts PRIMARY KEY (tenant_id, id),
  CONSTRAINT uq_accounts UNIQUE (tenant_id, balance)
);
CREATE TABLE ledger (
  tenant_id INT NOT NULL,
  account_id INT NOT NULL
);
CREATE INDEX idx_ledger_account ON ledger (tenant_id, account_id);
ALTER TABLE ledger ADD CONSTRAINT fk_ledger_account FOREIGN KEY (tenant_id, account_id)
  REFERENCES accounts (tenant_id, id) ON DELETE CASCADE ON UPDATE RESTRICT;
`,
      "sqlserver",
    );
    const accounts: SchemaTable = diagram.tables.find(
      (table: SchemaTable) => table.name === "accounts",
    ) as SchemaTable;
    const ledger: SchemaTable = diagram.tables.find(
      (table: SchemaTable) => table.name === "ledger",
    ) as SchemaTable;

    expect(
      accounts.fields
        .filter((field) => field.primary)
        .map((field) => field.name),
    ).toEqual(["tenant_id", "id"]);
    expect(
      accounts.fields.find((field) => field.name === "balance")?.type,
    ).toBe("DECIMAL(12, 4)");
    expect(accounts.indexes[0]).toMatchObject({
      name: "uq_accounts",
      unique: true,
    });
    expect(ledger.indexes[0].fieldIds).toHaveLength(2);
    expect(diagram.relations[0]).toMatchObject({
      constraintName: "fk_ledger_account",
      onDelete: "CASCADE",
      onUpdate: "RESTRICT",
    });
    expect(diagram.relations[0].sourceFieldIds).toHaveLength(2);
  });

  /**
   * Verifies advanced field DDL properties survive SQL and DBML exchange.
   */
  it("preserves auto increment, unsigned, and CHECK field properties", (): void => {
    const diagram: SchemaDiagram = parseSqlDdl(
      `
CREATE TABLE products (
  id INTEGER UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  quantity INTEGER UNSIGNED NOT NULL CHECK (quantity >= 0),
  price DECIMAL(10, 2) CHECK (price > 0)
);`,
      "mysql",
    );
    const products: SchemaTable = diagram.tables[0];
    const id = products.fields.find((field) => field.name === "id");
    const quantity = products.fields.find((field) => field.name === "quantity");

    expect(id).toMatchObject({
      autoIncrement: true,
      unsigned: true,
      primary: true,
    });
    expect(quantity).toMatchObject({
      unsigned: true,
      checkExpression: "quantity >= 0",
    });
    expect(generateSql(diagram)).toContain(
      "`id` INTEGER UNSIGNED AUTO_INCREMENT NOT NULL",
    );
    expect(generateSql(diagram)).toContain("CHECK (quantity >= 0)");
    expect(
      parseDbml(exportDbml(diagram)).tables[0].fields.find(
        (field) => field.name === "quantity",
      ),
    ).toMatchObject({ unsigned: true, checkExpression: "quantity >= 0" });
  });

  /**
   * Verifies new dialect imports accept their usual identifier and identity syntax.
   */
  it("imports Generic, MariaDB, and Oracle table declarations", (): void => {
    const generic: SchemaDiagram = parseSqlDdl(
      "CREATE TABLE inventory (id INTEGER PRIMARY KEY, quantity INTEGER CHECK (quantity >= 0));",
      "generic",
    );
    const mariaDb: SchemaDiagram = parseSqlDdl(
      "CREATE TABLE `events` (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, name VARCHAR(80));",
      "mariadb",
    );
    const oracle: SchemaDiagram = parseSqlDdl(
      'CREATE TABLE "AUDIT_LOG" ("ID" NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, "MESSAGE" VARCHAR2(4000));',
      "oracle",
    );

    expect(generic.tables[0].fields[1]).toMatchObject({
      type: "INTEGER",
      checkExpression: "quantity >= 0",
    });
    expect(mariaDb.tables[0].fields[0]).toMatchObject({
      unsigned: true,
      autoIncrement: true,
    });
    expect(oracle.tables[0].fields[0]).toMatchObject({
      type: "NUMBER",
      autoIncrement: true,
      primary: true,
    });
  });

  /**
   * Verifies the Markdown document carries table, field, constraint, and relation details.
   */
  it("exports a readable Markdown schema document", (): void => {
    const diagram: SchemaDiagram = parseSqlDdl(
      `
CREATE TABLE accounts (
  id INTEGER UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  balance DECIMAL(10, 2) CHECK (balance >= 0)
);
CREATE TABLE invoices (id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL);
ALTER TABLE invoices ADD CONSTRAINT fk_invoice_account FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE;
`,
      "mysql",
    );
    diagram.name = "Billing schema";
    const markdown: string = exportMarkdown(diagram);

    expect(markdown).toContain("# Billing schema");
    expect(markdown).toContain("## accounts");
    expect(markdown).toContain("Auto increment, Unsigned");
    expect(markdown).toContain("balance >= 0");
    expect(markdown).toContain("fk_invoice_account");
  });

  /**
   * Verifies DBML preserves quoted identifiers, named indexes, and composite references.
   */
  it("round trips advanced DBML structures", (): void => {
    const sqlDiagram: SchemaDiagram = parseSqlDdl(
      `
CREATE TABLE \`account group\` (tenant_id INT, id INT, PRIMARY KEY (tenant_id, id));
CREATE TABLE ledger (tenant_id INT, account_id INT);
CREATE UNIQUE INDEX \`ledger lookup\` ON ledger (tenant_id, account_id);
ALTER TABLE ledger ADD FOREIGN KEY (tenant_id, account_id) REFERENCES \`account group\` (tenant_id, id);
`,
      "mysql",
    );
    const imported: SchemaDiagram = parseDbml(exportDbml(sqlDiagram));

    expect(imported.tables.map((table: SchemaTable) => table.name)).toContain(
      "account group",
    );
    expect(
      imported.tables.find((table: SchemaTable) => table.name === "ledger")
        ?.indexes[0],
    ).toMatchObject({ name: "ledger lookup", unique: true });
    expect(imported.relations[0].sourceFieldIds).toHaveLength(2);
    expect(imported.formatVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  /**
   * Verifies malformed SQL reports a useful source line.
   */
  it("reports SQL line numbers", (): void => {
    expect((): SchemaDiagram =>
      parseSqlDdl("\n\nCREATE TABLE broken (id INT", "mysql"),
    ).toThrow("Line 3");
  });
});
