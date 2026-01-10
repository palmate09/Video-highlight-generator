import config from '../../config';
import logger from '../../config/logger';
import type { EmbeddingResult } from '@vhg/shared';

/**
 * Embedding provider interface
 */
export interface EmbeddingProvider {
    embed(text: string): Promise<EmbeddingResult>;
    embedBatch(texts: string[]): Promise<EmbeddingResult[]>;
    cosineSimilarity(a: number[], b: number[]): number;
}

/**
 * Transformers.js local embedding provider
 */
export class TransformersJsProvider implements EmbeddingProvider {
    private pipeline: any = null;
    private pipelinePromise: Promise<any> | null = null;
    private modelName: string = 'Xenova/all-MiniLM-L6-v2';

    private async getPipeline() {
        if (this.pipeline) return this.pipeline;

        if (!this.pipelinePromise) {
            this.pipelinePromise = (async () => {
                const loadStart = Date.now();
                try {
                    const { pipeline, env } = await import('@xenova/transformers');

                    // Configure environment for better performance
                    env.allowLocalModels = true;
                    // Set cache directory to avoid permission issues
                    env.cacheDir = './.cache';
                    // Use local files if available for faster loading
                    env.useBrowserCache = false;
                    env.useCustomCache = true;
                    
                    // Add timeout for model loading (60 seconds)
                    const MODEL_LOAD_TIMEOUT = 60000;
                    logger.info(`Loading Transformers.js model: ${this.modelName}...`);
                    const pipelinePromise = pipeline('feature-extraction', this.modelName);
                    const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Model loading timeout')), MODEL_LOAD_TIMEOUT)
                    );
                    
                    const p = await Promise.race([pipelinePromise, timeoutPromise]) as any;
                    const loadTime = ((Date.now() - loadStart) / 1000).toFixed(2);
                    logger.info(`Transformers.js model loaded: ${this.modelName} in ${loadTime}s`);
                    
                    // Warm up the model with a dummy call to ensure it's ready
                    try {
                        await p('warmup', { pooling: 'mean', normalize: true });
                        logger.debug('Model warm-up completed');
                    } catch (warmupError: any) {
                        logger.warn(`Model warm-up failed (non-critical): ${warmupError.message}`);
                    }
                    
                    return p;
                } catch (error: any) {
                    this.pipelinePromise = null; // Reset promise so we can try again
                    this.pipeline = null; // Reset pipeline as well
                    const loadTime = ((Date.now() - loadStart) / 1000).toFixed(2);
                    logger.error(`Failed to load Transformers.js model after ${loadTime}s: ${error.message}`, {
                        stack: error.stack,
                        modelName: this.modelName,
                    });
                    throw new Error(`Embedding model failed to load. Details: ${error.message}`);
                }
            })();
        }

        try {
            this.pipeline = await this.pipelinePromise;
            return this.pipeline;
        } catch (error: any) {
            // If pipeline loading failed, reset and throw
            this.pipelinePromise = null;
            this.pipeline = null;
            throw error;
        }
    }

    /**
     * Pre-load the model to avoid first-time delays
     */
    async preload(): Promise<void> {
        try {
            logger.info('Pre-loading embedding model...');
            const start = Date.now();
            await this.getPipeline();
            const time = ((Date.now() - start) / 1000).toFixed(2);
            logger.info(`✅ Embedding model pre-loaded in ${time}s`);
        } catch (error: any) {
            logger.error(`Failed to pre-load embedding model: ${error.message}`);
            // Don't throw - let it load on-demand
        }
    }

    async embed(text: string): Promise<EmbeddingResult> {
        try {
            const extractor = await this.getPipeline();
            const output = await extractor(text, { pooling: 'mean', normalize: true });

            if (!output || !output.data) {
                throw new Error('No data returned from embedding model');
            }

            // Convert to regular array
            const embedding = Array.from(output.data as number[]);

            return {
                embedding,
                text,
                model: this.modelName,
            };
        } catch (error: any) {
            logger.error(`Transformers.js embedding error: ${error.message}`);
            throw error;
        }
    }

    async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
        const batchStart = Date.now();
        try {
            if (texts.length === 0) {
                return [];
            }
            
            // Filter out empty texts
            const validTexts = texts.filter(t => t && t.trim().length > 0);
            if (validTexts.length === 0) {
                return texts.map(text => ({
                    embedding: [],
                    text,
                    model: this.modelName,
                }));
            }

            const pipelineStart = Date.now();
            const extractor = await this.getPipeline();
            const pipelineTime = ((Date.now() - pipelineStart) / 1000).toFixed(3);
            
            // Use native batch processing - Transformers.js pipeline can handle arrays directly
            // This is MUCH faster than processing one-by-one (typically 3-5x faster)
            logger.debug(`Starting batch embedding for ${validTexts.length} texts (pipeline ready in ${pipelineTime}s)`);
            const embedStart = Date.now();
            const output = await extractor(validTexts, { 
                pooling: 'mean', 
                normalize: true 
            });
            const embedTime = ((Date.now() - embedStart) / 1000).toFixed(3);

            if (!output || !output.data) {
                throw new Error('No data returned from embedding model batch');
            }

            // Transformers.js returns a tensor with shape [batch_size, embedding_dim]
            // Optimize tensor handling for better performance
            const processStart = Date.now();
            let embeddings: number[][];
            const data = output.data;

            // Check if data has shape property (tensor format) - most common case
            if (data && typeof data === 'object' && 'shape' in data && Array.isArray(data.shape)) {
                const [batchSize, embeddingDim] = data.shape;
                
                // Use tolist() if available for faster conversion, otherwise convert manually
                if (typeof (data as any).tolist === 'function') {
                    embeddings = (data as any).tolist() as number[][];
                } else {
                    // Manual conversion - try to access data directly
                    const dataArray = Array.isArray(data) ? data : Array.from(data as any);
                    embeddings = [];
                    for (let i = 0; i < batchSize; i++) {
                        const start = i * embeddingDim;
                        const end = start + embeddingDim;
                        embeddings.push(Array.from(dataArray.slice(start, end)));
                    }
                }
            } else if (Array.isArray(data)) {
                // Handle array format - could be 2D array or 1D flattened
                if (data.length > 0 && Array.isArray(data[0])) {
                    // 2D array: [[emb1], [emb2], ...]
                    embeddings = data.map((arr: any) => Array.from(arr));
                } else {
                    // 1D flattened array - need to reshape
                    // Assume standard embedding size of 384 for all-MiniLM-L6-v2
                    const embeddingDim = 384;
                    const batchSize = validTexts.length;
                    embeddings = [];
                    for (let i = 0; i < batchSize; i++) {
                        const start = i * embeddingDim;
                        const end = start + embeddingDim;
                        embeddings.push(Array.from(data.slice(start, end)));
                    }
                }
            } else {
                // Fallback: try to convert to array and reshape
                const dataArray = Array.from(data as any);
                // Try to infer embedding dimension (384 for all-MiniLM-L6-v2)
                const embeddingDim = dataArray.length % validTexts.length === 0 
                    ? dataArray.length / validTexts.length 
                    : 384; // Default fallback
                const batchSize = validTexts.length;
                embeddings = [];
                for (let i = 0; i < batchSize; i++) {
                    const start = i * embeddingDim;
                    const end = start + embeddingDim;
                    if (end <= dataArray.length) {
                        const embd = Array.from(dataArray.slice(start, end)) as number[]; 
                        embeddings.push(embd);
                    } else {
                        throw new Error(`Invalid embedding batch output shape: expected ${batchSize * embeddingDim} elements, got ${dataArray.length}`);
                    }
                }
            }

            const processTime = ((Date.now() - processStart) / 1000).toFixed(3);
            logger.debug(`Tensor processing completed in ${processTime}s`);

            // Validate we got the right number of embeddings
            if (embeddings.length !== validTexts.length) {
                throw new Error(`Batch output mismatch: expected ${validTexts.length} embeddings, got ${embeddings.length}`);
            }

            const totalTime = ((Date.now() - batchStart) / 1000).toFixed(3);
            logger.info(`Batch embedding processed ${validTexts.length} texts successfully (total: ${totalTime}s, pipeline: ${pipelineTime}s, embed: ${embedTime}s, process: ${processTime}s)`);

            // Map results back to original texts (including empty ones)
            const results: EmbeddingResult[] = [];
            let validIndex = 0;
            for (const text of texts) {
                if (text && text.trim().length > 0) {
                    results.push({
                        embedding: embeddings[validIndex],
                        text,
                        model: this.modelName,
                    });
                    validIndex++;
                } else {
                    results.push({
                        embedding: [],
                        text,
                        model: this.modelName,
                    });
                }
            }

            return results;
        } catch (error: any) {
            logger.error(`Transformers.js batch embedding error: ${error.message}`);
            // Fallback to sequential processing if batch fails
            logger.warn('Falling back to sequential embedding processing');
            const results: EmbeddingResult[] = [];
            for (const text of texts) {
                try {
                    results.push(await this.embed(text));
                } catch (e: any) {
                    logger.error(`Failed to embed text in fallback: ${e.message}`);
                    results.push({
                        embedding: [],
                        text,
                        model: this.modelName,
                    });
                }
            }
            return results;
        }
    }

    cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) {
            throw new Error('Vectors must have the same length');
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
        if (magnitude === 0) return 0;

        return dotProduct / magnitude;
    }
}

/**
 * OpenAI embedding provider
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
    private openai: any = null;
    private apiKey: string;
    private modelName: string = 'text-embedding-3-small';

    constructor() {
        this.apiKey = config.openai.apiKey;
        if (!this.apiKey) {
            throw new Error('OpenAI API key is required for OpenAI embedding provider');
        }
    }

    private async getOpenAI() {
        if (this.openai) return this.openai;
        const OpenAI = (await import('openai')).default;
        this.openai = new OpenAI({ apiKey: this.apiKey, dangerouslyAllowBrowser: false });
        return this.openai;
    }

    async embed(text: string): Promise<EmbeddingResult> {
        try {
            const openai = await this.getOpenAI();
            const response = await openai.embeddings.create({
                model: this.modelName,
                input: text,
            });

            return {
                embedding: response.data[0].embedding,
                text,
                model: this.modelName,
            };
        } catch (error: any) {
            logger.error(`OpenAI embedding error: ${error.message}`);
            throw error;
        }
    }

    async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
        try {
            const openai = await this.getOpenAI();
            const response = await openai.embeddings.create({
                model: this.modelName,
                input: texts,
            });

            return response.data.map((item: any, index: number) => ({
                embedding: item.embedding,
                text: texts[index],
                model: this.modelName,
            }));
        } catch (error: any) {
            logger.error(`OpenAI batch embedding error: ${error.message}`);
            throw error;
        }
    }

    cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) {
            throw new Error('Vectors must have the same length');
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
        if (magnitude === 0) return 0;

        return dotProduct / magnitude;
    }
}

// Singleton instances
let transformersProvider: TransformersJsProvider | null = null;
let openaiProvider: OpenAIEmbeddingProvider | null = null;

/**
 * Factory function to get embedding provider based on config
 */
export function getEmbeddingProvider(): EmbeddingProvider {
    const provider = (config.providers.embedding || 'transformers').toLowerCase().trim();
    logger.info(`Initializing embedding provider: ${provider}`);
    
    switch (provider) {
        case 'openai':
            logger.info('✅ Using OpenAI embedding provider');
            if (!openaiProvider) {
                openaiProvider = new OpenAIEmbeddingProvider();
            }
            return openaiProvider;
        case 'transformers':
        default:
            logger.info('✅ Using Transformers.js embedding provider');
            if (!transformersProvider) {
                transformersProvider = new TransformersJsProvider();
            }
            return transformersProvider;
    }
}

/**
 * Pre-load embedding model on server startup
 */
export async function preloadEmbeddingModel(): Promise<void> {
    const provider = (config.providers.embedding || 'transformers').toLowerCase().trim();
    if (provider === 'transformers' && transformersProvider) {
        await transformersProvider.preload();
    }
    // OpenAI doesn't need pre-loading
}
