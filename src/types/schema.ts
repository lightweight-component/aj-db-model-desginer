/** A single column displayed inside a database table. */
export interface SchemaField {
  id: string;
  name: string;
  type: string;
  primary: boolean;
  nullable: boolean;
  unique: boolean;
  comment: string;
  defaultValue: string;
  autoIncrement?: boolean;
  unsigned?: boolean;
  checkExpression?: string;
}

/** Database engines supported by the field type catalogue. */
export type DatabaseDialect = "generic" | "mysql" | "mariadb" | "postgresql" | "sqlserver" | "sqlite" | "oracle";
export type ForeignKeyAction = "NO ACTION" | "RESTRICT" | "CASCADE" | "SET NULL" | "SET DEFAULT";
export type RelationRouteStyle = "orthogonal" | "straight" | "curved";

/** Visual preferences persisted with a diagram document. */
export interface DiagramEditorSettings {
  gridVisible: boolean;
  snapToGrid: boolean;
  relationRouteStyle: RelationRouteStyle;
  showCardinality: boolean;
}

/** A reusable named enum value set. */
export interface SchemaEnum {
  id: string;
  name: string;
  values: string[];
  comment: string;
}

/** A reusable named type built on a database-specific base type. */
export interface SchemaCustomType {
  id: string;
  name: string;
  baseType: string;
  length: number | null;
  precision: number | null;
  scale: number | null;
  comment: string;
}

/** A free-form annotation placed on the diagram canvas. */
export interface SchemaNote {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  text: string;
  color: string;
  locked: boolean;
}

/** A labelled visual grouping region placed behind tables. */
export interface SchemaArea {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  color: string;
  locked: boolean;
}

export type CanvasElementType = "table" | "relation" | "area" | "note";

/** Identifies one selectable object without coupling selection to its model. */
export interface ElementReference {
  type: CanvasElementType;
  id: string;
}

/** A named ordinary or unique index across one or more fields. */
export interface SchemaIndex {
  id: string;
  name: string;
  fieldIds: string[];
  unique: boolean;
}

/** A draggable database table in diagram coordinates. */
export interface SchemaTable {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  color: string;
  comment: string;
  collapsed: boolean;
  locked: boolean;
  fields: SchemaField[];
  indexes: SchemaIndex[];
}

export type RelationCardinality = "one-to-one" | "one-to-many" | "many-to-one";

/** A field-level foreign-key relationship; equal indexes form one composite key pair. */
export interface SchemaRelation {
  id: string;
  sourceTableId: string;
  sourceFieldIds: string[];
  targetTableId: string;
  targetFieldIds: string[];
  cardinality: RelationCardinality;
  constraintName: string;
  onDelete: ForeignKeyAction;
  onUpdate: ForeignKeyAction;
}

/** A safe, name-based foreign-key relationship suggestion. */
export interface AutoRelationCandidate {
  sourceTableId: string;
  sourceFieldId: string;
  targetTableId: string;
  targetFieldId: string;
  score: number;
  reason: string;
}

/** Serializable editor data, suitable for persistence or export later. */
export interface SchemaDiagram {
  formatVersion?: number;
  name?: string;
  settings?: DiagramEditorSettings;
  dialect: DatabaseDialect;
  enums: SchemaEnum[];
  customTypes: SchemaCustomType[];
  notes: SchemaNote[];
  areas: SchemaArea[];
  tables: SchemaTable[];
  relations: SchemaRelation[];
}

/** A coordinate in the unscaled diagram space. */
export interface DiagramPoint {
  x: number;
  y: number;
}

/** A diagram-space rectangle used for marquee selection. */
export interface DiagramRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
