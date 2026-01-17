
import { Innertube, UniversalCache } from 'youtubei.js';

const videoIds = [
    'DVE0UcWrD1U', // Rick Roll
    'M7fi_IBk06w', // YouTube IFrame API Demo
    'jNQXAC9IVRw', // Me at the zoo
];

async function run() {
    console.log('Initializing Innertube...');
    const youtube = await Innertube.create({
        cache: new UniversalCache(false),
        generate_session_locally: true
    });

    for (const videoId of videoIds) {
        console.log('\n-----------------------------------');
        console.log('Testing YouTube Transcript fetch for:', videoId);

        try {
            console.log('Fetching video info...');
            const info = await youtube.getInfo(videoId);
            console.log('Video title:', info.basic_info.title);

            console.log('Fetching transcript...');
            const transcriptData = await info.getTranscript();

            if (!transcriptData?.transcript?.content?.body?.initial_segments) {
                console.log('No transcript content found (structure mismatch)');
                continue;
            }

            const segments = transcriptData.transcript.content.body.initial_segments;
            console.log('Success! Found', segments.length, 'segments');
            if (segments.length > 0) {
                console.log('First segment:', segments[0].snippet.text);
            }

        } catch (e: any) {
            console.error('Error:', e.message);
            if (e.info) {
                console.error('Error info:', JSON.stringify(e.info, null, 2));
            }
        }
    }
}

run();
