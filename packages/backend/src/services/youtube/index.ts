/**
 * YouTube Service
 * Handles fetching YouTube transcripts and AI-based clip analysis
 */

import logger from '../../config/logger';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Key phrases for detecting important segments
const IMPORTANT_PHRASES = [
    'important',
    'remember',
    'in summary',
    'to summarize',
    'rule',
    'example',
    'key point',
    'main idea',
    'essentially',
    'crucial',
    'critical',
    'fundamental',
    'in conclusion',
    'therefore',
    'as a result',
    'the main takeaway',
    'let me explain',
    'note that',
    'pay attention',
    'don\'t forget',
    'keep in mind',
    'first of all',
    'secondly',
    'finally',
    'most importantly',
    'in other words',
    'for example',
    'for instance',
    'here\'s the thing',
    'the key is',
    'bottom line',
];

// Transcript segment interface
export interface TranscriptSegment {
    text: string;
    startTime: number; // in seconds
    duration: number;
}

// YouTube clip interface
export interface YouTubeClip {
    videoId: string;
    start: number;
    end: number;
    label: string;
    confidence: number;
    transcript?: string;
}

/**
 * Extract YouTube video ID from URL
 */
export function extractVideoId(url: string): string | null {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/, // Direct video ID
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            return match[1];
        }
    }

    return null;
}

/**
 * Fetch transcript from YouTube using yt-dlp
 * This uses the installed yt-dlp binary for maximum reliability
 */
export async function fetchYouTubeTranscript(videoId: string): Promise<TranscriptSegment[]> {
    logger.info(`Fetching transcript for YouTube video: ${videoId} using yt-dlp`);

    try {
        // Get metadata using yt-dlp
        // We use --skip-download --dump-json to get metadata and caption URLs
        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        const { stdout } = await execAsync(`yt-dlp --skip-download --dump-json --no-playlist --user-agent "${userAgent}" "https://www.youtube.com/watch?v=${videoId}"`, {
            maxBuffer: 1024 * 1024 * 20 // 20MB buffer for large JSON
        });

        let data;
        try {
            data = JSON.parse(stdout);
        } catch (e) {
            throw new Error('Failed to parse yt-dlp output');
        }

        // Check for subtitles (manual) or automatic captions
        // Prioritize manual subtitles as they are better quality
        const subtitles = data.subtitles || {};
        const autoCaptions = data.automatic_captions || {};

        // Find English track
        let trackUrl = null;

        // Helper to find en track in a track list
        // We prefer 'json3' format for easy parsing
        const findEnTrack = (tracksMap: any) => {
            if (!tracksMap) return null;
            // Keys are like 'en', 'en-US', 'en-orig', 'en_US', etc.
            const keys = Object.keys(tracksMap);
            // Case insensitive search for en, en-, en_
            const enKey = keys.find(k => {
                const lower = k.toLowerCase();
                return lower === 'en' || lower.startsWith('en-') || lower.startsWith('en_');
            });

            if (enKey) {
                const formats = tracksMap[enKey];
                // Prefer json3, then any json
                const jsonFormat = formats.find((f: any) => f.ext === 'json3');
                if (jsonFormat) return jsonFormat.url;
                return formats[0]?.url;
            }
            return null;
        };

        // Try manual subs first, then auto
        trackUrl = findEnTrack(subtitles) || findEnTrack(autoCaptions);

        if (!trackUrl) {
            const manualLangs = Object.keys(subtitles).join(', ');
            const autoLangs = Object.keys(autoCaptions).join(', ');
            logger.warn(`No English transcript found. Manual: [${manualLangs}], Auto: [${autoLangs}]`);
            throw new Error(`No English transcript found. Available languages: Manual=[${manualLangs}], Auto=[${autoLangs}]`);
        }

        logger.info(`Found transcript URL: ${trackUrl.substring(0, 50)}...`);

        // Fetch the transcript content
        const transcriptResponse = await fetch(trackUrl);
        const transcriptText = await transcriptResponse.text();

        if (!transcriptResponse.ok) {
            throw new Error(`Failed to download transcript: ${transcriptResponse.status}`);
        }

        // Parse format based on URL or content detection
        // Most yt-dlp URLs for 'json3' return a specific JSON structure
        if (trackUrl.includes('json3') || trackUrl.includes('fmt=json3')) {
            return parseJson3Transcript(transcriptText);
        } else if (transcriptText.trim().startsWith('<?xml')) {
            // Fallback to XML parser if we got XML
            return parseTranscriptXml(transcriptText);
        } else {
            // Try JSON anyway
            try {
                return parseJson3Transcript(transcriptText);
            } catch (e) {
                throw new Error('Unsupported or unrecognized transcript format');
            }
        }

    } catch (error: any) {
        logger.error(`Error fetching transcript: ${error.message}`);
        throw error;
    }
}

function parseJson3Transcript(jsonString: string): TranscriptSegment[] {
    try {
        const json = JSON.parse(jsonString);
        const segments: TranscriptSegment[] = [];

        if (json.events) {
            for (const event of json.events) {
                // Some events are just metadata/spacing, check for segments
                if (event.segs && event.segs.length > 0) {
                    const text = event.segs.map((s: any) => s.utf8).join('');

                    // Skip empty or newline-only segments
                    if (text && text.trim().length > 0 && text.trim() !== '\n') {
                        segments.push({
                            text: decodeHtmlEntities(text).trim(),
                            startTime: (event.tStartMs || 0) / 1000,
                            duration: (event.dDurationMs || 0) / 1000
                        });
                    }
                }
            }
        }
        return segments;
    } catch (e) {
        logger.warn('Error parsing JSON3 transcript', e);
        return [];
    }
}

function parseTranscriptXml(xml: string): TranscriptSegment[] {
    const segments: TranscriptSegment[] = [];
    // Simple regex parser for YouTube's XML format
    // <text start="0.5" dur="3.2">Hello world</text>
    const regex = /<text[^>]*start="([^"]*)"[^>]*dur="([^"]*)"[^>]*>([^<]*)<\/text>/g;
    let match;

    while ((match = regex.exec(xml)) !== null) {
        const startTime = parseFloat(match[1]);
        const duration = parseFloat(match[2]);
        const text = decodeHtmlEntities(match[3]);

        if (!isNaN(startTime) && !isNaN(duration) && text.trim()) {
            segments.push({
                text: text.trim(),
                startTime,
                duration
            });
        }
    }
    return segments;
}

/**
 * Decode HTML entities in transcript text
 */
function decodeHtmlEntities(text: string): string {
    if (!text) return '';
    const entities: Record<string, string> = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&apos;': "'",
        '&#x27;': "'",
        '&#x2F;': '/',
        '&#x5C;': '\\',
        '&#x60;': '`',
        '&nbsp;': ' ',
    };

    let decoded = text;
    for (const [entity, char] of Object.entries(entities)) {
        decoded = decoded.replace(new RegExp(entity, 'gi'), char);
    }

    // Handle numeric entities
    decoded = decoded.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
    decoded = decoded.replace(/&#x([a-fA-F0-9]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));

    return decoded;
}

/**
 * Calculate information density score for a segment
 */
function calculateInformationDensity(text: string): number {
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    const uniqueWords = new Set(words);

    if (words.length === 0) return 0;

    // Factors for information density:
    // 1. Unique word ratio (vocabulary richness)
    const uniqueRatio = uniqueWords.size / words.length;

    // 2. Average word length (longer words often carry more meaning)
    const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
    const wordLengthScore = Math.min(avgWordLength / 8, 1); // Normalize to 0-1

    // 3. Contains numbers or technical terms
    const hasNumbers = /\d/.test(text);
    const technicalScore = hasNumbers ? 0.1 : 0;

    // Combined score
    const score = (uniqueRatio * 0.5) + (wordLengthScore * 0.3) + technicalScore + 0.1;

    return Math.min(score, 1);
}

/**
 * Detect speech pace changes (words per second)
 */
function calculateSpeechPace(segment: TranscriptSegment): number {
    const words = segment.text.split(/\s+/).filter(w => w.length > 0);
    return segment.duration > 0 ? words.length / segment.duration : 0;
}

/**
 * Check if segment contains important key phrases
 */
function containsImportantPhrase(text: string): boolean {
    const lowerText = text.toLowerCase();
    return IMPORTANT_PHRASES.some(phrase => lowerText.includes(phrase));
}

/**
 * Analyze transcript and generate important clips
 */
export function analyzeTranscriptForClips(
    videoId: string,
    segments: TranscriptSegment[],
    options: {
        minClipDuration?: number;
        maxClipDuration?: number;
        maxClips?: number;
    } = {}
): YouTubeClip[] {
    const {
        minClipDuration = 15,
        maxClipDuration = 120,
        maxClips = 5,
    } = options;

    if (segments.length === 0) {
        return [];
    }

    logger.info(`Analyzing ${segments.length} segments for important clips`);

    // Calculate scores for each segment
    interface ScoredSegment {
        segment: TranscriptSegment;
        index: number;
        score: number;
        hasKeyPhrase: boolean;
        density: number;
        paceChange: number;
    }

    const avgPace = segments.reduce((sum, s) => sum + calculateSpeechPace(s), 0) / segments.length;

    const scoredSegments: ScoredSegment[] = segments.map((segment, index) => {
        const hasKeyPhrase = containsImportantPhrase(segment.text);
        const density = calculateInformationDensity(segment.text);
        const pace = calculateSpeechPace(segment);
        const paceChange = Math.abs(pace - avgPace) / (avgPace || 1);

        // Combined scoring
        let score = 0;
        score += hasKeyPhrase ? 0.4 : 0;
        score += density * 0.35;
        score += Math.min(paceChange * 0.15, 0.15);

        // Boost score for longer segments (more context)
        if (segment.duration > 5) {
            score += 0.1;
        }

        return {
            segment,
            index,
            score,
            hasKeyPhrase,
            density,
            paceChange,
        };
    });

    // Sort by score descending
    scoredSegments.sort((a, b) => b.score - a.score);

    // Group adjacent high-scoring segments into clips
    const clips: YouTubeClip[] = [];
    const usedIndices = new Set<number>();

    for (const scored of scoredSegments) {
        if (clips.length >= maxClips) break;
        if (usedIndices.has(scored.index)) continue;

        // Find adjacent segments to form a clip
        let startIdx = scored.index;
        let endIdx = scored.index;

        // Expand backwards
        while (
            startIdx > 0 &&
            !usedIndices.has(startIdx - 1) &&
            (segments[endIdx].startTime + segments[endIdx].duration - segments[startIdx - 1].startTime) < maxClipDuration
        ) {
            startIdx--;
        }

        // Expand forwards
        while (
            endIdx < segments.length - 1 &&
            !usedIndices.has(endIdx + 1) &&
            (segments[endIdx + 1].startTime + segments[endIdx + 1].duration - segments[startIdx].startTime) < maxClipDuration
        ) {
            endIdx++;
        }

        // Calculate clip timing
        const startTime = Math.max(0, segments[startIdx].startTime - 1); // 1 second buffer
        const endTime = segments[endIdx].startTime + segments[endIdx].duration + 1;

        const clipDuration = endTime - startTime;

        if (clipDuration < minClipDuration) {
            // Try to expand more to meet minimum duration
            const neededDuration = minClipDuration - clipDuration;
            const expandStart = Math.max(0, startTime - neededDuration / 2);
            const expandEnd = endTime + neededDuration / 2;

            if (expandEnd - expandStart >= minClipDuration) {
                const clip = createClip(videoId, expandStart, expandEnd, segments, startIdx, endIdx, scored.score);
                clips.push(clip);

                // Mark indices as used
                for (let i = startIdx; i <= endIdx; i++) {
                    usedIndices.add(i);
                }
            }
        } else {
            const clip = createClip(videoId, startTime, endTime, segments, startIdx, endIdx, scored.score);
            clips.push(clip);

            // Mark indices as used
            for (let i = startIdx; i <= endIdx; i++) {
                usedIndices.add(i);
            }
        }
    }

    // Sort clips by start time
    clips.sort((a, b) => a.start - b.start);

    logger.info(`Generated ${clips.length} clips for video ${videoId}`);

    return clips;
}

/**
 * Create a clip object with label
 */
function createClip(
    videoId: string,
    startTime: number,
    endTime: number,
    segments: TranscriptSegment[],
    startIdx: number,
    endIdx: number,
    score: number
): YouTubeClip {
    // Combine transcript text for the clip
    const transcriptParts: string[] = [];
    for (let i = startIdx; i <= endIdx; i++) {
        transcriptParts.push(segments[i].text);
    }
    const transcript = transcriptParts.join(' ').trim();

    // Generate label from transcript
    const label = generateClipLabel(transcript);

    return {
        videoId,
        start: Math.round(startTime * 10) / 10, // Round to 1 decimal
        end: Math.round(endTime * 10) / 10,
        label,
        confidence: Math.round(score * 100) / 100,
        transcript,
    };
}

/**
 * Generate a descriptive label for a clip
 */
function generateClipLabel(transcript: string): string {
    // Take first 50 characters and add ellipsis if needed
    const words = transcript.split(/\s+/);
    let label = '';

    for (const word of words) {
        if ((label + ' ' + word).length > 50) break;
        label = label ? label + ' ' + word : word;
    }

    if (label.length < transcript.length) {
        label += '...';
    }

    return label;
}

/**
 * Get video metadata (title, duration, etc.)
 */
export async function getVideoMetadata(videoId: string): Promise<{
    title: string;
    duration: number;
    channelTitle: string;
    description: string;
} | null> {
    try {
        // Use yt-dlp for metadata
        // Add User-Agent to avoid blocking
        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        const { stdout } = await execAsync(`yt-dlp --skip-download --dump-json --no-playlist --user-agent "${userAgent}" "https://www.youtube.com/watch?v=${videoId}"`, {
            maxBuffer: 1024 * 1024 * 20
        });

        const data = JSON.parse(stdout);

        return {
            title: data.title || 'Unknown',
            duration: data.duration || 0,
            channelTitle: data.uploader || 'Unknown',
            description: data.description || '',
        };

    } catch (error: any) {
        logger.error(`Error fetching video metadata: ${error.message}`);
        return null;
    }
}

export default {
    extractVideoId,
    fetchYouTubeTranscript,
    analyzeTranscriptForClips,
    getVideoMetadata,
};
