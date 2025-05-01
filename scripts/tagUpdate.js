const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const ankiConnectUrl = 'http://localhost:8765';
const inputFile = path.join(__dirname, '..', 'notes', 'output.json');
const INITIAL_DELAY_MS = 3000;
const PER_REQUEST_DELAY_MS = 1000;

/**
 * Pauses execution for a specified duration without logging.
 * @param {number} ms - The number of milliseconds to pause.
 * @returns {Promise<void>} - A promise that resolves after the delay.
 */
function sleep(ms) {
  // Removed logging from sleep function for cleaner output
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Function to call AnkiConnect API (same as before)
 */
async function ankiConnectRequest(action, params, version = 6) {
    try {
        const response = await axios.post(ankiConnectUrl, { action, version, params });
        if (response.data.error) {
            throw new Error(`AnkiConnect Error: ${response.data.error}`);
        }
        return response.data.result;
    } catch (error) {
        let errorMessage = `Error during AnkiConnect request (${action}): `;
        if (error.response) {
            errorMessage += `Server responded with ${error.response.status} ${error.response.statusText}. `;
            if (error.response.data && error.response.data.error) {
                errorMessage += `AnkiConnect message: ${error.response.data.error}`;
            } else if (typeof error.response.data === 'string') {
                 errorMessage += `Response body: ${error.response.data.substring(0, 100)}...`; // Shorter preview
            }
        } else if (error.request) {
            errorMessage += 'No response received from AnkiConnect. Is Anki running with AnkiConnect installed and enabled?';
        } else if (error.message.startsWith('AnkiConnect Error:')) {
             errorMessage = error.message;
        } else {
            errorMessage += error.message;
        }
        // Log error here directly if needed for debugging, but the main loop will handle user-facing output
        // console.error("Detailed Error:", errorMessage, error.config ? { url: error.config.url, data: error.config.data } : '');
        throw new Error(errorMessage); // Re-throw simplified message
    }
}


/**
 * Main function to process notes and update tags
 */
async function processNoteTags() {
    let noteData;

    // 1. Read the input JSON file
    try {
        console.log(`Reading note data from ${inputFile}...`);
        const fileContent = await fs.readFile(inputFile, 'utf-8');
        noteData = JSON.parse(fileContent);
        console.log(`Successfully read ${noteData.length} note entries.`);
    } catch (error) {
        console.error(`Error reading or parsing ${inputFile}: ${error.message}`);
        if (error.code === 'ENOENT') {
            console.error("Ensure the file exists at the specified path.");
        }
        return;
    }

     if (!Array.isArray(noteData) || noteData.length === 0) {
         console.error(`Error: Expected ${inputFile} to contain a non-empty JSON array.`);
         return;
    }

    // --- Initial Delay ---
    console.log(`\nPausing for ${INITIAL_DELAY_MS / 1000} seconds before starting updates...`);
    await sleep(INITIAL_DELAY_MS);

    let successCount = 0;
    let errorCount = 0;
    let processedCount = 0;
    const totalNotes = noteData.length;

    console.log("\nStarting note tag replacements...");
    // 2. Process each note entry
    for (const noteInfo of noteData) {
        processedCount++;
        const progressPrefix = `[${processedCount}/${totalNotes}]`; // Generate prefix like [1/25]

        const { noteId, chosenTag } = noteInfo;

        // --- Input Validation ---
        if (typeof noteId !== 'number' || typeof chosenTag !== 'string') {
            console.log(`${progressPrefix} ⚠️ Skipping invalid entry: ID=${noteId}, Tag=${chosenTag}`);
            errorCount++;
            if (processedCount < totalNotes) { await sleep(PER_REQUEST_DELAY_MS); }
            continue;
        }

        // --- Tag Format Validation & Extraction ---
        const tagParts = chosenTag.split('::');
        if (tagParts.length < 1 || !tagParts[0]) {
             console.log(`${progressPrefix} ⚠️ Skipping Note ID ${noteId}: chosenTag "${chosenTag}" has no first part.`);
              errorCount++;
              if (processedCount < totalNotes) { await sleep(PER_REQUEST_DELAY_MS); }
              continue;
        }
         if (tagParts.length !== 2 || !tagParts[1]) {
             // Log only if format is unexpected, but proceed
             console.log(`${progressPrefix} ℹ️ Note ID ${noteId}: Tag "${chosenTag}" not 'Subject::Topic' format. Using "${tagParts[0]}" as tag to replace.`);
        }

        const tagToReplace = tagParts[0];
        const replaceWithTag = chosenTag; // This is the tag we want to see in the success message

        // --- Prepare and Execute AnkiConnect Request ---
        const params = {
            notes: [noteId],
            tag_to_replace: tagToReplace,
            replace_with_tag: replaceWithTag
        };

        try {
            const result = await ankiConnectRequest('replaceTags', params);

            if (result === null) {
                // --- SUCCESS LOGGING (Desired Format) ---
                console.log(`${progressPrefix} ✅ noteid: ${noteId} is updated with "${replaceWithTag}"`);
                successCount++;
            } else {
                 // --- UNEXPECTED RESULT LOGGING ---
                 console.log(`${progressPrefix} ⚠️ noteid: ${noteId} - AnkiConnect returned unexpected result: ${JSON.stringify(result)}`);
                 errorCount++;
            }
        } catch (error) {
             // --- ERROR LOGGING (Concise Format) ---
             console.log(`${progressPrefix} ❌ noteid: ${noteId} - Failed replace "${tagToReplace}" with "${replaceWithTag}". Error: ${error.message}`);
            errorCount++;
        }

        // --- Per-Request Delay ---
        if (processedCount < totalNotes) {
            await sleep(PER_REQUEST_DELAY_MS);
        }

    } // End of loop

    // 3. Final Summary
    console.log("\n--- Processing Complete ---");
    console.log(`Successfully processed: ${successCount} notes.`);
    console.log(`Failed or skipped:    ${errorCount} notes.`);
    console.log(`Total attempted:      ${processedCount}`);
    console.log("--------------------------");
}

// --- Run the main function ---
processNoteTags();