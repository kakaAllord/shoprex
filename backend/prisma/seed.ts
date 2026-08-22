/**
 * Development seed.
 *
 * Creates the two accounts the web login form offers for one-click sign-in:
 * a Shoprex platform administrator and a shop owner with one demo branch.
 *
 * Safe to run repeatedly — every record is upserted. It refuses to run when
 * NODE_ENV is production, so seeded passwords can never reach a real shop.
 */
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed development accounts in production');
  }

  const adminEmail = (process.env.DEV_ADMIN_EMAIL ?? 'admin@shoprex.co.tz').toLowerCase();
  const ownerEmail = (process.env.DEV_OWNER_EMAIL ?? 'owner@shoprex.co.tz').toLowerCase();
  const password = process.env.DEV_SEED_PASSWORD ?? 'shoprex12345';
  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash, role: UserRole.PLATFORM_ADMIN, isActive: true },
    create: {
      email: adminEmail,
      passwordHash,
      fullName: 'Shoprex Platform Admin',
      role: UserRole.PLATFORM_ADMIN,
    },
  });

  let business = await prisma.business.findFirst({ where: { name: 'Duka la Mfano' } });

  business ??= await prisma.business.create({
    data: { name: 'Duka la Mfano', timezone: 'Africa/Dar_es_Salaam' },
  });

  const owner = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {
      passwordHash,
      role: UserRole.OWNER,
      businessId: business.id,
      isActive: true,
      phone: '+255712000001',
    },
    create: {
      email: ownerEmail,
      phone: '+255712000001',
      passwordHash,
      fullName: 'Mmiliki wa Duka la Mfano',
      role: UserRole.OWNER,
      businessId: business.id,
    },
  });

  const branch = await prisma.branch.upsert({
    where: { businessId_name: { businessId: business.id, name: 'Tawi Kuu' } },
    update: {},
    create: { businessId: business.id, name: 'Tawi Kuu' },
  });

  await prisma.appMetadata.upsert({
    where: { key: 'seeded_at' },
    update: { value: new Date().toISOString() },
    create: { key: 'seeded_at', value: new Date().toISOString() },
  });

  console.log('Seeded development accounts:');
  console.log(`  platform admin  ${admin.email} / ${password}`);
  console.log(`  shop owner      ${owner.email} / ${password}`);
  console.log(`  business        ${business.name} (branch: ${branch.name})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
