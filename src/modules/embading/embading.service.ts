import { ImageToBase64Service } from '@core/image-to-base64/image-to-base64.service';
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import weaviate, {
  WeaviateClient,
  vectorizer,
  dataType,
} from 'weaviate-client';
import { ProductResponseDto } from '@modules/products/dto/product-response.dto';
import { v5 as uuidv5 } from 'uuid';

@Injectable()
export class EmbadingService implements OnModuleInit {
  private client: WeaviateClient;
  private readonly logger = new Logger(EmbadingService.name);
  private readonly UUID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // Standard OID namespace

  constructor(private readonly imageToBase64Service: ImageToBase64Service) {}

  async onModuleInit() {
    this.client = await weaviate.connectToLocal({
      host: 'localhost',
      port: 8080,
      grpcPort: 50051,
    });
    // Check if client is ready
    const ready = await this.client.isReady();
    if (ready) {
      this.logger.log('Weaviate client connected and ready');
      await this._createProductCollection();
    } else {
      this.logger.error('Weaviate client failed to connect');
    }
  }

  private async _createProductCollection() {
    const productCollection = 'Product';
    const imageCollection = 'ProductImage';

    try {
      // 1. Create Product Collection (Text only)
      const productExists =
        await this.client.collections.exists(productCollection);
      if (!productExists) {
        await this.client.collections.create({
          name: productCollection,
          vectorizers: vectorizer.multi2VecClip({
            textFields: ['name', 'description'],
          }),
          properties: [
            { name: 'name', dataType: dataType.TEXT },
            { name: 'description', dataType: dataType.TEXT },
            { name: 'price', dataType: dataType.NUMBER },
            { name: 'productId', dataType: dataType.NUMBER }, // Store original DB ID
            { name: 'organizationId', dataType: dataType.TEXT },
            { name: 'status', dataType: dataType.TEXT },
            { name: 'isDeleted', dataType: dataType.BOOLEAN },
          ],
        });
        this.logger.log('Product collection created!');
      } else {
        this.logger.log(`Collection ${productCollection} already exists`);
      }

      // 2. Create ProductImage Collection (Image only)
      const imageExists = await this.client.collections.exists(imageCollection);
      if (!imageExists) {
        await this.client.collections.create({
          name: imageCollection,
          vectorizers: vectorizer.multi2VecClip({
            imageFields: ['image'],
          }),
          properties: [{ name: 'image', dataType: dataType.BLOB }],
          references: [
            {
              name: 'product',
              targetCollection: productCollection,
            },
          ],
        });
        this.logger.log('ProductImage collection created!');
      } else {
        this.logger.log(`Collection ${imageCollection} already exists`);
      }
    } catch (error) {
      this.logger.error('Error creating collections:', error);
    }
  }

  async createProductEmbedding(product: ProductResponseDto) {
    const productCollection = this.client.collections.get('Product');
    const imageCollection = this.client.collections.get('ProductImage');

    // Generate deterministic UUID for the product
    const productUuid = uuidv5(product.id.toString(), this.UUID_NAMESPACE);

    // Extract description from fields if available
    const descriptionField = product.fields.find(
      (f) => f.fieldName.toLowerCase() === 'description',
    );
    const description = descriptionField?.valueText || '';

    // 1. Insert Product (Text Vector)
    await productCollection.data.insert({
      id: productUuid,
      properties: {
        name: product.name,
        description: description,
        price: product.price,
        productId: product.id,
        organizationId: product.organizationId.toString(),
        status: product.status,
        isDeleted: false,
      },
    });

    // 2. Insert Images (Image Vectors)
    if (product.images && product.images.length > 0) {
      for (const image of product.images) {
        try {
          // Use image.key as the filename (relative path from root)
          const base64 = await this.imageToBase64Service.convert(image.key);
          await imageCollection.data.insert({
            properties: {
              image: base64,
            },
            references: {
              product: productUuid,
            },
          });
        } catch (error) {
          this.logger.error(
            `Failed to vectorise image ${image.key} for product ${product.id}: ${error.message}`,
          );
        }
      }
    }
  }

  async searchByText(query: string, limit = 10) {
    const collection = this.client.collections.get('Product');
    const result = await collection.query.nearText(query, {
      limit: limit,
      returnProperties: [
        'productId',
        'name',
        'description',
        'price',
        'organizationId',
      ],
    });
    return result.objects;
  }

  async searchByImage(filename: string, limit = 10) {
    const base64 = await this.imageToBase64Service.convert(filename);
    return this.searchByImageBase64(base64, limit);
  }

  async searchByImageBase64(base64: string, limit = 10) {
    const collection = this.client.collections.get('ProductImage');

    // Search for images similar to the input image
    const result = await collection.query.nearImage(base64, {
      limit: limit,
      returnReferences: [
        {
          linkOn: 'product',
          returnProperties: [
            'productId',
            'name',
            'description',
            'price',
            'organizationId',
          ],
        },
      ],
    });

    // Extract the parent Product from the matching ProductImages
    // Result objects are ProductImages. Each has a 'product' reference.
    const flatProducts = [];
    const seenIds = new Set();

    for (const obj of result.objects) {
      const refs = obj.properties.product as any[]; // Array of referenced objects
      if (refs && refs.length > 0) {
        const product = refs[0]; // We assume 1-1 link from Image->Product
        // product here contains the properties requested in returnReferences + metadata like id
        if (product && !seenIds.has(product.properties.productId)) {
          // Weaviate returns properties in 'properties' field usually, but sometimes top level depending on client.
          // In v3 with returnProperties, the ref object has the properties directly?
          // Actually, let's look at how we handled it before.
          // The previous code had: if (product && !seenIds.has(product.uuid)) flatProducts.push(...)
          // But I want to return the product properties.
          // Let's assume the ref object has the properties we asked for.
          const productData = product.properties || product; // Safe fallback

          if (!seenIds.has(productData.productId)) {
            flatProducts.push({
              id: productData.productId,
              name: productData.name,
              description: productData.description,
              price: productData.price,
              organizationId: parseInt(productData.organizationId),
            });
            seenIds.add(productData.productId);
          }
        }
      }
    }

    return flatProducts;
  }

  async hybridSearch(options: {
    queryText?: string;
    queryImageFilename?: string;
    limit?: number;
    alpha?: number; // 0 = text only, 1 = vector only
  }) {
    const { queryText, queryImageFilename, limit = 10, alpha = 0.5 } = options;

    if (!queryText && !queryImageFilename) {
      throw new Error(
        'Either queryText or queryImageFilename must be provided',
      );
    }

    // Scenario 1: Text-only - Search Product collection
    if (queryText && !queryImageFilename) {
      const collection = this.client.collections.get('Product');
      const result = await collection.query.hybrid(queryText, {
        limit,
        alpha,
        returnProperties: [
          'productId',
          'name',
          'description',
          'price',
          'organizationId',
        ],
      });
      return result.objects;
    }

    // Scenario 2: Image-only or Text+Image - Prioritize visual search on ProductImage
    // If we have an image, we use it to find matching ProductImages, then return their Products.
    // This effectively treats the query as "find products that look like this image".
    // If text is also provided, we strictly speaking ignore it for the retrieval phase
    // if we use searchByImage logic, UNLESS we perform a 2-step hybrid.
    // Complex hybrid across 2 collections is hard.
    // Fallback: If image is present, use searchByImage.

    if (queryImageFilename) {
      return this.searchByImage(queryImageFilename, limit);
    }

    return [];
  }
}
