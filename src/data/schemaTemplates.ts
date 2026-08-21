import type { DatabaseDialect, SchemaDiagram, SchemaField, SchemaRelation, SchemaTable } from "../types/schema";
import { CURRENT_SCHEMA_VERSION } from "../utils/schemaCompatibility";

/** A selectable starter diagram shown in the template library. */
export interface SchemaTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  diagram: SchemaDiagram;
}

/** Builds a table field with the editor's complete field metadata. */
function field(id: string, name: string, type: string, primary: boolean = false, nullable: boolean = true, unique: boolean = false): SchemaField {
  return { id, name, type, primary, nullable, unique, comment: "", defaultValue: "", autoIncrement: false, unsigned: false, checkExpression: "" };
}

/** Builds a diagram table with stable template geometry. */
function table(id: string, name: string, x: number, y: number, color: string, fields: SchemaField[]): SchemaTable {
  return { id, name, x, y, width: 260, color, comment: "", collapsed: false, locked: false, indexes: [], fields };
}

/** Builds the common diagram wrapper used by every starter template. */
function diagram(name: string, dialect: DatabaseDialect, tables: SchemaTable[], relations: SchemaRelation[]): SchemaDiagram {
  return { formatVersion: CURRENT_SCHEMA_VERSION, name, settings: { gridVisible: true, snapToGrid: false, relationRouteStyle: "orthogonal", showCardinality: true }, dialect, enums: [], customTypes: [], notes: [], areas: [], tables, relations };
}

/** Returns fresh copies of the built-in starter diagrams. */
export function schemaTemplates(): SchemaTemplate[] {
  const users: SchemaTable = table("saas-users", "users", 120, 150, "#5f6ee8", [field("saas-users-id", "id", "INTEGER", true, false, true), field("saas-users-email", "email", "VARCHAR(255)", false, false, true), field("saas-users-created", "created_at", "TIMESTAMP", false, false)]);
  const organizations: SchemaTable = table("saas-organizations", "organizations", 520, 110, "#20a67a", [field("saas-organizations-id", "id", "INTEGER", true, false, true), field("saas-organizations-name", "name", "VARCHAR(160)", false, false), field("saas-organizations-plan", "plan", "VARCHAR(32)", false, false)]);
  const memberships: SchemaTable = table("saas-memberships", "memberships", 520, 390, "#d37834", [field("saas-memberships-id", "id", "INTEGER", true, false, true), field("saas-memberships-user", "user_id", "INTEGER", false, false), field("saas-memberships-organization", "organization_id", "INTEGER", false, false), field("saas-memberships-role", "role", "VARCHAR(32)", false, false)]);
  const products: SchemaTable = table("shop-products", "products", 130, 130, "#5f6ee8", [field("shop-products-id", "id", "INTEGER", true, false, true), field("shop-products-name", "name", "VARCHAR(255)", false, false), field("shop-products-price", "price", "DECIMAL(10,2)", false, false)]);
  const customers: SchemaTable = table("shop-customers", "customers", 510, 100, "#20a67a", [field("shop-customers-id", "id", "INTEGER", true, false, true), field("shop-customers-email", "email", "VARCHAR(255)", false, false, true), field("shop-customers-name", "name", "VARCHAR(160)", false, false)]);
  const orders: SchemaTable = table("shop-orders", "orders", 500, 360, "#d37834", [field("shop-orders-id", "id", "INTEGER", true, false, true), field("shop-orders-customer", "customer_id", "INTEGER", false, false), field("shop-orders-status", "status", "VARCHAR(32)", false, false), field("shop-orders-total", "total", "DECIMAL(10,2)", false, false)]);
  const orderItems: SchemaTable = table("shop-order-items", "order_items", 870, 380, "#b965ac", [field("shop-order-items-id", "id", "INTEGER", true, false, true), field("shop-order-items-order", "order_id", "INTEGER", false, false), field("shop-order-items-product", "product_id", "INTEGER", false, false), field("shop-order-items-quantity", "quantity", "INTEGER", false, false)]);
  const posts: SchemaTable = table("blog-posts", "posts", 460, 130, "#5f6ee8", [field("blog-posts-id", "id", "INTEGER", true, false, true), field("blog-posts-author", "author_id", "INTEGER", false, false), field("blog-posts-title", "title", "VARCHAR(255)", false, false), field("blog-posts-body", "body", "TEXT", false, false)]);
  const authors: SchemaTable = table("blog-authors", "authors", 100, 160, "#20a67a", [field("blog-authors-id", "id", "INTEGER", true, false, true), field("blog-authors-name", "name", "VARCHAR(160)", false, false), field("blog-authors-email", "email", "VARCHAR(255)", false, false, true)]);
  const comments: SchemaTable = table("blog-comments", "comments", 470, 420, "#d37834", [field("blog-comments-id", "id", "INTEGER", true, false, true), field("blog-comments-post", "post_id", "INTEGER", false, false), field("blog-comments-author", "author_id", "INTEGER"), field("blog-comments-body", "body", "TEXT", false, false)]);

  return [
    { id: "saas", name: "SaaS workspace", description: "Organizations, users, and membership roles.", category: "Product", diagram: diagram("SaaS workspace", "postgresql", [users, organizations, memberships], [{ id: "saas-memberships-user-fk", sourceTableId: memberships.id, sourceFieldIds: ["saas-memberships-user"], targetTableId: users.id, targetFieldIds: ["saas-users-id"], cardinality: "many-to-one", constraintName: "fk_memberships_user", onDelete: "CASCADE", onUpdate: "NO ACTION" }, { id: "saas-memberships-organization-fk", sourceTableId: memberships.id, sourceFieldIds: ["saas-memberships-organization"], targetTableId: organizations.id, targetFieldIds: ["saas-organizations-id"], cardinality: "many-to-one", constraintName: "fk_memberships_organization", onDelete: "CASCADE", onUpdate: "NO ACTION" }]) },
    { id: "commerce", name: "Online store", description: "Customers, orders, products, and order items.", category: "Commerce", diagram: diagram("Online store", "mysql", [products, customers, orders, orderItems], [{ id: "shop-orders-customer-fk", sourceTableId: orders.id, sourceFieldIds: ["shop-orders-customer"], targetTableId: customers.id, targetFieldIds: ["shop-customers-id"], cardinality: "many-to-one", constraintName: "fk_orders_customer", onDelete: "NO ACTION", onUpdate: "NO ACTION" }, { id: "shop-order-items-order-fk", sourceTableId: orderItems.id, sourceFieldIds: ["shop-order-items-order"], targetTableId: orders.id, targetFieldIds: ["shop-orders-id"], cardinality: "many-to-one", constraintName: "fk_order_items_order", onDelete: "CASCADE", onUpdate: "NO ACTION" }, { id: "shop-order-items-product-fk", sourceTableId: orderItems.id, sourceFieldIds: ["shop-order-items-product"], targetTableId: products.id, targetFieldIds: ["shop-products-id"], cardinality: "many-to-one", constraintName: "fk_order_items_product", onDelete: "NO ACTION", onUpdate: "NO ACTION" }]) },
    { id: "blog", name: "Publishing blog", description: "Authors, posts, and discussion comments.", category: "Content", diagram: diagram("Publishing blog", "sqlite", [authors, posts, comments], [{ id: "blog-posts-author-fk", sourceTableId: posts.id, sourceFieldIds: ["blog-posts-author"], targetTableId: authors.id, targetFieldIds: ["blog-authors-id"], cardinality: "many-to-one", constraintName: "fk_posts_author", onDelete: "NO ACTION", onUpdate: "NO ACTION" }, { id: "blog-comments-post-fk", sourceTableId: comments.id, sourceFieldIds: ["blog-comments-post"], targetTableId: posts.id, targetFieldIds: ["blog-posts-id"], cardinality: "many-to-one", constraintName: "fk_comments_post", onDelete: "CASCADE", onUpdate: "NO ACTION" }, { id: "blog-comments-author-fk", sourceTableId: comments.id, sourceFieldIds: ["blog-comments-author"], targetTableId: authors.id, targetFieldIds: ["blog-authors-id"], cardinality: "many-to-one", constraintName: "fk_comments_author", onDelete: "SET NULL", onUpdate: "NO ACTION" }]) },
  ];
}
