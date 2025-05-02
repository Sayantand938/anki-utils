// Use CommonJS 'require' instead of 'import'
const fs = require('fs');
const axios = require('axios');
const path = require('path');

// --- Configuration ---
const ANKI_CONNECT_URL = 'http://localhost:8765'; // Default AnkiConnect URL
// Path relative to this script file (scripts/extraUpdate.js)
const INPUT_FILE_PATH = '../notes/output.json';
const INITIAL_DELAY_MS = 3000; // 3 seconds
const UPDATE_INTERVAL_MS = 1000; // 1 second (1 update/sec)
const TARGET_ANKI_FIELD = 'Extra'; // The Anki field name to update
// --- End Configuration ---

// Helper function for delays
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// In CommonJS, __dirname is available directly and refers to the directory of the current file
// Construct the full path to the JSON file
const fullInputPath = path.join(__dirname, INPUT_FILE_PATH);

async function updateAnkiNotes() {
    console.log(`Executing script from: ${__dirname}`);
    console.log(`Attempting to read notes data from: ${fullInputPath}`);

    let notesData;
    try {
        const fileContent = fs.readFileSync(fullInputPath, 'utf8');
        notesData = JSON.parse(fileContent);
        if (!Array.isArray(notesData)) {
            throw new Error("Input file does not contain a valid JSON array.");
        }
        console.log(`Successfully read ${notesData.length} note entries from ${INPUT_FILE_PATH}.`);
    } catch (error) {
        console.error(`Error reading or parsing ${fullInputPath}:`, error.message);
        if (error.code === 'ENOENT') {
            console.error('Please ensure the file exists at that location relative to the script.');
        } else if (error instanceof SyntaxError) {
            console.error('The file does not contain valid JSON.');
        }
        return; // Stop execution if file reading fails
    }

    if (notesData.length === 0) {
        console.log("No notes found in the file. Exiting.");
        return;
    }

    console.log(`\nWaiting for ${INITIAL_DELAY_MS / 1000} seconds before starting updates...`);
    await delay(INITIAL_DELAY_MS);
    console.log("Starting Anki note updates...\n");

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < notesData.length; i++) {
        const note = notesData[i];
        const progressPrefix = `[${i + 1}/${notesData.length}]`; // Generate progress prefix

        // Validate note structure before attempting update
        if (typeof note?.noteId !== 'number' || typeof note?.Extra !== 'string') {
             // Use ⚠️ for skipped/warning
            console.warn(`${progressPrefix} ⚠️ Skipping entry: Invalid format (noteId or Extra missing/incorrect type). Note data:`, note);
            errorCount++;
            // Add delay even for skipped/failed items to maintain rate limit
            if (i < notesData.length - 1) {
                await delay(UPDATE_INTERVAL_MS);
            }
            continue;
        }

        const { noteId, Extra: extraContent } = note; // Destructure after validation

        const payload = {
            action: "updateNoteFields",
            version: 6,
            params: {
                note: {
                    id: noteId,
                    fields: {
                        [TARGET_ANKI_FIELD]: extraContent // Use dynamic field name
                    }
                }
            }
        };

        try {
            // Removed the "Attempting update" log here, covered by the success/error log below
            const response = await axios.post(ANKI_CONNECT_URL, payload, {
                headers: { 'Content-Type': 'application/json' }
            });

            // Check AnkiConnect's response structure
            if (response.data && response.data.error) {
                // Use ❌ for errors
                console.error(`${progressPrefix} ❌ noteid: ${noteId} - AnkiConnect Error: ${response.data.error}`);
                errorCount++;
            } else if (response.data && response.data.result === null) {
                 // Use ✅ for success
                 console.log(`${progressPrefix} ✅ noteid: ${noteId} updated`);
                successCount++;
            } else {
                 // Handle unexpected success response format (just in case)
                 // Still log as success but with a warning indicator
                 console.warn(`${progressPrefix} ✅ noteid: ${noteId} updated (unexpected response format):`, response.data);
                 successCount++; // Assume success if no error reported
            }

        } catch (error) {
             // Use ❌ for errors
            console.error(`${progressPrefix} ❌ noteid: ${noteId} - Request Error: ${error.message}`);
            if (error.response) {
                console.error(`    Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`);
            } else if (error.request) {
                 console.error(`    No response received. Is Anki running and AnkiConnect installed/configured at ${ANKI_CONNECT_URL}?`);
            } else {
                console.error('    Error details:', error.message);
            }
            errorCount++;
        }

        // Wait before the next iteration (unless it's the last one)
        if (i < notesData.length - 1) {
            await delay(UPDATE_INTERVAL_MS);
        }
    }

    console.log("\n--- Update Process Finished ---");
    console.log(`Total notes processed: ${notesData.length}`);
    console.log(`Successful updates: ${successCount}`);
    console.log(`Failed updates/errors: ${errorCount}`);
    console.log("-----------------------------");
}

// --- Run the script ---
// Make sure Anki is running and the AnkiConnect add-on is installed!
updateAnkiNotes();