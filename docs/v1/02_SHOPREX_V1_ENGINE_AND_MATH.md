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
| Worker | Assigned branch | Sell, receive stock, view stock, or view totals only when permitted. Signs in by name and password on any phone enrolled to their branch, not by email |

The owner may act as the manager for a branch. The data model must also support creating a separate manager later without forcing the owner to create a duplicate owner account.

**As built in Phase 6 — suspending a shop account.** `Business.isActive` is now
enforced, and enforced *everywhere at once*. A platform administrator sets it
through `PATCH /businesses/{id}`; sign-in already refused a suspended shop
(`AuthService.login`, `loginDevice`, `deviceSignInOptions`, and
`DevicesService.redeemEnrollment` all check it), and `BusinessActiveGuard`
closes the remaining gap by refusing **tokens that were issued before the
suspension**, on their very next request. An account that is suspended
everywhere except in the sessions already open is not suspended, and an
eight-hour token is a long time to leave a door open. This is the same rule
device revocation chose in Phase 2, for the same reason.

The refusal is **403, not 401**: the credentials are perfectly good, and telling
somebody to sign in again would send them round a loop ending in the same
place. Platform administrators carry no `business_id` and are unaffected.

Suspension **deletes nothing and cascades nowhere**. Products, stock, sales,
and history stay exactly as they are, and restoring the account brings the shop
back whole — which is what makes it a safe thing for a platform administrator
to do, and a safe thing to undo.

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

**As built in Phase 2, revised 2026-08-23.** `Device` carries the business and
the **branch** it belongs to; a server-minted uuid `id` *is* the `device_id`; a
`DeviceStatus` of `ACTIVE` or `REVOKED`; `lastSeenAt`, `revokedAt`, and
`revokedById`. It carries no `userId`: a phone belongs to a branch and is shared
by everyone who works there, so that a flat battery does not end a shift. The
`name` is a label the owner chooses — "Simu ya kaunta" — never an identity.

**The QR arrived in the Phase 7 session**, at the owner's request, and it is
what this section always specified: `POST /devices/enrollments` returns the
one-time code together with `qrSvg`, the same code drawn as a scannable SVG.
It is emphatically **not** a link — this section's "QR code *and link*" is
satisfied by the token alone, and a URL would have added a second thing to
keep in step with the first for no gain. The payload is the bare code, so
scanning and typing submit an identical string and there is one redemption
path with one set of rules.

Because the picture *is* the credential rather than a picture about it, it
carries every rule the code carries: returned once at issue, never persisted,
never logged, and absent from the audit summary. `test/openapi.e2e-spec.ts`
names `qrSvg` alongside `code` and `password` in its response-leak walk, so it
cannot later appear on a device view on the grounds that an image is harmless.

There is no device password hash. The credential is a *reference* to the signing
-in person's own password — the "or equivalent credential reference" this
section allows — so there is one password in one place with no drift between
copies of it.

Because the handset no longer identifies anybody, **sign-in does**.
`POST /auth/device/login` takes the `device_id`, the `userId` of whoever is
signing in, and that person's password. The `userId` is not a secret and never
was: `GET /auth/device/{deviceId}/people` hands the sign-in screen the names of
everyone assigned to that phone's branch, plus the owner. That endpoint is
unauthenticated by necessity — it runs before anybody has signed in — so it is
in the strict auth rate-limit bucket, returns **names and ids only**, and
answers `401` for a revoked or unknown device. Whoever holds the handset learns
who works at that branch, which is roughly what a rota on the wall tells them;
it is a deliberate disclosure, confined to one branch of one business by the
device id.

Authorization does not rest on the name list. The backend re-checks that the
person is assigned to that phone's branch — or is the owner, who reaches every
branch of their own business — before the password is even compared, and every
branch-scoped route re-checks it live on each request through
`requireBranchAccess`. Unassigning somebody ends their reach immediately rather
than whenever an eight-hour token expires.

**A per-worker PIN is still not needed, but for a different reason.** It used to
be unnecessary because the device identified one person. Now it is unnecessary
because the person identifies themselves and proves it with a real password. If
speed at the counter ever makes a short PIN worth the weaker credential, that is
a product decision and an ADR, not a quiet change.

`DeviceEnrollmentToken` stores the SHA-256 hash of the code and never the code
itself, plus the `branchId` the code will bind a phone to, the `deviceName` it
will be given, `expiresAt`, `usedAt`, and the `deviceId` a successful bind
produced. SHA-256 rather than bcrypt is deliberate: redemption has to *find* the
row by the value presented, which needs a deterministic digest, and the input is
a high-entropy random code rather than a human-chosen password. `usedAt` is set
only by a bind that actually happened.

A revoked device is stopped by `DeviceSessionGuard`, which runs on every
device-authenticated request. That is one lookup per request, paid only by
device sessions; it is what makes revocation take effect immediately rather than
whenever the token happens to expire. It no longer checks that the device
belongs to the signed-in worker, because it no longer belongs to one.

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

**The negative-stock policy, approved by the owner on 2026-08-23.** This is the
exception the sentence above allows for, and it now governs every removal.

A sale is **never refused for want of a record.** The person selling is holding
the item; the shop plainly has it, whatever the count says, and refusing would
make Shoprex argue with physical reality in front of a customer. It is at its
most absurd on a product created moments earlier during the sale itself — of
course nothing has been received against it.

So `issue()` completes, the branch balance is allowed to go **negative**, and
the amount the records could not cover is returned as `shortfallNormalized` for
the caller to record. A negative balance is deliberate and self-correcting:
received minus sold always equals the balance, so a shop that sells 5 with 2
counted sits at -3, and a later delivery of 10 lands on the true 7 with nobody
doing arithmetic by hand. `describeState` and the branch stock list both show
negative lines rather than filtering them out — hiding the number would defeat
the point of keeping it.

This does **not** loosen the other rules. The engine still never repackages
upward: selling a Carton from twelve loose Pieces takes the Carton line to -1
and leaves the Pieces untouched, because nobody taped a box around them. And it
is not hiding a deficit "by changing units or prices" — no unit and no price
moves; a shortfall is recorded as a shortfall.

`SaleLine.shortfallNormalized` keeps it on the sale, and an
`AuditAction.STOCK_INCONSISTENCY` entry names the product, the branch, and the
amount, so the owner has something to recount rather than a negative number to
discover in a stock list weeks later. The seller sees a note on the receipt
saying the sale went through and the count was short — never that the sale
failed.

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

**As built in Phase 4.** `backend/src/domain/sale.ts` holds `lineTotal`,
`saleTotal`, and `settle` as pure functions beside `units.ts` and `stock.ts`.
Every amount crossing that module is checked to be a whole number of shillings:
there is no rounding step, because a fractional shilling is a bug upstream and
absorbing it would make a receipt disagree with its own total.

`SalesService.complete` is the atomic command. Everything — `Sale`,
`SaleLine[]`, `SalePayment[]`, the audit entry, and one
`StockService.issueWithin` per line — runs inside a single `$transaction`.
That is why Phase 3's `issueStock` was split: it used to open its own
transaction, and a stock write beside the sale rather than inside it would let
a sale that failed on its third line still have removed the first two lines'
stock.

Each `SaleLine` snapshots `productName`, `unitName`, `quantity`,
`unitPriceTzs`, `lineTotalTzs`, `conversionFactor`, and `normalizedQuantity`.
A unit with no price cannot be sold at all — a product may exist before it is
fully configured, but the price is the one thing a sale cannot invent.

**Idempotency** is a required `idempotencyKey`, unique per business. The cheap
path is a lookup before any work is done; the race — two identical requests
neither of which saw the other's row — is caught by the
`@@unique([businessId, idempotencyKey])` index, and the loser returns the
winner's sale rather than an error. The key is scoped to the business, so two
shops that both number their sales from 1 do not collide; reusing one key
across two branches of the *same* shop answers `409`, because that is not a
retry and returning the other branch's receipt would be worse than an error.

The same product and unit appearing on two lines of one sale is **refused**
rather than added up. The phone's cart is supposed to increment the line it
already has, and quietly summing them would hide that bug instead of surfacing
it.

**Discontinuing a product, as built in Phase 6.** `Product.isActive` is now
enforced, and enforced at exactly one place: `StockService.resolveUnit`, which
every write path to stock already goes through — receiving, selling, and the
bare issue — and which no read path goes through. So a discontinued item cannot
be sold or received (**409**, naming it), and yet:

- **Stoo still shows what is on the shelf.** The count does not stop being true
  because the shop stopped restocking.
- **Every past sale still reads the way it did.** Discontinuing is not
  deleting; the lines snapshotted their own names and prices.
- **A barcode scan still finds it**, deliberately. Answering "unknown code"
  would invite somebody to create a duplicate product carrying a barcode that
  is already taken; answering with the product lets the phone say *this was
  discontinued*. `mobile/src/domain/cart.ts` refuses it there, at the moment of
  the scan, rather than letting it reach the payment sheet and fail.

There is deliberately **no way to switch off a single packaging** or to unset a
price. The base unit cannot go without taking the arithmetic with it, and the
branch holds physical stock per unit; discontinuing the whole product is the
supported verb, and the narrower one needs rules nobody has written.

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

**As built in Phase 4.** `PaymentMethod` belongs to a business and carries a
`PaymentMethodKind` — `CASH`, `MOBILE_MONEY`, `BANK`, `DEBT`, or `OTHER`. The
**kind drives the arithmetic and comes from the stored record, never from the
request**: only `CASH` accepts `cashReceivedTzs` and produces change, and only
`DEBT` accepts a `debtorName`. A client cannot label an M-Pesa payment as cash
to make Shoprex calculate change for money nobody handed over.

Every business is created with three methods — **Taslimu**, **Pesa ya simu**,
and **Deni** — in the same transaction that creates the business, so no shop
exists without the ability to take money. They are deliberately generic rather
than named after providers: doc 01 §7 says a shop *configures* what it accepts,
and seeding "Airtel Money" would put words in the mouth of a shop that does not
use it. `GET /payment-methods` returns only **active** ones, and the sale
command refuses an inactive one, which is what makes doc 01 §5's "when the
owner permits a debt sale" enforceable — an owner who does not sell on credit
deactivates `Deni`.

**As built in Phase 6.** The settings screen exists, and with it `POST
/payment-methods` and `PATCH /payment-methods/{id}`, both owners only. Three
rules were fixed while building it:

- **`kind` is chosen at creation and never edited.** It is not a label — it
  decides the arithmetic — so a shop wanting a different kind adds a different
  method rather than reinterpreting the receipts that already settled against
  this one.
- **There is no delete, and there will not be one.**
  `SalePayment.paymentMethod` is `onDelete: Restrict`, so removing a method
  that has settled anything would either fail or take a receipt's meaning with
  it. Deactivating is also the truthful verb: the shop stopped accepting it, it
  did not stop having accepted it.
- **Renaming is safe** for the same reason a price edit is: every payment
  snapshots `methodName` and `methodKind` at the moment it settles, so renaming
  `Deni` tomorrow does not rewrite what last week's receipts say.

`GET /payment-methods` gained one optional query parameter, `includeInactive`,
restricted to owners. The settings screen needs it — a screen that cannot see a
switched-off method is one that cannot switch it back on — and nobody else
does. Anyone else asking is refused **403** rather than quietly handed the
active list: a client that believes it is seeing everything and is not would be
worse than an error.

A debt is a `SalePayment` row carrying a name, not a separate ledger. At most
one per sale: a bill is owed by one person, and two names on one bill is a
question about who actually owes it rather than something to guess at. Payments
must settle the total exactly — an overshoot is refused rather than treated as
change, because change is what a *cash* customer overpaid and is a separate
number that never touches the total.

The mobile app re-implements the same two formulas in
`mobile/src/domain/payment.ts` so the seller can see the change before handing
it over and so a disabled confirm button can say *why*. It decides nothing: the
backend recomputes all of it and refuses the sale if it does not add up.

## 8. Daily reporting rules

The backend groups transactions by the business/branch timezone, not by the server’s timezone. V1 should default to Tanzania time unless a future multi-country configuration is approved.

Daily reports include business and branch identity, selected date, total sales, payment-method totals, debt total, stock received, and transaction summaries. Profit and expense calculations are excluded.

**As built in Phase 7.** A shop-local day is resolved exactly once, by
[backend/src/domain/day-window.ts](../../backend/src/domain/day-window.ts):
`dayWindow(date, timezone)` turns a `YYYY-MM-DD` calendar date and
`Business.timezone` into the half-open UTC interval `[startUtc, endUtc)` that a
`createdAt` comparison actually uses, resolved through the platform's own IANA
database rather than a hard-coded offset — Tanzania has no daylight saving, but
the module is proven against zones that do, so it cannot quietly assume one.
`GET /branches/{branchId}/reports/daily` and the sales list's `?date=` filter
both call this and nothing else, which is what keeps them from disagreeing
about where one day ends and the next begins.

The figures — totals, the payment-method breakdown, debts grouped by name, per-
seller totals, best sellers by money taken, and what arrived — are pure
functions over already-snapshotted values in
[backend/src/domain/report.ts](../../backend/src/domain/report.ts): every input
is a value a sale or a receipt stored at the moment it happened
(`SaleLine.productName`, `SalePayment.methodName`, and so on), never a live join
back to `Product`, `ProductUnit`, or `PaymentMethod`. A method renamed mid-day
stays one row in that day's breakdown, and a report read back next month still
shows that month's prices and names.

The PDF is generated on the backend from **the same response** the dashboard
receives (`daily-report.pdf.ts`), composed with a small dependency-free writer,
[backend/src/domain/pdf.ts](../../backend/src/domain/pdf.ts). It computes
nothing — no total, no subtraction — so the dashboard and the PDF cannot come
to disagree; `test/reports.e2e-spec.ts` proves this by reading the totals back
out of the generated PDF bytes rather than trusting that the two paths agree.

## 9. Minimum domain tables

The implementation may divide or rename tables, but it must preserve these concepts:

| Area | Core records | Built |
|---|---|---|
| Organization | businesses, branches, users, branch assignments, permissions | Phase 1, plus `UserPermission[]` on `User` in Phase 2 |
| Devices | devices, enrollment tokens, device sessions | Phase 2. A device session is the JWT's `deviceId` claim rather than a stored row — V1 is online-only and has no session table |
| Catalogue | products, units, product units, unit relationships, prices, barcodes | Phase 3. `Product`, `ProductUnit` (which carries the price), `UnitRelationship`, `Barcode`. There is no separate global unit table: a unit belongs to its product, because that is where its meaning is |
| Stock | stock receipts, stock receipt lines, stock movements, current physical stock | Phase 3. `StockReceipt`, `StockReceiptLine`, `StockMovement` (append-only), `PhysicalStock` (one row per branch per packaging) |
| Sales | sales, sale lines, payments, debts, receipts | Phase 4. `Sale`, `SaleLine`, `SalePayment`. A **debt** is a payment row carrying a debtor name, not a separate ledger — V1 records a name and an amount and nothing more. A **receipt** is a view of a sale rather than a stored record: everything a receipt shows is already snapshotted on the sale, so storing it twice would only create two things that can disagree |
| Settings | payment methods, business settings | Phase 4. `PaymentMethod`, created with the business. Made writable in Phase 6 — add, rename, reorder, deactivate; never delete, and `kind` is fixed at creation |
| Audit | actor, device, timestamps, idempotency records | `AuditEvent` in Phase 2 (actor, role, device, target, server-clock timestamp), plus `SALE_COMPLETED` in Phase 4, and five console actions in Phase 6 — `PRODUCT_UPDATED`, `PRODUCT_PRICE_CHANGED`, `BARCODE_ATTACHED`, `PAYMENT_METHOD_CREATED`, `PAYMENT_METHOD_UPDATED`. Each answers a question the owner will actually ask of their own log: why did this price change, who attached this barcode, who switched `Deni` off. Suspending a shop account is deliberately **not** audited — that is a platform-administrator action, and nothing in V1 reads this log on their behalf, so the row would have no reader. The idempotency record is the `idempotencyKey` column on `Sale`, unique per business — a separate table would be a second place for the same fact to live |

## 10. Mandatory engine tests

Tests must cover product-specific package factors, fixed conversions, cycle rejection, progressive product creation, physical stock breaking, no automatic repacking, single-unit auto-add, repeated scans, different-unit sale lines, price snapshots, conversion snapshots, cash change, mixed payment equality, debt-name capture, **negative-stock handling and the inconsistency it records** (replacing insufficient-stock refusal, per §5), tenant isolation, permission enforcement, and idempotent sale submission.

Phase 6 adds: a price edit that does not rewrite a completed sale, a barcode
attached to a product created without one, a discontinued product refused by
both write paths while its stock stays readable, a switched-off payment method
refused at the backend rather than merely hidden, keyset paging on the sales
list that never repeats or skips a row, and a suspended shop account refusing a
token issued before the suspension.

## References

[1]: /home/ubuntu/upload/SHOPREX_V1_Approved_Implementation_Spec.md "SHOPREX V1 Approved Implementation Specification"
