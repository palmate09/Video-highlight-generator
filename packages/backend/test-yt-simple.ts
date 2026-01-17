
import { YoutubeTranscript } from 'youtube-transcript';

const videoIds = [
    'DVE0UcWrD1U', // Rick Roll
    'M7fi_IBk06w', // YouTube IFrame API Demo
    'jNQXAC9IVRw', // Me at the zoo
];

async function run() {
    for (const videoId of videoIds) {
        console.log('\n-----------------------------------');
        console.log('Testing YouTube Transcript fetch for:', videoId);

        try {
            const transcript = await YoutubeTranscript.fetchTranscript(videoId);
            console.log('Success! Found', transcript.length, 'lines');
            if (transcript.length > 0) {
                console.log('First line:', transcript[0]);
            }
        } catch (e) {
            console.error('Error:', e);
        }
    }
}

run();
