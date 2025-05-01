// scripts/tagUpdate.js

// 1. Import necessary libraries
const fs = require('fs').promises; // For reading files asynchronously
const path = require('path');     // For handling file paths
const axios = require('axios');   // For making HTTP requests to AnkiConnect

// --- Configuration ---
const ANKI_CONNECT_URL = 'http://localhost:8765';
const INPUT_JSON_PATH = '../notes/output.json'; // Relative to this script file
const TAG_TO_REPLACE = 'GI'; // The generic tag you want to replace on each note
const ANKI_CONNECT_VERSION = 6;
const DELAY_BETWEEN_NOTES_MS = 1000; // Delay in milliseconds (1000ms = 1 second)
const INITIAL_DELAY_MS = 3000;       // Delay before starting (3000ms = 3 seconds)
// --- ------------- ---

// Resolve the absolute path to the JSON file using __dirname (available in CommonJS)
const absoluteInputPath = path.resolve(__dirname, INPUT_JSON_PATH);

/**
 * Helper function to introduce a delay.
 * @param {number} ms - Milliseconds to wait.
 * @returns {Promise<void>}
 */
function sleep(ms) {
  console.log(`Waiting for ${ms / 1000} second(s)...`);
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Sends a request to the AnkiConnect API using axios.
 * (This function remains the same as before)
 * @param {string} action - The AnkiConnect action name.
 * @param {object} params - The parameters for the action.
 * @returns {Promise<object>} - The result object from AnkiConnect.
 * @throws {Error} - If the request fails or AnkiConnect returns an error.
 */
async function invokeAnkiConnect(action, params) {
    const requestPayload = {
        action: action,
        version: ANKI_CONNECT_VERSION,
        params: params ?? {}
    };

    console.log(`Sending request: ${JSON.stringify(requestPayload)}`);

    try {
        const response = await axios.post(ANKI_CONNECT_URL, requestPayload, {
            headers: { 'Content-Type': 'application/json' }
        });

        const data = response.data;
        console.log(`Received response: ${JSON.stringify(data)}`);

        if (data.error) {
            throw new Error(`AnkiConnect error: ${data.error}`);
        }

        return data.result;

    } catch (error) {
        if (axios.isAxiosError(error)) {
            if (error.code === 'ECONNREFUSED') {
                 console.error(`\nError: Connection refused. Is Anki running with AnkiConnect installed and enabled?`);
                 console.error(`Attempted to connect to: ${ANKI_CONNECT_URL}`);
            } else if (error.response) {
                console.error(`\nError: AnkiConnect request failed with status ${error.response.status}`);
                console.error(`Response data:`, error.response.data);
            } else if (error.request) {
                console.error(`\nError: No response received from AnkiConnect at ${ANKI_CONNECT_URL}. Check Anki and AnkiConnect.`);
            } else {
                console.error('\nError during Axios request setup:', error.message);
            }
        } else {
             console.error(`\nError during AnkiConnect processing for action "${action}":`, error.message);
        }
       throw error;
    }
}

/**
 * Main function to read JSON and update Anki tags with delays.
 */
async function updateTags() {
    let notesData;

    // 1. Read and Parse JSON
    try {
        console.log(`Reading notes data from: ${absoluteInputPath}`);
        const fileContent = await fs.readFile(absoluteInputPath, 'utf-8');
        notesData = JSON.parse(fileContent);
        console.log(`Successfully read and parsed ${notesData.length} notes from JSON.`);
    } catch (error) {
        console.error(`Error reading or parsing JSON file at ${absoluteInputPath}:`, error);
        return;
    }

    if (!Array.isArray(notesData) || notesData.length === 0) {
        console.log("No notes found in the JSON file or data is not an array. Exiting.");
        return;
    }

    // 2. Initial Delay before starting
    console.log(`\nStarting tag update process in ${INITIAL_DELAY_MS / 1000} seconds...`);
    await sleep(INITIAL_DELAY_MS);

    // 3. Iterate and Update Tags
    let successCount = 0;
    let errorCount = 0;
    let currentNoteIndex = 0;
    const totalNotes = notesData.length;

    console.log(`\nStarting tag replacement for ${totalNotes} notes...`);
    console.log(`Replacing tag "${TAG_TO_REPLACE}" with specific sub-topic tags.`);
    console.log(`Delay between notes: ${DELAY_BETWEEN_NOTES_MS / 1000} second(s).`);

    for (const noteInfo of notesData) {
        currentNoteIndex++;
        console.log(`\n[${currentNoteIndex}/${totalNotes}] Processing Note ID: ${noteInfo.noteId}`);

        if (!noteInfo.noteId || !noteInfo.chosenTag) {
            console.warn(`  Skipping invalid entry: ${JSON.stringify(noteInfo)} (missing noteId or chosenTag)`);
            errorCount++;
            // Add delay even if skipped to maintain consistent timing
            await sleep(DELAY_BETWEEN_NOTES_MS);
            continue; // Move to the next note in the loop
        }

        const noteId = noteInfo.noteId;
        const replaceWithTag = noteInfo.chosenTag;

        try {
            console.log(`  Replacing tag "${TAG_TO_REPLACE}" with "${replaceWithTag}"`);

            const params = {
                notes: [noteId],
                tag_to_replace: TAG_TO_REPLACE,
                replace_with_tag: replaceWithTag
            };

            const result = await invokeAnkiConnect('replaceTags', params);

            if (result === null) {
                console.log(`  Successfully updated tags for Note ID: ${noteId}`);
                successCount++;
            } else {
                console.warn(`  Received unexpected non-null result for Note ID ${noteId}: ${JSON.stringify(result)}`);
                successCount++; // Still treat as success if no error was thrown
            }

        } catch (error) {
            console.error(`  Failed to update tags for Note ID: ${noteId}. See error above.`);
            errorCount++;
            // Optional: Decide if you want to stop the whole script on the first error
            // return;
        }

        // 4. Delay BETWEEN notes (if it's not the very last note)
        if (currentNoteIndex < totalNotes) {
            await sleep(DELAY_BETWEEN_NOTES_MS);
        }
    }

    // 5. Final Summary
    console.log("\n--- Tag Update Summary ---");
    console.log(`Total notes processed: ${totalNotes}`);
    console.log(`Successfully updated:  ${successCount} notes`);
    console.log(`Failed updates:       ${errorCount} notes`);
    console.log("------------------------");
}

// Run the main function and catch any top-level errors
updateTags().catch(err => {
    console.error("\nAn unexpected error occurred during the script execution:", err);
});