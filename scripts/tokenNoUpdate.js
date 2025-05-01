const axios = require('axios');
const Table = require('cli-table3'); // Can be removed if not used elsewhere

// --- Configuration ---
const ankiConnectUrl = 'http://localhost:8765';
const targetDeckName = 'Custom Study Session';
const ankiConnectVersion = 6;
const knownSubjects = ['MATH', 'GI', 'ENG', 'GK'];
const subjectSeparator = '::';
const slPadding = 3;

const subjectCodeMap = {
    'MATH': '01',
    'GI':   '02',
    'ENG':  '03',
    'GK':   '04',
    'Unknown': 'XX'
};

const examTagInfo = {
    'Prelims::': { tierCode: '01' },
    'Mains::':   { tierCode: '02' }
};

const examTagPrefixes = Object.keys(examTagInfo);
const defaultTier = 'XX';
const defaultShift = '---';
// --- End Configuration ---

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function invokeAnkiConnect(action, params = {}) {
    try {
        const response = await axios.post(ankiConnectUrl, {
            action,
            version: ankiConnectVersion,
            params,
        });
        if (response.data.error) {
            throw new Error(`AnkiConnect Error: ${response.data.error}`);
        }
        return response.data.result;
    } catch (error) {
        if (error.response) {
            console.error('Error Status:', error.response.status);
            console.error('Error Data:', error.response.data);
            throw new Error(`AnkiConnect request failed with status ${error.response.status}`);
        } else if (error.request) {
            console.error('Error Request:', error.request);
            throw new Error(`Could not connect to AnkiConnect at ${ankiConnectUrl}. Is Anki running with AnkiConnect installed?`);
        } else {
            throw new Error(`Failed to send request: ${error.message}`);
        }
    }
}

function extractSubjectFromTags(tags) {
    for (const tag of tags) {
        if (tag.includes(subjectSeparator)) {
            const potentialSubject = tag.split(subjectSeparator)[0].toUpperCase();
            if (knownSubjects.includes(potentialSubject)) {
                return potentialSubject;
            }
        }
    }
    return 'Unknown';
}

function extractExamDetails(tags) {
    for (const tag of tags) {
        for (const prefix of examTagPrefixes) {
            if (tag.startsWith(prefix)) {
                const value = tag.substring(prefix.length);
                if (/^\d+$/.test(value)) {
                    return {
                        tierCode: examTagInfo[prefix].tierCode,
                        shiftValue: value
                    };
                }
            }
        }
    }
    return { tierCode: defaultTier, shiftValue: defaultShift };
}

/**
 * STEP 1: Build mapping of noteId → TokenNo
 */
async function buildTokenNoMapping() {
    const mapping = [];

    console.log(`Fetching notes from deck: "${targetDeckName}"...`);
    const notes = await invokeAnkiConnect('notesInfo', {
        query: `deck:"${targetDeckName}"`
    });

    if (!notes || notes.length === 0) {
        console.log('No notes found.');
        return mapping;
    }

    const subjectCounters = {};
    knownSubjects.forEach(s => subjectCounters[s] = 0);
    subjectCounters['Unknown'] = 0;

    for (const note of notes) {
        const subject = extractSubjectFromTags(note.tags);
        subjectCounters[subject] = (subjectCounters[subject] || 0) + 1;

        const sl = String(subjectCounters[subject]).padStart(slPadding, '0');
        const subjectCode = subjectCodeMap[subject] || subjectCodeMap['Unknown'];
        const { tierCode, shiftValue } = extractExamDetails(note.tags);

        const tokenNo = `${tierCode}-${shiftValue}-${subjectCode}-${sl}`;
        mapping.push({ noteId: note.noteId, tokenNo });
    }

    return mapping;
}

/**
 * STEP 2: Update notes 1/sec with progress feedback
 */
async function updateNotesWithTokenNo(mapping) {
    console.log(`\n--- Starting Updates in 3 seconds ---`);
    await delay(3000); // Pause before updates

    const total = mapping.length;

    for (let i = 0; i < total; i++) {
        const { noteId, tokenNo } = mapping[i];
        const countStr = `[${i + 1}/${total}]`;

        try {
            await invokeAnkiConnect('updateNoteFields', {
                note: {
                    id: noteId,
                    fields: { TokenNo: tokenNo }
                }
            });
            console.log(`${countStr} ✅ Updated note ${noteId} with TokenNo: ${tokenNo}`);
        } catch (err) {
            console.error(`${countStr} ❌ Failed to update note ${noteId}: ${err.message}`);
        }

        await delay(1000);
    }

    console.log('\n--- All updates completed ---');
}

// --- Run Everything ---
(async () => {
    const mapping = await buildTokenNoMapping();
    if (mapping.length > 0) {
        await updateNotesWithTokenNo(mapping);
    }
})();
