import { PrismaClient, FieldType } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

interface SchemaFieldSeed {
  key: string;
  label_en: string;
  label_ru: string;
  label_uz: string;
  type: keyof typeof FieldType;
  required?: boolean;
  order?: number;
  options?: unknown;
  validation?: unknown;
}

interface CategorySeed {
  slug: string;
  name_en: string;
  name_ru: string;
  name_uz: string;
  iconKey?: string | null;
  isLeaf: boolean;
  schema?: SchemaFieldSeed[];
  children?: CategorySeed[];
}

async function upsertCategoryTree(
  node: CategorySeed,
  parentId: number | null,
  parentPath: number[],
  depth: number,
): Promise<void> {
  const existing = await prisma.category.findUnique({
    where: { slug: node.slug },
  });

  const persisted = await prisma.category.upsert({
    where: { slug: node.slug },
    update: {
      parentId,
      name_en: node.name_en,
      name_ru: node.name_ru,
      name_uz: node.name_uz,
      iconKey: node.iconKey ?? null,
      isLeaf: node.isLeaf,
      depth,
      path: existing ? [...parentPath, existing.id] : parentPath,
    },
    create: {
      slug: node.slug,
      name_en: node.name_en,
      name_ru: node.name_ru,
      name_uz: node.name_uz,
      iconKey: node.iconKey ?? null,
      isLeaf: node.isLeaf,
      depth,
      parentId,
      path: parentPath,
    },
  });

  // Fix path now that we know our id (covers the create case).
  const finalPath = [...parentPath, persisted.id];
  if (
    persisted.path.length !== finalPath.length ||
    persisted.path.some((id, i) => id !== finalPath[i])
  ) {
    await prisma.category.update({
      where: { id: persisted.id },
      data: { path: finalPath },
    });
  }

  if (node.isLeaf && node.schema && node.schema.length > 0) {
    const schema = await prisma.categorySchema.upsert({
      where: { categoryId: persisted.id },
      update: {},
      create: { categoryId: persisted.id },
    });

    for (const field of node.schema) {
      await prisma.schemaField.upsert({
        where: {
          schemaId_key: { schemaId: schema.id, key: field.key },
        },
        update: {
          label_en: field.label_en,
          label_ru: field.label_ru,
          label_uz: field.label_uz,
          type: FieldType[field.type],
          required: field.required ?? false,
          order: field.order ?? 0,
          options: (field.options as never) ?? null,
          validation: (field.validation as never) ?? null,
        },
        create: {
          schemaId: schema.id,
          key: field.key,
          label_en: field.label_en,
          label_ru: field.label_ru,
          label_uz: field.label_uz,
          type: FieldType[field.type],
          required: field.required ?? false,
          order: field.order ?? 0,
          options: (field.options as never) ?? null,
          validation: (field.validation as never) ?? null,
        },
      });
    }
  }

  for (const child of node.children ?? []) {
    await upsertCategoryTree(child, persisted.id, finalPath, depth + 1);
  }
}

async function main() {
  const file = join(__dirname, 'seeds', 'categories.json');
  const raw = readFileSync(file, 'utf-8');
  const tree = JSON.parse(raw) as CategorySeed[];
  for (const root of tree) {
    await upsertCategoryTree(root, null, [], 0);
  }
  console.log('Seed complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
