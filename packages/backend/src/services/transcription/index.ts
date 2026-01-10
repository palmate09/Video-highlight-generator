import config from '../../config';
import logger from '../../config/logger';
import type { TranscriptSegment, TranscriptionResult } from '@vhg/shared';

/**
 * Transcription provider interface
 */
export interface TranscriptionProvider {
    transcribe(audioPath: string): Promise<TranscriptionResult>;
}

/**
 * Whisper.cpp local transcription provider
 */
export class WhisperCppProvider implements TranscriptionProvider {
    private apiUrl: string;

    constructor() {
        this.apiUrl = config.whisper.apiUrl;
    }

    async transcribe(audioPath: string): Promise<TranscriptionResult> {
        const fs = await import('fs');
        const path = await import('path');

        const audioBuffer = fs.readFileSync(audioPath);
        const fileName = path.basename(audioPath);

        const formData = new FormData();
        const blob = new Blob([audioBuffer], { type: 'audio/wav' });
        formData.append('audio', blob, fileName);

        try {
            const response = await fetch(`${this.apiUrl}/transcribe`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorBody = await response.text();
                logger.error(`Whisper API error body: ${errorBody}`);
                throw new Error(`Whisper API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json() as any;

            let segments = data.segments || [];

            // Fallback if no segments but text is present
            if (segments.length === 0 && data.text) {
                segments = [{
                    start: 0,
                    end: 0, // Duration unknown, but mapping will handle it
                    text: data.text
                }];
            }

            return {
                segments,
                language: data.language || 'en',
                duration: segments.reduce((acc: number, s: TranscriptSegment) => Math.max(acc, s.end), 0) || 0,
            };
        } catch (error: any) {
            logger.error(`Whisper transcription error: ${error.message}`);
            // Return empty result on error
            return {
                segments: [],
                language: 'en',
                duration: 0,
            };
        }
    }
}

/**
 * OpenAI Whisper cloud transcription provider
 */
export class OpenAITranscriptionProvider implements TranscriptionProvider {
    private apiKey: string;
    // OpenAI Whisper API has a 25MB file size limit
    private readonly MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB in bytes
    // Timeout for API requests (5 minutes for large files)
    private readonly REQUEST_TIMEOUT = 5 * 60 * 1000; // 5 minutes

    constructor() {
        this.apiKey = config.openai.apiKey;
        if (!this.apiKey) {
            logger.error('OpenAI API key is missing! Check OPENAI_API_KEY environment variable.');
            throw new Error('OpenAI API key is required for OpenAI transcription provider');
        }
        const maskedKey = this.apiKey.substring(0, 7) + '...' + this.apiKey.substring(this.apiKey.length - 4);
        logger.info(`OpenAI Transcription Provider initialized with API key: ${maskedKey}`);
    }

    async transcribe(audioPath: string): Promise<TranscriptionResult> {
        const fs = await import('fs');
        const path = await import('path');
        const OpenAI = (await import('openai')).default;

        // Check if file exists
        try {
            await fs.promises.access(audioPath, fs.constants.F_OK);
        } catch (error) {
            logger.error(`File not found: ${audioPath}`);
            throw new Error(`File not found: ${audioPath}`);
        }

        // Check file size before processing
        const stats = await fs.promises.stat(audioPath);
        const fileSizeMB = stats.size / (1024 * 1024);
        
        // Determine if it's a video or audio file
        const ext = path.extname(audioPath).toLowerCase();
        const isVideo = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv', '.m4v'].includes(ext);
        const fileType = isVideo ? 'video' : 'audio';
        
        logger.info(`Transcribing ${fileType} file: ${audioPath}, size: ${fileSizeMB.toFixed(2)}MB`);

        // Configure OpenAI client with proper settings for Docker environments
        const openai = new OpenAI({ 
            apiKey: this.apiKey,
            timeout: this.REQUEST_TIMEOUT,
            maxRetries: 0, // We handle retries manually for better control
        });
        
        // Verify API key format
        if (!this.apiKey || this.apiKey.length < 10) {
            throw new Error('Invalid OpenAI API key format');
        }
        
        logger.info(`OpenAI client configured. API key: ${this.apiKey.substring(0, 7)}...${this.apiKey.substring(this.apiKey.length - 4)}`);

        // If file is too large, split it into chunks
        if (stats.size > this.MAX_FILE_SIZE) {
            logger.info(`File size (${fileSizeMB.toFixed(2)}MB) exceeds OpenAI limit (25MB). Splitting into chunks...`);
            return await this.transcribeInChunks(audioPath, openai, fileSizeMB);
        }

        // Retry logic for connection errors
        const maxRetries = 3;
        let lastError: any = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                logger.info(`🚀 Sending ${fileType} file to OpenAI Whisper API (size: ${fileSizeMB.toFixed(2)}MB, attempt ${attempt}/${maxRetries})...`);
                logger.info(`📤 OpenAI API Request: POST https://api.openai.com/v1/audio/transcriptions`);
                logger.info(`📁 File path: ${audioPath}`);
                
                // Verify file exists and is accessible before creating stream
                // Use absolute path to avoid path resolution issues
                const absolutePath = path.isAbsolute(audioPath) ? audioPath : path.resolve(audioPath);

                let fileStats: import('fs').Stats;
                try {
                    await import('fs').then(fsMod => fsMod.promises.access(absolutePath, fsMod.constants.F_OK));
                    fileStats = await import('fs').then(fsMod => fsMod.promises.stat(absolutePath));
                    if (fileStats.size === 0) {
                        throw new Error(`File is empty: ${absolutePath}`);
                    }
                    logger.info(`File verified: ${absolutePath} (${(fileStats.size / 1024).toFixed(2)}KB)`);
                } catch (accessError: any) {
                    logger.error(`File does not exist, is not accessible, or is empty: ${absolutePath} - ${accessError.message}`);
                    throw new Error(`File not found or invalid: ${absolutePath}`);
                }

                const startTime = Date.now();

                // Use fs.createReadStream with proper error handling
                // OpenAI SDK handles ReadStream correctly in Node.js
                logger.info(`Creating read stream for file: ${absolutePath}`);
                const fileStream = fs.createReadStream(absolutePath);
                
                // Set up stream error handler
                fileStream.on('error', (streamError) => {
                    logger.error(`File stream error for ${absolutePath}: ${streamError.message}, code: ${(streamError as any).code}`);
                });

                // OpenAI Whisper API can handle both video and audio files directly
                // Using fs.createReadStream is the recommended approach for Node.js
                logger.info(`Sending ${fileType} file stream to OpenAI API (${(fileStats.size / 1024).toFixed(2)}KB)...`);
                logger.info(`OpenAI API endpoint: https://api.openai.com/v1/audio/transcriptions`);
                
                // Make API call - OpenAI SDK will handle the stream
                // Add timeout handling via Promise.race
                const timeoutPromise = new Promise<never>((_, reject) => 
                    setTimeout(() => {
                        fileStream.destroy();
                        reject(new Error(`Request timeout after ${this.REQUEST_TIMEOUT / 1000}s`));
                    }, this.REQUEST_TIMEOUT)
                );

                const response = await Promise.race([
                    openai.audio.transcriptions.create({
                        file: fileStream,
                        model: 'whisper-1',
                        response_format: 'verbose_json',
                        timestamp_granularities: ['segment'],
                    }),
                    timeoutPromise,
                ]) as any;

                const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
                logger.info(`OpenAI transcription completed in ${elapsedTime}s`);

                const segments: TranscriptSegment[] = (response as any).segments?.map((seg: any) => ({
                    start: seg.start,
                    end: seg.end,
                    text: seg.text,
                })) || [];

                logger.info(`Received ${segments.length} transcription segments from OpenAI`);

                return {
                    segments,
                    language: (response as any).language || 'en',
                    duration: segments.reduce((acc, s) => Math.max(acc, s.end), 0),
                };
            } catch (error: any) {
                lastError = error;
                const errorMessage = error.message || '';
                const errorCode = error.code || '';
                const errorStatus = error.status;
                
                // Check for connection-related errors
                const isConnectionError = errorCode === 'ECONNREFUSED' || 
                                         errorCode === 'ETIMEDOUT' || 
                                         errorCode === 'ENOTFOUND' || 
                                         errorCode === 'ECONNRESET' ||
                                         errorCode === 'ENETUNREACH' ||
                                         errorCode === 'EAI_AGAIN' ||
                                         errorMessage.toLowerCase().includes('connection error') || 
                                         errorMessage.toLowerCase().includes('connection refused') ||
                                         errorMessage.toLowerCase().includes('network') ||
                                         errorMessage.toLowerCase().includes('fetch failed') ||
                                         errorStatus === undefined; // No HTTP status = likely network error

                if (isConnectionError && attempt < maxRetries) {
                    const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
                    logger.warn(`Connection error on attempt ${attempt}/${maxRetries}: ${errorMessage} (code: ${errorCode}). Retrying in ${waitTime}ms...`);
                    logger.warn(`Error details: status=${errorStatus}, code=${errorCode}, message=${errorMessage}`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    continue; // Retry
                } else {
                    // Not a connection error or max retries reached, break and handle error
                    break;
                }
            }
        }

        // Handle final error after all retries exhausted
        const error = lastError;
        const errorDetails = {
            message: error?.message || 'Unknown error',
            code: error?.code,
            status: error?.status,
            filePath: audioPath,
            fileSizeMB: fileSizeMB.toFixed(2),
        };
        logger.error(`OpenAI transcription error after ${maxRetries} attempts: ${JSON.stringify(errorDetails)}`);
        
        // Provide more helpful error messages
        if (error?.status === 413 || error?.message?.includes('too large')) {
            // Try chunking as fallback
            logger.info(`API returned file too large error. Attempting to split into chunks...`);
            return await this.transcribeInChunks(audioPath, openai, fileSizeMB);
        } else if (error?.code === 'ECONNREFUSED' || error?.code === 'ETIMEDOUT' || error?.code === 'ENOTFOUND' || error?.code === 'ECONNRESET' || error?.message?.includes('Connection error') || error?.message?.includes('ECONNREFUSED') || error?.message?.includes('network') || error?.status === undefined) {
            // Connection errors - network issue
            logger.error(`OpenAI API connection failed after ${maxRetries} attempts. This could be due to:`);
            logger.error(`  1. Network connectivity issues from Docker container to OpenAI API`);
            logger.error(`  2. OpenAI API service being temporarily unavailable`);
            logger.error(`  3. Firewall or proxy blocking the connection`);
            throw new Error(`OpenAI API connection error after ${maxRetries} retries. Please check your network connection and try again. Error: ${error?.message || 'Connection failed'}`);
        } else if (error?.status === 429) {
            throw new Error('OpenAI API rate limit exceeded. Please try again later.');
        } else if (error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
            throw new Error(`OpenAI API request timed out after ${this.REQUEST_TIMEOUT / 1000}s. The file may be too large or the API may be slow.`);
        } else if (error?.status === 401) {
            throw new Error('OpenAI API authentication failed. Please check your API key.');
        }
        
        throw error || new Error('Unknown transcription error');
    }

    /**
     * Split large audio file into chunks and transcribe each chunk
     */
    private async transcribeInChunks(audioPath: string, openai: any, fileSizeMB: number): Promise<TranscriptionResult> {
        const fs = await import('fs');
        const path = await import('path');
        const { v4: uuidv4 } = await import('uuid');

        // Target chunk size: 20MB (leave buffer for API limit)
        const TARGET_CHUNK_SIZE = 20 * 1024 * 1024; // 20MB
        const stats = await fs.promises.stat(audioPath);
        const numChunks = Math.ceil(stats.size / TARGET_CHUNK_SIZE);
        
        logger.info(`Splitting audio file into ${numChunks} chunks (target size: 20MB each)`);

        // Get audio duration using ffprobe
        const duration = await this.getAudioDuration(audioPath);
        const chunkDuration = duration / numChunks;
        
        logger.info(`Audio duration: ${duration.toFixed(2)}s, chunk duration: ${chunkDuration.toFixed(2)}s`);

        const allSegments: TranscriptSegment[] = [];
        const tempDir = path.join(path.dirname(audioPath), 'chunks');
        await fs.promises.mkdir(tempDir, { recursive: true });
        
        const tempFiles: string[] = [];

        try {
            // Split and transcribe each chunk
            for (let i = 0; i < numChunks; i++) {
                const startTime = i * chunkDuration;
                const endTime = Math.min((i + 1) * chunkDuration, duration);
                const chunkPath = path.join(tempDir, `chunk_${i}_${uuidv4()}.wav`);
                
                logger.info(`Processing chunk ${i + 1}/${numChunks} (${startTime.toFixed(2)}s - ${endTime.toFixed(2)}s)...`);
                
                // Extract chunk using ffmpeg
                await this.extractAudioChunk(audioPath, chunkPath, startTime, endTime - startTime);
                
                const chunkStats = await fs.promises.stat(chunkPath);
                const chunkSizeMB = chunkStats.size / (1024 * 1024);
                logger.info(`Chunk ${i + 1} extracted: ${chunkSizeMB.toFixed(2)}MB`);
                
                tempFiles.push(chunkPath);

                // Transcribe chunk
                const chunkStartTime = Date.now();
                const response = await openai.audio.transcriptions.create({
                    file: fs.createReadStream(chunkPath),
                    model: 'whisper-1',
                    response_format: 'verbose_json',
                    timestamp_granularities: ['segment'],
                });

                const chunkElapsed = ((Date.now() - chunkStartTime) / 1000).toFixed(2);
                logger.info(`Chunk ${i + 1} transcribed in ${chunkElapsed}s`);

                // Adjust timestamps to account for chunk offset
                const chunkSegments: TranscriptSegment[] = (response as any).segments?.map((seg: any) => ({
                    start: seg.start + startTime,
                    end: seg.end + startTime,
                    text: seg.text,
                })) || [];

                allSegments.push(...chunkSegments);
                
                // Cleanup chunk file immediately after processing
                try {
                    await fs.promises.unlink(chunkPath);
                } catch (e) {
                    logger.warn(`Failed to cleanup chunk file ${chunkPath}`);
                }
            }

            // Sort segments by start time
            allSegments.sort((a, b) => a.start - b.start);

            logger.info(`✅ Transcribed ${numChunks} chunks, total segments: ${allSegments.length}`);

            return {
                segments: allSegments,
                language: 'en', // Will be set from first chunk if needed
                duration: allSegments.reduce((acc, s) => Math.max(acc, s.end), 0),
            };
        } catch (error: any) {
            logger.error(`Error transcribing chunks: ${error.message}`);
            throw error;
        } finally {
            // Cleanup remaining temp files
            for (const tempFile of tempFiles) {
                try {
                    await fs.promises.unlink(tempFile);
                } catch (e) {
                    // Ignore cleanup errors
                }
            }
        }
    }

    /**
     * Get audio duration using ffprobe
     */
    private async getAudioDuration(audioPath: string): Promise<number> {
        const { spawn } = await import('child_process');
        
        return new Promise((resolve, reject) => {
            const ffprobe = spawn('ffprobe', [
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_format',
                audioPath,
            ]);

            let output = '';
            let error = '';

            ffprobe.stdout.on('data', (data: Buffer) => {
                output += data.toString();
            });

            ffprobe.stderr.on('data', (data: Buffer) => {
                error += data.toString();
            });

            ffprobe.on('close', (code: number) => {
                if (code !== 0) {
                    reject(new Error(`FFprobe failed: ${error}`));
                    return;
                }

                try {
                    const data = JSON.parse(output);
                    const duration = parseFloat(data.format?.duration || '0');
                    resolve(duration);
                } catch (e) {
                    reject(new Error('Failed to parse audio duration'));
                }
            });
        });
    }

    /**
     * Extract audio chunk using ffmpeg
     */
    private async extractAudioChunk(audioPath: string, outputPath: string, startTime: number, duration: number): Promise<void> {
        const { spawn } = await import('child_process');
        
        return new Promise((resolve, reject) => {
            const ffmpeg = spawn('ffmpeg', [
                '-i', audioPath,
                '-ss', startTime.toString(),
                '-t', duration.toString(),
                '-acodec', 'pcm_s16le',
                '-ar', '16000',
                '-ac', '1',
                '-y',
                outputPath,
            ]);

            let stderr = '';

            ffmpeg.stderr.on('data', (data: Buffer) => {
                stderr += data.toString();
            });

            ffmpeg.on('error', (error: Error) => {
                reject(new Error(`Failed to extract audio chunk: ${error.message}`));
            });

            ffmpeg.on('close', (code: number) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`FFmpeg failed with code ${code}: ${stderr.split('\n').slice(-5).join(' ')}`));
                }
            });
        });
    }
}

/**
 * Factory function to get transcription provider based on config
 */
export function getTranscriptionProvider(): TranscriptionProvider {
    const provider = (config.providers.transcription || 'whisper').toLowerCase().trim();
    logger.info(`Initializing transcription provider: ${provider}`);
    
    switch (provider) {
        case 'openai':
            logger.info('✅ Using OpenAI transcription provider');
            return new OpenAITranscriptionProvider();
        case 'whisper':
        default:
            logger.info('✅ Using Whisper.cpp transcription provider');
            return new WhisperCppProvider();
    }
}
