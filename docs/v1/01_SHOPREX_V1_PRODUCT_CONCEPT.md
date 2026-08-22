# Shoprex V1 — Product Concept

**Status:** Confirmed product direction for V1  
**Market:** Tanzania first  
**Language:** Swahili-first, English-ready  
**Currency:** Tanzanian shilling (TSh)  
**Mobile target:** Android first

## 1. The idea in one paragraph

Shoprex turns an Android phone into a fast shop-selling and stock tool. A seller scans a barcode or types a product name, adjusts the quantity, completes payment, and immediately starts the next sale. If the product has never been added before, Shoprex asks for only the information needed to sell it now, saves it, and lets the owner complete the product details later. Every completed sale updates stock and becomes visible to the shop owner through the web dashboard.

> **Product promise:** Scan or search, choose or adjust, pay, and move fast.

## 2. The three-part product

| Part | Who uses it | Purpose |
|---|---|---|
| **Shoprex mobile app** | Sellers, workers, owners when operating a shop | Fast selling, barcode scanning, product search, inline product creation, payment, receipts, stock receiving, and worker access |
| **Shoprex web app** | Shoprex platform administrators, shop owners, and delegated managers | Create and manage shop accounts/devices, view sales and stock, manage products and workers, configure payment methods, and download reports |
| **One backend** | Shared by both apps | Authentication, roles, business isolation, products, stock mathematics, sales, payments, reports, device enrollment, and audit history |

The mobile app is the operational tool. The web app is the management and visibility tool. Both use the same backend; there is no competing second backend.

## 3. V1 users and responsibilities

**Shoprex platform administrator** manages the Shoprex platform and shop accounts. This role is separate from the owner of a shop and is not the daily cashier role.

**Shop owner** owns one or more shops or branches. The owner sees business-wide information, creates or manages branches, creates device enrollments, creates workers, and can delegate manager responsibilities to another person while retaining control of multiple shops.

**Delegated manager** is created by the owner and assigned to a branch or branches. The manager receives credentials and can carry out the permissions granted by the owner. This role is included in the data model but the owner remains the primary business decision-maker.

**Worker** uses the Shoprex mobile app to sell or receive stock according to the permissions assigned by the owner or manager. Workers do not need full web-dashboard access for V1.

## 4. Device enrollment

The device flow is designed to remove setup friction. One phone belongs to one
worker — that is the decision everything else here follows from.

1. The owner creates the worker: a name, a password, and the branch they work in. Shoprex mints the worker's internal id at that moment, for database identity and audit attribution — never as a sign-in secret.
2. The owner issues a **one-time enrollment code** for that worker and hands it over. The branch comes from the worker's own assignment, so a code cannot bind a phone to a branch the worker does not work in.
3. The worker opens Shoprex on the Android phone and enters the code. The backend mints the `device_id`, binds that installation to the business, branch, and worker, and the app stores the id.
4. From then on the worker signs in on that phone with their own password. No code, and no email — they never had one.

**Only owners issue enrollments.** Not platform administrators. Confirmed
2026-08-22.

**One device, one worker.** Because a device identifies exactly one person, the
device *is* the attribution, and V1 therefore needs no per-worker PIN. The
device carries the worker's own name so the owner can see at a glance whose
phone it is.

**A second phone is refused until the first is revoked.** Redeeming a code for a
worker who already holds an active device fails, naming the device they already
have, and Shoprex never silently moves the worker to the new handset. The
refusal does **not** consume the code, so a worker standing in the shop is not
stranded waiting for the owner to issue another one. Once the owner revokes the
old phone, the same code works.

That makes revocation part of the daily flow for a lost or stolen phone rather
than an administrative afterthought. A revoked device is refused by the backend
on its very next request — not merely hidden in the app — so it cannot record a
sale or a stock movement whatever the phone believes.

## 5. The selling experience

The main screen should make selling the obvious action.

```text
Open Mauzo
   ↓
Scan barcode or type product name
   ↓
Product found?
   ├── Yes → add immediately when only one sellable unit exists
   └── No  → add the product inline with name, unit, and price
   ↓
Adjust quantity or choose a unit when necessary
   ↓
Review cart
   ↓
Select payment or split payment
   ↓
Complete sale and show receipt
   ↓
Start a new sale
```

The app should not force catalogue setup before the shop can start selling. It should also not insert a customer-registration step into checkout. A simple debtor name may be recorded when the owner permits a debt sale.

## 6. Stock and product behavior

Shoprex supports barcode lookup and fast manual search. Product sizes are separate products, while packages such as Piece, Carton, Bale, Sack, Pack, or a custom name belong to the specific product. A carton may contain six pieces for one product and forty-eight for another.

The internal engine keeps rigorous stock mathematics, including physical states such as **5 Cartons + 5 Pieces**, but the everyday interface shows practical shop language rather than normalized ledger calculations. Products can be enriched progressively: the app asks for a conversion only when the current sale or stock receipt actually needs it.

## 7. Payments, receipts, and reporting

The shop configures the payment methods it accepts, such as Cash, M-Pesa, Airtel Money, Bank, or another local method. V1 supports cash change calculation, mixed payments, and simple debt recording with a debtor name. It does not integrate directly with mobile-money providers in the first release; the seller records the payment method.

Every completed sale creates a receipt containing the actual commercial units sold. The receipt can be viewed, printed, shared using the phone’s normal share function, or skipped so the seller can begin another sale.

The web dashboard automatically groups activity by the shop’s local calendar day. Owners and authorized managers can view daily sales totals, payment-method totals, debts, stock received, current stock, worker totals, and branch comparisons. V1 includes an in-app report and PDF download. Automatic external delivery of reports is deliberately postponed until the core product is proven.

## 8. What V1 does not include

V1 does not include customer accounts, CRM, customer history, returns, refunds, sale corrections, expenses, profit accounting, supplier management, purchase orders, e-commerce, delivery, loyalty, visual product recognition, branch stock transfers, mobile-money API integration, or offline multi-device synchronization.

Multiple devices may be registered and used at the same time in V1, but they must be online. The backend is the source of truth. Offline-first operation and conflict resolution are a later subscription or product tier, not a launch blocker.

## 9. What success looks like

A real shop should be able to create its account, connect a device, add a product during the first sale, complete a barcode or typed sale in a few clear actions, see stock change immediately, and allow the owner to understand the day from the web dashboard without maintaining a spreadsheet.

## References


[2]: https://claude.ai/code/artifact/7ecc4806-15af-4018-950f-4bb7a1c1a6dc "Shoprex Claude design artifact"
