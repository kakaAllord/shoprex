import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, Prisma, UserPermission } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { requireBusiness } from '../../common/tenancy';
import { PrismaService } from '../../database/prisma.service';
import { normalizeBarcode } from '../../domain/barcode';
import { UnitGraph, UnitGraphError, assertFixedConversionRespected } from '../../domain/units';
import { AuditService } from '../audit/audit.service';
import { actorFrom } from '../users/users.service';
import { AddProductUnitDto } from './dto/add-product-unit.dto';
import { AttachBarcodeDto } from './dto/attach-barcode.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { SearchProductsDto } from './dto/search-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductUnitDto } from './dto/update-product-unit.dto';

export interface ProductUnitView {
  id: string;
  name: string;
  /** Whole Tanzanian shillings. Null until the shop has priced it. */
  priceTzs: number | null;
  /** How many base units one of these contains. */
  factorToBase: number;
  isBaseUnit: boolean;
  barcodes: string[];
}

export interface ProductView {
  id: string;
  name: string;
  isActive: boolean;
  units: ProductUnitView[];
  relationships: Array<{ parentUnitId: string; childUnitId: string; factor: number }>;
  baseUnitId: string;
  barcodes: string[];
  createdAt: Date;
}

type ProductRecord = Prisma.ProductGetPayload<{
  include: {
    units: { include: { barcodes: true } };
    relationships: true;
    barcodes: true;
  };
}>;

const PRODUCT_INCLUDE = {
  units: { include: { barcodes: true } },
  relationships: true,
  barcodes: true,
} satisfies Prisma.ProductInclude;

/** Creating a product is something a seller or a receiver may need to do. */
export const PRODUCT_WRITE_PERMISSIONS = [
  UserPermission.SELL,
  UserPermission.RECEIVE_STOCK,
];

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Creates a product with however much the shop knows right now.
   *
   * The minimum is a name and one unit — doc 01 §5 is explicit that Shoprex
   * must not force catalogue setup before a shop can sell. A price, a barcode,
   * and the relationship to a smaller unit can all arrive later.
   */
  async create(principal: AuthenticatedUser, dto: CreateProductDto): Promise<ProductView> {
    const businessId = requireBusiness(principal);
    const name = dto.name.trim();

    if (await this.prisma.product.findFirst({ where: { businessId, name } })) {
      throw new ConflictException('Bidhaa yenye jina hilo ipo tayari · A product with that name already exists');
    }

    const unitNames = dto.units.map((unit) => unit.name.trim());

    if (new Set(unitNames.map((unit) => unit.toLowerCase())).size !== unitNames.length) {
      throw new BadRequestException('Each unit of a product needs a different name');
    }

    // Relationships are given by unit *name*, because the units do not have ids
    // until this transaction creates them.
    for (const relation of dto.relationships ?? []) {
      this.assertNamesExist(unitNames, [relation.parentUnit, relation.childUnit]);
      this.assertFixedConversion(relation.parentUnit, relation.childUnit, relation.factor);
    }

    const barcode = this.resolveBarcode(dto.barcode);

    if (barcode) {
      await this.assertBarcodeFree(businessId, barcode);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          businessId,
          name,
          units: {
            create: dto.units.map((unit) => ({
              name: unit.name.trim(),
              priceTzs: unit.priceTzs ?? null,
            })),
          },
        },
        include: { units: true },
      });

      const unitIdByName = new Map(
        product.units.map((unit) => [unit.name.toLowerCase(), unit.id]),
      );

      const relations = (dto.relationships ?? []).map((relation) => ({
        parentUnitId: unitIdByName.get(relation.parentUnit.trim().toLowerCase())!,
        childUnitId: unitIdByName.get(relation.childUnit.trim().toLowerCase())!,
        factor: relation.factor,
      }));

      // Validated before anything is written, so an impossible graph cannot
      // leave half a product behind.
      this.buildGraph(
        product.units.map((unit) => unit.id),
        relations,
      );

      if (relations.length > 0) {
        await tx.unitRelationship.createMany({
          data: relations.map((relation) => ({ productId: product.id, ...relation })),
        });
      }

      if (barcode) {
        await tx.barcode.create({
          data: {
            businessId,
            productId: product.id,
            productUnitId: dto.barcodeUnit
              ? (unitIdByName.get(dto.barcodeUnit.trim().toLowerCase()) ?? null)
              : null,
            value: barcode,
          },
        });
      }

      await this.audit.record(
        actorFrom(principal),
        {
          businessId,
          action: AuditAction.PRODUCT_CREATED,
          targetType: 'Product',
          targetId: product.id,
          summary: `Bidhaa ${name} imeongezwa · Product ${name} created`,
        },
        tx,
      );

      return tx.product.findUniqueOrThrow({
        where: { id: product.id },
        include: PRODUCT_INCLUDE,
      });
    });

    this.logger.log(`Product created: ${created.id} in business ${businessId}`);

    return this.toView(created);
  }

  /**
   * Adds a unit to a product that already exists — the progressive enrichment
   * doc 02 §4 calls for. The new unit must connect to the ones already there,
   * so the product keeps exactly one smallest unit doing the arithmetic.
   */
  async addUnit(
    principal: AuthenticatedUser,
    productId: string,
    dto: AddProductUnitDto,
  ): Promise<ProductView> {
    const businessId = requireBusiness(principal);
    const product = await this.requireProduct(principal, productId);
    const name = dto.name.trim();

    if (product.units.some((unit) => unit.name.toLowerCase() === name.toLowerCase())) {
      throw new ConflictException('Bidhaa hii tayari ina kipimo hicho · That product already has a unit with that name');
    }

    const related = product.units.find((unit) => unit.id === dto.relatedUnitId);

    if (!related) {
      throw new NotFoundException('That unit does not belong to this product');
    }

    const [parentName, childName] =
      dto.contains === 'RELATED'
        ? [name, related.name]
        : [related.name, name];

    this.assertFixedConversion(parentName, childName, dto.factor);

    const barcode = this.resolveBarcode(dto.barcode);

    if (barcode) {
      await this.assertBarcodeFree(businessId, barcode);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const unit = await tx.productUnit.create({
        data: { productId: product.id, name, priceTzs: dto.priceTzs ?? null },
      });

      const relation =
        dto.contains === 'RELATED'
          ? { parentUnitId: unit.id, childUnitId: related.id, factor: dto.factor }
          : { parentUnitId: related.id, childUnitId: unit.id, factor: dto.factor };

      const unitIds = [...product.units.map((existing) => existing.id), unit.id];
      const relations = [
        ...product.relationships.map((existing) => ({
          parentUnitId: existing.parentUnitId,
          childUnitId: existing.childUnitId,
          factor: existing.factor,
        })),
        relation,
      ];

      this.buildGraph(unitIds, relations);

      await tx.unitRelationship.create({ data: { productId: product.id, ...relation } });

      if (barcode) {
        await tx.barcode.create({
          data: {
            businessId,
            productId: product.id,
            productUnitId: unit.id,
            value: barcode,
          },
        });
      }

      await this.audit.record(
        actorFrom(principal),
        {
          businessId,
          action: AuditAction.PRODUCT_UNIT_ADDED,
          targetType: 'Product',
          targetId: product.id,
          summary: `Kipimo ${name} kimeongezwa kwa ${product.name} · Unit ${name} added to ${product.name}`,
        },
        tx,
      );

      return tx.product.findUniqueOrThrow({
        where: { id: product.id },
        include: PRODUCT_INCLUDE,
      });
    });

    return this.toView(updated);
  }

  /**
   * Renaming or discontinuing a product. Owners only.
   *
   * Deferred here from Phase 3 on purpose - §3 known issue 3 - because product
   * management is this console's job. It stays owner-only for the same reason
   * `POST /branches` and `PATCH /users/{id}/permissions` do: what the shop
   * carries and what it charges are business-wide decisions, and a seller who
   * needs an unknown item on the shelf already has `POST /products`.
   *
   * Discontinuing does not delete. Doc 02 §6 is explicit that history is
   * history: every completed sale snapshotted its own product name and price,
   * so nothing here can reach backwards.
   */
  async update(
    principal: AuthenticatedUser,
    productId: string,
    dto: UpdateProductDto,
  ): Promise<ProductView> {
    const businessId = requireBusiness(principal);
    const product = await this.requireProduct(principal, productId);
    const name = dto.name?.trim();

    if (name === undefined && dto.isActive === undefined) {
      throw new BadRequestException('Nothing to change - supply a name, isActive, or both');
    }

    if (name !== undefined && name.toLowerCase() !== product.name.toLowerCase()) {
      const clash = await this.prisma.product.findFirst({ where: { businessId, name } });

      if (clash) {
        throw new ConflictException(
          'Bidhaa yenye jina hilo ipo tayari · A product with that name already exists',
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.product.update({
        where: { id: product.id },
        data: {
          ...(name === undefined ? {} : { name }),
          ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
        },
        include: PRODUCT_INCLUDE,
      });

      await this.audit.record(
        actorFrom(principal),
        {
          businessId,
          action: AuditAction.PRODUCT_UPDATED,
          targetType: 'Product',
          targetId: product.id,
          summary: describeProductUpdate(
            product.name,
            saved.name,
            product.isActive,
            saved.isActive,
          ),
        },
        tx,
      );

      return saved;
    });

    return this.toView(updated);
  }

  /**
   * Repricing or renaming one packaging. Owners only.
   *
   * The audit line records what the price *was* as well as what it became.
   * "Why is a crate 7,000 now?" is a question an owner asks weeks later, and
   * the sale lines cannot answer it - they hold what was charged, not when
   * somebody changed the number.
   */
  async updateUnit(
    principal: AuthenticatedUser,
    productId: string,
    unitId: string,
    dto: UpdateProductUnitDto,
  ): Promise<ProductView> {
    const businessId = requireBusiness(principal);
    const product = await this.requireProduct(principal, productId);
    const unit = product.units.find((candidate) => candidate.id === unitId);

    if (!unit) {
      throw new NotFoundException('That unit does not belong to this product');
    }

    const name = dto.name?.trim();

    if (name === undefined && dto.priceTzs === undefined) {
      throw new BadRequestException('Nothing to change - supply a name, priceTzs, or both');
    }

    if (
      name !== undefined &&
      product.units.some(
        (other) => other.id !== unit.id && other.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      throw new ConflictException(
        'Bidhaa hii tayari ina kipimo hicho · That product already has a unit with that name',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.productUnit.update({
        where: { id: unit.id },
        data: {
          ...(name === undefined ? {} : { name }),
          ...(dto.priceTzs === undefined ? {} : { priceTzs: dto.priceTzs }),
        },
      });

      if (dto.priceTzs !== undefined && dto.priceTzs !== unit.priceTzs) {
        await this.audit.record(
          actorFrom(principal),
          {
            businessId,
            action: AuditAction.PRODUCT_PRICE_CHANGED,
            targetType: 'ProductUnit',
            targetId: unit.id,
            summary: `Bei ya ${product.name} (${saved.name}): ${unit.priceTzs ?? 'haijawekwa'} → ${dto.priceTzs} TSh`,
          },
          tx,
        );
      }

      if (name !== undefined && name !== unit.name) {
        await this.audit.record(
          actorFrom(principal),
          {
            businessId,
            action: AuditAction.PRODUCT_UPDATED,
            targetType: 'ProductUnit',
            targetId: unit.id,
            summary: `Kipimo cha ${product.name}: ${unit.name} → ${name}`,
          },
          tx,
        );
      }

      return tx.product.findUniqueOrThrow({
        where: { id: product.id },
        include: PRODUCT_INCLUDE,
      });
    });

    return this.toView(updated);
  }

  /**
   * Attaching a barcode to a product that already exists. Owners only.
   *
   * Phase 3 could put a code on a product at creation or on a unit as it was
   * added, but a product typed in without one had no way to acquire it later
   * (§3 known issue 2). A shop that spent its first busy week adding items by
   * name has a drawer full of exactly that problem.
   *
   * Barcodes stay unique **per tenant**: two shops may stock the same item, so
   * the clash that matters is one inside this business.
   */
  async attachBarcode(
    principal: AuthenticatedUser,
    productId: string,
    dto: AttachBarcodeDto,
  ): Promise<ProductView> {
    const businessId = requireBusiness(principal);
    const product = await this.requireProduct(principal, productId);
    const value = this.resolveBarcode(dto.barcode);

    if (!value) {
      throw new BadRequestException(
        'Namba ya bidhaa si sahihi · That is not a valid EAN-13 barcode',
      );
    }

    if (dto.productUnitId && !product.units.some((unit) => unit.id === dto.productUnitId)) {
      throw new NotFoundException('That unit does not belong to this product');
    }

    await this.assertBarcodeFree(businessId, value);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.barcode.create({
        data: {
          businessId,
          productId: product.id,
          productUnitId: dto.productUnitId ?? null,
          value,
        },
      });

      await this.audit.record(
        actorFrom(principal),
        {
          businessId,
          action: AuditAction.BARCODE_ATTACHED,
          targetType: 'Product',
          targetId: product.id,
          summary: `Namba ${value} imeunganishwa na ${product.name} · Barcode ${value} attached to ${product.name}`,
        },
        tx,
      );

      return tx.product.findUniqueOrThrow({
        where: { id: product.id },
        include: PRODUCT_INCLUDE,
      });
    });

    return this.toView(updated);
  }

  /**
   * Manual search suggestions. Matches anywhere in the name rather than only at
   * the start, because a seller types "coke" for "Coca-Cola 500ml".
   */
  async search(principal: AuthenticatedUser, dto: SearchProductsDto): Promise<ProductView[]> {
    const businessId = requireBusiness(principal);

    const products = await this.prisma.product.findMany({
      where: {
        businessId,
        isActive: true,
        ...(dto.query ? { name: { contains: dto.query.trim(), mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
      take: dto.limit,
      include: PRODUCT_INCLUDE,
    });

    return products.map((product) => this.toView(product));
  }

  /**
   * Barcode lookup — the fast path on the selling screen. A code that does not
   * normalise is rejected outright rather than searched for, so a mis-scan is
   * reported as a mis-scan instead of "not found".
   */
  async findByBarcode(principal: AuthenticatedUser, raw: string): Promise<ProductView> {
    const businessId = requireBusiness(principal);
    const value = normalizeBarcode(raw);

    if (!value) {
      throw new BadRequestException(
        'Namba ya bidhaa si sahihi · That is not a valid EAN-13 barcode',
      );
    }

    const barcode = await this.prisma.barcode.findUnique({
      where: { businessId_value: { businessId, value } },
      include: { product: { include: PRODUCT_INCLUDE } },
    });

    if (!barcode) {
      throw new NotFoundException('Bidhaa haijapatikana · No product with that barcode');
    }

    return this.toView(barcode.product);
  }

  async findOne(principal: AuthenticatedUser, productId: string): Promise<ProductView> {
    return this.toView(await this.requireProduct(principal, productId));
  }

  /**
   * The unit names this shop already uses, most-used first.
   *
   * A seller adding a product mid-sale should be picking from a list, not
   * spelling "Kipande" under time pressure at a counter — and a shop that
   * writes it three different ways ends up with three units that mean the same
   * thing. Ordering by how often a name is already used puts the shop's own
   * habits at the top, which is a better suggestion than any list Shoprex
   * could have guessed.
   *
   * The client merges this with a small set of common Swahili names, so a shop
   * on its very first day still has something to choose from.
   */
  async unitNames(principal: AuthenticatedUser): Promise<string[]> {
    const businessId = requireBusiness(principal);

    const rows = await this.prisma.productUnit.groupBy({
      by: ['name'],
      where: { product: { businessId } },
      _count: { name: true },
      orderBy: { _count: { name: 'desc' } },
      take: 50,
    });

    return rows.map((row) => row.name);
  }

  /** A product in another tenant answers 404, never 403. */
  private async requireProduct(
    principal: AuthenticatedUser,
    productId: string,
  ): Promise<ProductRecord> {
    const businessId = requireBusiness(principal);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, businessId },
      include: PRODUCT_INCLUDE,
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  private assertNamesExist(unitNames: string[], referenced: string[]): void {
    const known = new Set(unitNames.map((name) => name.toLowerCase()));

    for (const name of referenced) {
      if (!known.has(name.trim().toLowerCase())) {
        throw new BadRequestException(
          `A relationship names "${name}", which is not one of this product's units`,
        );
      }
    }
  }

  private resolveBarcode(raw?: string): string | null {
    if (!raw || raw.trim().length === 0) {
      return null;
    }

    const value = normalizeBarcode(raw);

    if (!value) {
      throw new BadRequestException(
        'Namba ya bidhaa si sahihi · That is not a valid EAN-13 barcode',
      );
    }

    return value;
  }

  private async assertBarcodeFree(businessId: string, value: string): Promise<void> {
    const clash = await this.prisma.barcode.findUnique({
      where: { businessId_value: { businessId, value } },
    });

    if (clash) {
      throw new ConflictException(
        'Namba hii ya bidhaa tayari inatumika · That barcode already belongs to another product',
      );
    }
  }

  /**
   * A shop redefining `1 kg = 900 g` has made a mistake worth reporting, not
   * one worth crashing on: the domain throws, and the caller sees a 400.
   */
  private assertFixedConversion(parentName: string, childName: string, factor: number): void {
    this.asBadRequest(() =>
      assertFixedConversionRespected(parentName, childName, factor),
    );
  }

  /** Turns a UnitGraphError into a 400 rather than a 500. */
  private buildGraph(
    unitIds: string[],
    relations: Array<{ parentUnitId: string; childUnitId: string; factor: number }>,
  ): UnitGraph {
    return this.asBadRequest(() => UnitGraph.build(unitIds, relations));
  }

  private asBadRequest<T>(work: () => T): T {
    try {
      return work();
    } catch (error) {
      if (error instanceof UnitGraphError) {
        throw new BadRequestException(error.message);
      }

      throw error;
    }
  }

  private toView(product: ProductRecord): ProductView {
    const relations = product.relationships.map((relation) => ({
      parentUnitId: relation.parentUnitId,
      childUnitId: relation.childUnitId,
      factor: relation.factor,
    }));

    const graph = this.buildGraph(
      product.units.map((unit) => unit.id),
      relations,
    );

    return {
      id: product.id,
      name: product.name,
      isActive: product.isActive,
      units: product.units
        .map((unit) => ({
          id: unit.id,
          name: unit.name,
          priceTzs: unit.priceTzs,
          factorToBase: graph.factorToBase(unit.id),
          isBaseUnit: unit.id === graph.baseUnitId,
          barcodes: unit.barcodes.map((barcode) => barcode.value),
        }))
        .sort((a, b) => b.factorToBase - a.factorToBase),
      relationships: relations,
      baseUnitId: graph.baseUnitId,
      barcodes: product.barcodes.map((barcode) => barcode.value),
      createdAt: product.createdAt,
    };
  }
}

/**
 * One audit line for a product edit, saying which of the two things changed.
 * Written out rather than assembled inline so the strings stay readable.
 */
function describeProductUpdate(
  wasName: string,
  isName: string,
  wasActive: boolean,
  isActive: boolean,
): string {
  const parts: string[] = [];

  if (wasName !== isName) {
    parts.push(`jina: ${wasName} → ${isName}`);
  }

  if (wasActive !== isActive) {
    parts.push(isActive ? 'imerudishwa sokoni · restored' : 'imesitishwa · discontinued');
  }

  return `${isName}${parts.length > 0 ? ` (${parts.join(', ')})` : ' (hakuna mabadiliko)'}`;
}
