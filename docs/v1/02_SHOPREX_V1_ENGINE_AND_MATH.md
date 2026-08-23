# Shoprex V1 — Engine and Mathematics

**Purpose:** This document defines the internal rules that make Shoprex more than a simple POS. It is separate from the human-facing product concept so agents can implement the engine without exposing unnecessary complexity to shop users.

## 1. Technical direction

The confirmed V1 stack is:

| Layer | Choice |
|---|---|
| Money | Whole Tanzanian shillings, stored as integers (Phase 3). TZS is not divided into subunits in practice, and an inexact representation eventually disagrees with itself |
| Mobile | React Native with Expo (development build, not Expo Go), Android first |
| Web | Next.js with TypeScript |
| Backend | NestJS with TypeScript |
| Database | PostgreSQL, one shared multi-tenant database |
| API | One NestJS API consumed by React Native and Next.js; REST with generated/request-validated schemas is preferred |
| Authentication | Full account authentication for platform administrators and owners; delegated managers/workers receive scoped credentials and operational PIN/password access as approved |
| Barcode scanning | Expo camera-based barcode scanning (`expo-camera`) using the phone camera. **EAN-13**, confirmed by the owner 2026-08-22; a UPC-A is widened to its EAN-13 form, and the check digit is verified |
| Reporting | Backend-generated daily report and PDF |
| V1 connectivity | Online-only operational transactions; no offline queue or conflict resolution in V1 |

The backend is the only service allowed to create or mutate authoritative sales, stock, device, and permission records. The web app must not connect directly to PostgreSQL.

## 2. Tenant and authorization rules

A **business** is the tenant. A business may have one or more **branches**. Every tenant-owned record contains `business_id`; branch-owned records also contain `branch_id`.

Every protected request must resolve the authenticated principal, business, permitted branches, role, and permissions on the server. The backend must never trust a business ID, branch ID, user ID, or device ID supplied by the client without checking ownership and authorization.

The role hierarchy is:

| Role | Scope | Main authority |
|---|---|---|
| Platform administrator | Entire Shoprex platform | Create/manage shop accounts and platform-level operations |
| Owner | Entire business | Manage branches, products, devices, users, payment methods, reports, and business-wide visibility |
| Manager | Assigned branch or branches | Manage the branch within permissions delegated by the owner |
| Worker | Assigned branch | Sell, receive stock, view stock, or view totals only when permitted. Signs in on the one device enrolled to them, not by email |

The owner may act as the manager for a branch. The data model must also support creating a separate manager later without forcing the owner to create a duplicate owner account.

## 3. Device enrollment mathematics and identity

A device is a first-class record, not merely an anonymous login session. At minimum, store:

- a globally unique `device_id`;
- business and branch ownership;
- a human-readable device name;
- an active/revoked status;
- a password/PIN hash or equivalent credential reference;
- an enrollment-token hash, expiry, and used status;
- creation, last-seen, and revocation timestamps.

The QR code and link must contain a short-lived, single-use enrollment token rather than a permanent secret. After enrollment, the mobile app stores a device credential securely and uses the backend to authenticate the device. A revoked device must not create sales or stock movements.

**As built in Phase 2.** `Device` carries the business, branch, and the one
worker it belongs to; a server-minted uuid `id` *is* the `device_id`; a
`DeviceStatus` of `ACTIVE` or `REVOKED`; `lastSeenAt`, `revokedAt`, and
`revokedById`. There is no separate device password hash: because a device
belongs to exactly one worker, the device credential is a *reference* to that
worker's own password — the "or equivalent credential reference" this section
allows. One password, one place, no drift between two copies of it.

`DeviceEnrollmentToken` stores the SHA-256 hash of the code and never the code
itself, plus `expiresAt`, `usedAt`, and the `deviceId` a successful bind
produced. SHA-256 rather than bcrypt is deliberate: redemption has to *find* the
row by the value presented, which needs a deterministic digest, and the input is
a high-entropy random code rather than a human-chosen password. `usedAt` is set
only by a bind that actually happened — a refused redemption leaves the code
usable.

A revoked device is stopped by `DeviceSessionGuard`, which runs on every
device-authenticated request. That is one lookup per request, paid only by
device sessions; it is what makes revocation take effect immediately rather than
whenever the token happens to expire.

Multiple devices are allowed in V1. Because V1 requires devices to be online, each authoritative transaction is accepted by the backend in normal request order. The system does not implement offline writes, an outbox, conflict resolution, or background reconciliation in this version.

## 4. Product identity and units

A product is one SKU identity, such as **Coke 500ml**. Different sizes are different products. A package is a way of handling one product, such as Piece, Carton, Bale, Sack, Pack, Bottle, kg, or a custom name.

A package name has no universal business meaning. Product A may define `1 Carton = 6 Pieces`, while Product B defines `1 Carton = 48 Pieces`. Relationships belong to the product.

Use one generic relationship:

> **One parent unit contains `factor × child unit`.**

Examples:

```text
Product A: 1 Carton = 6 Pieces
Product B: 1 Carton = 48 Pieces
Product C: 1 Sack = 50 kg = 50,000 g
```

Fixed measurement conversions remain fixed and cannot be redefined by a business:

```text
1 kg = 1,000 g
1 L  = 1,000 ml
1 m  = 100 cm
1 dozen = 12 count units
```

Custom units are allowed when a business needs a product-specific grouping, for example `1 Fungu = 8 Pieces`.

The engine must reject cyclic relationships. A product may be incompletely configured. If a shop only sells Coke by Carton, it does not need to define the Piece relationship until it begins selling Pieces.

**As built in Phase 3.** `UnitGraph` in `backend/src/domain/units.ts` holds a
product's relationships and refuses anything that is not a single tree: a
self-reference, a cycle, a unit given two parents, a duplicated pair, a factor
that is not a whole number of at least 1, and units that do not all connect to
one base. One parent per unit is enforced in the database too, by a unique index
on the child — two routes down to the base could disagree, and there is no
honest way to pick a winner.

`FIXED_CONVERSIONS` holds the four conversions a business may not redefine, and
`assertFixedConversionRespected` refuses a contradicting factor with a `400`.
Progressive configuration works as described: a product may be created with one
unit and no relationship at all, and `POST /products/{id}/units` adds a smaller
or larger unit later, re-basing the arithmetic. Stock already held is
re-expressed in the new base — the physical packages are untouched, only the
number they normalise to changes.

## 5. Stock mathematics

The engine maintains two related views:

1. **Normalized quantity**, used for arithmetic and reconciliation.
2. **Physical package state**, used to explain what the shop physically has, such as `5 Cartons + 5 Pieces`.

For a product with `1 Carton = 6 Pieces`:

```text
Receive 6 Cartons = +36 Pieces normalized
Sell 1 Piece      = -1 Piece
Remaining         = 5 Cartons + 5 Pieces = 35 Pieces normalized
```

When selling a child unit and loose stock is insufficient, the engine may break a larger package. For example, selling one Piece from `1 Carton` may produce `0 Cartons + 5 Pieces`.

The engine must never automatically repackage upward. If the shop has 6 loose Pieces, it must not silently invent `1 Carton`; physical packaging matters.

The transaction must fail safely when stock is insufficient, unless a separate approved negative-stock policy is introduced. Do not hide an inventory deficit by changing units or prices.

**As built in Phase 3.** `backend/src/domain/stock.ts` holds the physical state
as a count per unit and every function is pure, returning a new state — so a
movement that turns out to be impossible cannot leave stock half-changed.
`issue()` checks the normalized total *before* touching anything and throws
`InsufficientStockError`, which the service turns into a `409`.

`breakOneOpen` opens the **nearest** larger package that has stock, so a Sack is
not torn apart when breaking a kg would have served, and it cascades down a
chain (Sack → kg → g) one level at a time. There is no upward path anywhere in
the module: `receive()` only ever adds to the unit it was given, which is what
keeps six loose Pieces from becoming a Carton.

Each `StockMovement` snapshots the `conversionFactor` it used, and each
`StockReceiptLine` its `normalizedQuantity`, so a later change to a package
factor cannot rewrite what a past delivery contained.

## 6. Sales rules

A sale contains one or more lines. Each line preserves the commercial unit actually sold. If a product is sold as `2 Cartons` and `5 Pieces`, those remain separate lines even if the normalized quantity could be combined.

If a product has only one valid sellable unit, scanning or selecting it adds quantity `1` immediately. Repeated scans increment the existing line. If multiple units are available, the app shows a compact unit and quantity choice.

Line total is deterministic:

```text
line_total = quantity × unit_price
sale_total = sum(line_total for all sale lines)
```

A sale line stores snapshots of product name, unit name, quantity, price, line total, conversion used, and normalized stock quantity removed. Later product-price or package-relationship changes must never rewrite old completed sales.

The complete sale command should be atomic: create the sale, create lines, validate payment settlement, record payments/debt, and apply stock movements as one backend transaction. The command must accept an idempotency key so a retried network request cannot duplicate a sale.

## 7. Payments and debt

Payment methods are configured per business and only active methods appear at checkout. V1 records payment methods; it does not directly connect to mobile-money providers.

Cash change is calculated automatically:

```text
change = cash_received - sale_total
```

Mixed payments are valid only when the settled amount equals the sale total:

```text
sum(payment_amounts) = amount_settled
```

A debt sale records only a free-text debtor name and the amount owed. It does not create a customer account, CRM profile, customer history, or collection workflow.

## 8. Daily reporting rules

The backend groups transactions by the business/branch timezone, not by the server’s timezone. V1 should default to Tanzania time unless a future multi-country configuration is approved.

Daily reports include business and branch identity, selected date, total sales, payment-method totals, debt total, stock received, and transaction summaries. Profit and expense calculations are excluded.

## 9. Minimum domain tables

The implementation may divide or rename tables, but it must preserve these concepts:

| Area | Core records | Built |
|---|---|---|
| Organization | businesses, branches, users, branch assignments, permissions | Phase 1, plus `UserPermission[]` on `User` in Phase 2 |
| Devices | devices, enrollment tokens, device sessions | Phase 2. A device session is the JWT's `deviceId` claim rather than a stored row — V1 is online-only and has no session table |
| Catalogue | products, units, product units, unit relationships, prices, barcodes | Phase 3. `Product`, `ProductUnit` (which carries the price), `UnitRelationship`, `Barcode`. There is no separate global unit table: a unit belongs to its product, because that is where its meaning is |
| Stock | stock receipts, stock receipt lines, stock movements, current physical stock | Phase 3. `StockReceipt`, `StockReceiptLine`, `StockMovement` (append-only), `PhysicalStock` (one row per branch per packaging) |
| Sales | sales, sale lines, payments, debts, receipts | Phase 4 |
| Settings | payment methods, business settings | Phase 4 seeds the defaults; Phase 6 owns the settings screen |
| Audit | actor, device, timestamps, idempotency records | `AuditEvent` in Phase 2 (actor, role, device, target, server-clock timestamp). Idempotency records arrive with sales in Phase 4 |

## 10. Mandatory engine tests

Tests must cover product-specific package factors, fixed conversions, cycle rejection, progressive product creation, physical stock breaking, no automatic repacking, single-unit auto-add, repeated scans, different-unit sale lines, price snapshots, conversion snapshots, cash change, mixed payment equality, debt-name capture, insufficient-stock protection, tenant isolation, permission enforcement, and idempotent sale submission.

## References

[1]: /home/ubuntu/upload/SHOPREX_V1_Approved_Implementation_Spec.md "SHOPREX V1 Approved Implementation Specification"
