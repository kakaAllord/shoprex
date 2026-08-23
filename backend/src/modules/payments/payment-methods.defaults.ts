import { Prisma, PaymentMethodKind } from '@prisma/client';

/**
 * The payment methods every new shop starts with.
 *
 * Deliberately three, and deliberately generic. Doc 01 §7 says a shop
 * *configures* the methods it accepts — M-Pesa, Airtel Money, a bank — and
 * Phase 6 owns the screen where they do that. Seeding provider names here
 * would put words in a shop's mouth before anyone asked, and a shop that does
 * not use Airtel Money would have to go and delete it.
 *
 * So Shoprex ships the three shapes of settlement a Tanzanian shop always has:
 * money in hand, money on a phone, and money still owed. Names are Swahili
 * because the interface is Swahili-first, and the owner can rename any of them.
 *
 * `Deni` being a method rather than a checkbox is what makes doc 01 §5's "when
 * the owner permits a debt sale" enforceable: an owner who does not sell on
 * credit deactivates it, and it stops appearing at checkout.
 */
export const DEFAULT_PAYMENT_METHODS: ReadonlyArray<{
  name: string;
  kind: PaymentMethodKind;
  sortOrder: number;
}> = [
  { name: 'Taslimu', kind: PaymentMethodKind.CASH, sortOrder: 0 },
  { name: 'Pesa ya simu', kind: PaymentMethodKind.MOBILE_MONEY, sortOrder: 1 },
  { name: 'Deni', kind: PaymentMethodKind.DEBT, sortOrder: 2 },
];

/**
 * Gives a business the default set. Runs inside whatever transaction created
 * the business, so a shop is never left existing but unable to take money.
 *
 * `skipDuplicates` makes it safe to call again on a business that already has
 * them — which is what lets the seed re-run without failing.
 */
export async function createDefaultPaymentMethods(
  tx: Prisma.TransactionClient,
  businessId: string,
): Promise<void> {
  await tx.paymentMethod.createMany({
    data: DEFAULT_PAYMENT_METHODS.map((method) => ({ businessId, ...method })),
    skipDuplicates: true,
  });
}
