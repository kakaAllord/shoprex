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

The device flow is designed to remove setup friction. **One phone belongs to a
branch** — that is the decision everything else here follows from.

1. The owner creates the worker: a name, a password, and the branch they work in. Shoprex mints the worker's internal id at that moment, for database identity and audit attribution — never as a sign-in secret.
2. The owner issues a **one-time enrollment code** for a branch, naming the phone so they can tell their handsets apart, and hands the code over.
3. Whoever is holding the phone opens Shoprex and enters the code. The backend mints the `device_id`, binds that installation to the business and the branch, and the app stores the id.
4. From then on, **anyone who works at that branch** signs in on that phone: they tap their name and type their own password. No code, and no email — workers never had one.

**Only owners issue enrollments.** Not platform administrators. Confirmed
2026-08-22.

**A phone is shared, and the person signing in is the attribution.** Changed
2026-08-23, replacing the original one-device-per-worker rule. The reason is
operational: a flat battery, a phone left at home, or a handset that simply
stops should not end somebody's shift. Anyone assigned to the branch can pick up
any of that branch's phones and carry on.

Because a handset no longer identifies anybody, sign-in has to. The phone shows
the people who work at that branch — plus the owner, who reaches every branch —
and the worker taps their name and proves it with their password. **Choosing a
name grants nothing**; the password is the only credential, and the backend
re-checks that the person really is assigned to that phone's branch. Somebody
from the next branch over is refused even with the right password.

Every sale and every stock movement records **both** the person and the
handset, so "who sold this?" is answered by the session rather than by the
device, and "which phone was it rung up on?" is still answered too.

**A branch may hold as many phones as it needs** — a counter phone and a
back-room phone is ordinary. The old rule that refused a second device until the
first was revoked is gone with the model that needed it.

Revocation remains part of the daily flow for a lost or stolen phone. A revoked
device is refused by the backend on its very next request — not merely hidden in
the app — so it cannot record a sale or a stock movement whatever the phone
believes, and it will not even say who works at that branch any more.

## 5. The selling experience

The main screen should make selling the obvious action.

**As built in Phase 4**, exactly as drawn below, with one addition: when the
shop has not yet priced a product, Shoprex says so instead of adding it at a
guessed price.

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

**As built in Phase 5 — receiving a delivery, and looking at the shelf.**

A person granted **Pokea mzigo** finds what arrived the same three ways they
would find something to sell — scan it, type its name, or add it if the shop
has never carried it — then says how many arrived and, if the shop records
such things, what one of them cost. The packaging is asked for **only when the
product has more than one**; a shop that counts only Gunia is never asked.

**A delivery needs no selling price.** This is the one place the two flows
differ on purpose. Selling cannot invent a price and refuses without one, but
putting a box on a shelf plainly can happen before anybody has decided what to
charge — most obviously for an item added while unpacking. So an item created
during receiving is created unpriced, is shelved immediately, and the app says
it cannot be sold until the shop prices it. That is progressive enrichment
doing exactly what this section describes.

The whole delivery is recorded in **one** action, because the backend records
it as one transaction: a delivery that fails on its third line puts none of it
on the shelf, so there is never a half-received state for anyone to unpick.
What the shop paid is optional per line and is stored as stated; V1 does no
profit accounting with it.

**Stoo** shows what the branch holds in the words a shopkeeper would use —
`5 Carton + 5 Piece`, never the normalized figure underneath, and never a
rolled-up `9.67 Cartons`. A **negative** balance appears in that list rather
than being filtered out of it, marked in amber and named as something to
recount: it is the shop being told its count is wrong and by how much, and a
later delivery settles it with nobody doing arithmetic by hand.

## 7. Payments, receipts, and reporting

The shop configures the payment methods it accepts, such as Cash, M-Pesa, Airtel Money, Bank, or another local method. V1 supports cash change calculation, mixed payments, and simple debt recording with a debtor name. It does not integrate directly with mobile-money providers in the first release; the seller records the payment method.

Every completed sale creates a receipt containing the actual commercial units sold. The receipt can be viewed, shared using the phone’s normal share function, or skipped so the seller can begin another sale. **Printing is not part of V1** — confirmed by the owner on 2026-08-23, it is a next-version feature. See §8.

**As built in Phase 4.** Every shop starts with three payment methods —
**Taslimu** (cash), **Pesa ya simu** (mobile money), and **Deni** (debt) — and
the owner renames, adds to, or switches them off from the web console in Phase
6. Only active methods appear at checkout, so switching `Deni` off is how an
owner says their shop does not sell on credit; the backend refuses a debt sale
after that, not just the button.

**Shoprex never refuses a sale because its own count disagrees.** The person at
the counter is holding the item, so the shop has it. Selling more than the
records show completes normally, the balance goes negative, and the owner gets
an inconsistency to recount — the seller is told the count was short, never that
the sale failed. This matters most for an item added mid-sale, which by
definition has no stock recorded against it yet. Confirmed by the owner
2026-08-23.

**Units are chosen, not typed.** When a product is added mid-sale, the unit —
Kipande, Chupa, Kreti — is picked from a list of what the shop already uses,
with common Swahili names offered on the first day. Only a genuinely new unit is
typed, and then it is added with a green **+** at the end of the search box. A
shop that spelled one unit three different ways would end up with three units
that mean the same thing and no way to add them together.

The seller taps a method and it fills in whatever is still owed, so an ordinary
sale is one tap. Tapping a second method turns the same sheet into a mixed
payment. Cash change is worked out by the backend from what the customer
actually handed over, and a debt asks for a name and nothing else.

The receipt shows the commercial units sold — `2 Cartons`, `5 Pieces` — never
the normalized arithmetic underneath. It can be viewed, shared through the
phone's own share sheet, or skipped straight into the next sale. Sharing uses
React Native's built-in share sheet, so it needs no extra dependency and works
with whatever the phone already has — WhatsApp, SMS, Bluetooth.

**Printing is deliberately not here.** The owner confirmed on 2026-08-23 that it
belongs to the next version, not V1. Most small Tanzanian shops have no receipt
printer, and building for one would have meant a printing dependency and a
hardware story that the first release does not need. Nothing in the sale or the
receipt forecloses it: the receipt is a view over data the backend already
holds, so adding printing later reads only the same sale.

The web dashboard automatically groups activity by the shop’s local calendar day. Owners and authorized managers can view daily sales totals, payment-method totals, debts, stock received, current stock, worker totals, and branch comparisons. V1 includes an in-app report and PDF download. Automatic external delivery of reports is deliberately postponed until the core product is proven.

## 8. What V1 does not include

V1 does not include customer accounts, CRM, customer history, returns, refunds, sale corrections, expenses, profit accounting, supplier management, purchase orders, e-commerce, delivery, loyalty, visual product recognition, branch stock transfers, mobile-money API integration, **receipt printing**, or offline multi-device synchronization.

Receipt printing was confirmed as a next-version feature on 2026-08-23. V1 receipts are viewed on the phone or shared through its normal share function.

Multiple devices may be registered and used at the same time in V1, but they must be online. The backend is the source of truth. Offline-first operation and conflict resolution are a later subscription or product tier, not a launch blocker.

## 9. What success looks like

A real shop should be able to create its account, connect a device, add a product during the first sale, complete a barcode or typed sale in a few clear actions, see stock change immediately, and allow the owner to understand the day from the web dashboard without maintaining a spreadsheet.

## References


[2]: https://claude.ai/code/artifact/7ecc4806-15af-4018-950f-4bb7a1c1a6dc "Shoprex Claude design artifact"
