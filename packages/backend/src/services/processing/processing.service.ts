import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../../config/database';
import config from '../../config';
import logger from '../../config/logger';
import { getTranscriptionProvider } from '../transcription';
import { getEmbeddingProvider } from '../embeddings';

interface VideoMetadata {
    duration: number;
    width: number;
    height: number;
    fps: number;
    codec: string;
    bitrate: number;
}

export class ProcessingService {
    private outputDir: string;
    private tempDir: string;

    constructor() {
        this.outputDir = path.resolve(config.output.path);
        this.tempDir = path.join(this.outputDir, 'temp');
        this.ensureDirectories();
    }

    private async ensureDirectories() {
        await fs.mkdir(this.outputDir, { recursive: true });
        await fs.mkdir(this.tempDir, { recursive: true });
    }

    /**
     * Get video metadata using FFprobe
     */
    async getVideoMetadata(videoPath: string): Promise<VideoMetadata> {
        return new Promise((resolve, reject) => {
            const ffprobe = spawn('ffprobe', [
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_format',
                '-show_streams',
                videoPath,
            ]);

            let output = '';
            let error = '';

            ffprobe.stdout.on('data', (data) => {
                output += data.toString();
            });

            ffprobe.stderr.on('data', (data) => {
                error += data.toString();
            });

            ffprobe.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`FFprobe failed: ${error}`));
                    return;
                }

                try {
                    const data = JSON.parse(output);
                    const videoStream = data.streams?.find((s: any) => s.codec_type === 'video');
                    const format = data.format;

                    resolve({
                        duration: parseFloat(format?.duration || '0'),
                        width: videoStream?.width || 0,
                        height: videoStream?.height || 0,
                        fps: this.parseFps(videoStream?.r_frame_rate || '0/1'),
                        codec: videoStream?.codec_name || 'unknown',
                        bitrate: parseInt(format?.bit_rate || '0', 10),
                    });
                } catch (e) {
                    reject(new Error('Failed to parse video metadata'));
                }
            });
        });
    }

    private parseFps(fpsString: string): number {
        const parts = fpsString.split('/');
        if (parts.length === 2) {
            return parseInt(parts[0], 10) / parseInt(parts[1], 10);
        }
        return parseFloat(fpsString);
    }

    /**
     * Generate thumbnail from video
     */
    async generateThumbnail(videoId: string, videoPath: string): Promise<string> {
        const thumbnailPath = path.join(this.outputDir, 'thumbnails', `${videoId}.jpg`);
        await fs.mkdir(path.dirname(thumbnailPath), { recursive: true });

        return new Promise((resolve, reject) => {
            const ffmpeg = spawn('ffmpeg', [
                '-i', videoPath,
                '-ss', '00:00:01',
                '-vframes', '1',
                '-vf', 'scale=320:-1',
                '-y',
                thumbnailPath,
            ]);

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    resolve(path.relative(this.outputDir, thumbnailPath));
                } else {
                    // Try at 0 seconds if 1 second fails
                    const ffmpeg2 = spawn('ffmpeg', [
                        '-i', videoPath,
                        '-ss', '00:00:00',
                        '-vframes', '1',
                        '-vf', 'scale=320:-1',
                        '-y',
                        thumbnailPath,
                    ]);

                    ffmpeg2.on('close', (code2) => {
                        if (code2 === 0) {
                            resolve(path.relative(this.outputDir, thumbnailPath));
                        } else {
                            reject(new Error('Thumbnail generation failed'));
                        }
                    });
                }
            });
        });
    }

    /**
     * Detect scene changes in video
     * Optimized for faster processing with adaptive settings based on video duration
     */
    async detectScenes(videoPath: string, duration?: number, threshold: number = 0.2): Promise<number[]> {
        // If duration is provided and video is very short, just return start and end
        if (duration !== undefined && duration <= 30) {
            logger.info(`Skipping scene detection for short video (${duration.toFixed(2)}s)`);
            return [0, duration];
        }

        logger.info(`Detecting scenes for ${videoPath} with threshold ${threshold}`);
        return new Promise((resolve, reject) => {
            // Optimize: Use faster settings for scene detection
            // Lower fps (5 instead of 10), smaller scale, and add timeout
            const ffmpeg = spawn('ffmpeg', [
                '-i', videoPath,
                '-vf', `fps=5,scale=240:-1,select='gt(scene,${threshold})',showinfo`,
                '-f', 'null',
                '-',
            ], {
                timeout: 60000, // 60 second timeout
            });

            let stderr = '';

            ffmpeg.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            ffmpeg.on('error', (error) => {
                logger.error(`FFmpeg scene detection error: ${error.message}`);
                // Return default scenes on error
                resolve(duration ? [0, duration] : [0]);
            });

            ffmpeg.on('close', (code) => {
                const scenes: number[] = [0]; // Always start at 0

                // Parse scene timestamps from stderr
                const lines = stderr.split('\n');
                for (const line of lines) {
                    if (line.includes('pts_time:')) {
                        const match = line.match(/pts_time:(\d+\.?\d*)/);
                        if (match) {
                            const time = parseFloat(match[1]);
                            // Only add if within video duration (if known)
                            if (!duration || time <= duration) {
                                scenes.push(time);
                            }
                        }
                    }
                }

                // Remove duplicates and sort
                const uniqueScenes = [...new Set(scenes)].sort((a, b) => a - b);
                
                // Ensure we have an end scene if duration is known
                if (duration && uniqueScenes[uniqueScenes.length - 1] < duration) {
                    uniqueScenes.push(duration);
                }
                
                resolve(uniqueScenes);
            });
        });
    }

    /**
     * Create clips from detected scenes
     */
    async createClipsFromScenes(
        videoId: string,
        scenes: number[],
        duration: number,
        minClipDuration: number = 3
    ): Promise<Array<{ id: string; startTime: number; endTime: number }>> {
        const clips: Array<{ id: string; startTime: number; endTime: number }> = [];

        // Create clips between scene boundaries, merging short ones
        let currentStart = scenes[0];

        for (let i = 0; i < scenes.length; i++) {
            const nextScene = scenes[i + 1] || duration;

            // If the current accumulated clip plus this scene is long enough, or it's the last one
            if (nextScene - currentStart >= minClipDuration || i === scenes.length - 1) {
                const clip = await prisma.clip.create({
                    data: {
                        videoId,
                        startTime: currentStart,
                        endTime: nextScene,
                    },
                });

                clips.push({
                    id: clip.id,
                    startTime: currentStart,
                    endTime: nextScene,
                });

                currentStart = nextScene;
            }
            // Otherwise, keep accumulating (currentStart stays same, next loop uses nextScene)
        }

        // If no clips were created, create one clip for the entire video
        if (clips.length === 0) {
            const clip = await prisma.clip.create({
                data: {
                    videoId,
                    startTime: 0,
                    endTime: duration,
                },
            });

            clips.push({
                id: clip.id,
                startTime: 0,
                endTime: duration,
            });
        }

        return clips;
    }

    async extractAudio(videoPath: string): Promise<string> {
        // Use absolute path for audio output to avoid path issues
        const audioPath = path.resolve(path.join(this.tempDir, `${uuidv4()}.wav`));
        
        // Ensure temp directory exists
        await fs.mkdir(path.dirname(audioPath), { recursive: true });
        
        return new Promise(async (resolve, reject) => {
            logger.debug(`Starting audio extraction: ${videoPath} -> ${audioPath}`);
            
            const ffmpeg = spawn('ffmpeg', [
                '-i', videoPath,
                '-vn', // No video
                '-acodec', 'pcm_s16le', // PCM 16-bit little-endian
                '-ar', '16000', // 16kHz sample rate (optimal for Whisper)
                '-ac', '1', // Mono
                '-y', // Overwrite output file
                audioPath,
            ], {
                stdio: ['ignore', 'pipe', 'pipe'] // Capture stderr for errors
            });

            let stderr = '';
            
            ffmpeg.stderr.on('data', (data) => {
                stderr += data.toString();
                // Log progress for long operations
                const line = data.toString();
                if (line.includes('time=')) {
                    logger.debug(`FFmpeg progress: ${line.trim()}`);
                }
            });

            ffmpeg.on('error', (error) => {
                logger.error(`FFmpeg spawn error: ${error.message}`);
                reject(new Error(`Failed to start audio extraction: ${error.message}`));
            });

            ffmpeg.on('close', async (code) => {
                if (code === 0) {
                    // Wait for file to be fully written to disk with retries
                    let retries = 10;
                    let fileExists = false;
                    
                    while (retries > 0 && !fileExists) {
                        try {
                            // Check if file exists and is not empty
                            await fs.access(audioPath, fs.constants.F_OK);
                            const stats = await fs.stat(audioPath);
                            if (stats.size > 0) {
                                fileExists = true;
                                logger.debug(`Audio extraction successful: ${audioPath} (${(stats.size / 1024).toFixed(2)}KB)`);
                                resolve(audioPath);
                                return;
                            } else {
                                logger.debug(`Audio file exists but is empty, waiting... (retries: ${retries})`);
                            }
                        } catch (error: any) {
                            // File doesn't exist yet, wait a bit
                            logger.debug(`Audio file not found yet, waiting... (retries: ${retries}, error: ${error.message})`);
                        }
                        
                        retries--;
                        if (retries > 0) {
                            await new Promise(res => setTimeout(res, 200)); // Wait 200ms
                        }
                    }
                    
                    if (!fileExists) {
                        logger.error(`Audio file was not created or is empty after 10 retries: ${audioPath}`);
                        reject(new Error(`Audio extraction failed: output file not found or empty after waiting`));
                    }
                } else {
                    logger.error(`Audio extraction failed with code ${code}. FFmpeg output: ${stderr}`);
                    reject(new Error(`Audio extraction failed (exit code ${code}): ${stderr.split('\n').slice(-5).join(' ')}`));
                }
            });
        });
    }

    /**
     * Transcribe whole video at once
     */
    async transcribeFullVideo(videoPath: string): Promise<any> {
        // Validate video file exists
        try {
            await fs.access(videoPath);
            const stats = await fs.stat(videoPath);
            logger.info(`Transcribing video: ${videoPath}, size: ${(stats.size / (1024 * 1024)).toFixed(2)}MB`);
        } catch (error: any) {
            logger.error(`Video file not found or inaccessible: ${videoPath} - ${error.message}`);
            throw new Error(`Video file not found: ${videoPath}`);
        }

        const provider = getTranscriptionProvider();
        const transcriptionProvider = config.providers.transcription.toLowerCase().trim();
        logger.info(`Starting transcription with provider: ${transcriptionProvider}`);

        // Check video file size
        const videoStats = await fs.stat(videoPath);
        const videoSizeMB = videoStats.size / (1024 * 1024);
        const MAX_VIDEO_SIZE_FOR_DIRECT_UPLOAD = 20 * 1024 * 1024; // 20MB - leave buffer for OpenAI's 25MB limit
        
        // Always extract audio for more reliable processing
        // While OpenAI can handle video files, extracting audio:
        // 1. Reduces file size significantly
        // 2. Avoids connection issues with video streams
        // 3. Is more reliable in Docker environments
        // 4. Is fast for short videos (< 15 seconds typically takes < 2 seconds)
        let filePath: string;
        let audioPath: string | null = null;

        logger.info(`Extracting audio from video: ${videoPath} (video size: ${videoSizeMB.toFixed(2)}MB)`);
        const audioExtractStart = Date.now();
        audioPath = await this.extractAudio(videoPath);
        const audioExtractTime = ((Date.now() - audioExtractStart) / 1000).toFixed(2);
        
        // Verify audio file exists and is fully written before proceeding
        try {
            await fs.access(audioPath, fs.constants.F_OK);
            const audioStats = await fs.stat(audioPath);
            
            if (audioStats.size === 0) {
                throw new Error(`Extracted audio file is empty: ${audioPath}`);
            }
            
            const audioSizeMB = audioStats.size / (1024 * 1024);
            logger.info(`Audio extracted in ${audioExtractTime}s, size: ${audioSizeMB.toFixed(2)}MB (reduction: ${((1 - audioStats.size / videoStats.size) * 100).toFixed(1)}%)`);
            filePath = audioPath;
        } catch (error: any) {
            logger.error(`Failed to verify extracted audio file: ${audioPath} - ${error.message}`);
            throw new Error(`Audio file verification failed: ${error.message}`);
        }
        
        try {
            const transcriptionStart = Date.now();
            const result = await provider.transcribe(filePath);
            const transcriptionTime = ((Date.now() - transcriptionStart) / 1000).toFixed(2);
            logger.info(`Transcription completed in ${transcriptionTime}s, segments: ${result.segments?.length || 0}`);
            
            return result;
        } catch (error: any) {
            logger.error(`Transcription failed for video ${videoPath}: ${error.message}`);
            throw error;
        } finally {
            // Cleanup audio file only if we extracted it
            if (audioPath) {
                try { 
                    await fs.unlink(audioPath);
                    logger.debug(`Cleaned up temporary audio file: ${audioPath}`);
                } catch (cleanupError: any) {
                    logger.warn(`Failed to cleanup audio file ${audioPath}: ${cleanupError.message}`);
                }
            }
        }
    }

    /**
     * Extract audio segment from video
     */
    async extractAudioSegment(
        videoPath: string,
        startTime: number,
        endTime: number
    ): Promise<string> {
        const audioPath = path.join(this.tempDir, `${uuidv4()}.wav`);
        const duration = endTime - startTime;

        return new Promise((resolve, reject) => {
            const ffmpeg = spawn('ffmpeg', [
                '-i', videoPath,
                '-ss', startTime.toString(),
                '-t', duration.toString(),
                '-vn',
                '-acodec', 'pcm_s16le',
                '-ar', '16000',
                '-ac', '1',
                '-y',
                audioPath,
            ]);

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    resolve(audioPath);
                } else {
                    reject(new Error('Audio extraction failed'));
                }
            });
        });
    }

    /**
     * Transcribe a clip
     */
    async transcribeClip(
        videoPath: string,
        startTime: number,
        endTime: number
    ): Promise<string> {
        // Extract audio segment
        const audioPath = await this.extractAudioSegment(videoPath, startTime, endTime);

        try {
            // Get transcription provider
            const provider = getTranscriptionProvider();

            // Transcribe
            const result = await provider.transcribe(audioPath);

            // Combine segments into full transcript
            const transcript = result.segments.map(s => s.text).join(' ').trim();

            return transcript;
        } finally {
            // Cleanup temp audio file
            try {
                await fs.unlink(audioPath);
            } catch {
                // Ignore cleanup errors
            }
        }
    }

    /**
     * Generate embedding for text
     */
    async generateEmbedding(text: string): Promise<number[]> {
        const provider = getEmbeddingProvider();
        const result = await provider.embed(text);
        return result.embedding;
    }

    /**
     * Generate embeddings for multiple texts in batch (much faster)
     */
    async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
        const provider = getEmbeddingProvider();
        const results = await provider.embedBatch(texts);
        return results.map(r => r.embedding);
    }

    /**
     * Extract a clip from video
     */
    async extractClip(
        videoPath: string,
        startTime: number,
        endTime: number,
        outputName: string
    ): Promise<string> {
        const outputPath = path.join(this.outputDir, 'clips', outputName);
        await fs.mkdir(path.dirname(outputPath), { recursive: true });

        const duration = endTime - startTime;

        return new Promise((resolve, reject) => {
            const ffmpeg = spawn('ffmpeg', [
                '-i', videoPath,
                '-ss', startTime.toString(),
                '-t', duration.toString(),
                '-c', 'copy',
                '-y',
                outputPath,
            ]);

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    resolve(outputPath);
                } else {
                    reject(new Error('Clip extraction failed'));
                }
            });
        });
    }
}

export const processingService = new ProcessingService();
