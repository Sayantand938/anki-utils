const fs = require("fs").promises;
const path = require("path");
const http = require("http");
// Removed readline
const { program } = require('commander'); // Import commander

// --- Configuration ---
const ANKI_CONNECT_URL = "http://localhost:8765";
const TOKEN_FIELD_NAME = "TokenNo";
const TARGET_UPDATE_FIELD = "Video";
const ANKI_API_VERSION = 6;
const ANKI_REQUEST_TIMEOUT = 15000;
const DEFAULT_DECK_NAME = "Custom Study Session"; // Deck name is fixed
const TARGET_COPY_DIR = "D:\\AnkiData\\NOTES\\collection.media";
const PRE_PROCESSING_DELAY_MS = 3000; // 3 seconds before Phase 2 starts
const INTER_NOTE_DELAY_MS = 1000; // 1 second between processing each note
// ---------------------

// --- Constants for Output ---
const SUCCESS_MARK = "[✓]";
const FAILURE_MARK = "[✗]";
const INDENT = "    "; // 4 spaces for indentation
// --------------------------

// --- Helper: AnkiConnect Request ---
// (Remains the same as previous version)
function ankiConnectRequest(action, params = {}) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({ action: action, version: ANKI_API_VERSION, params: params });
        const url = new URL(ANKI_CONNECT_URL);
        const options = {
            hostname: url.hostname, port: url.port, path: url.pathname, method: "POST",
            headers: { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload, "utf-8") },
            timeout: ANKI_REQUEST_TIMEOUT
        };
        const req = http.request(options, (res) => {
            let data = "";
            res.setEncoding("utf8");
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    return reject(new Error(`HTTP Error: ${res.statusCode} ${res.statusMessage}\nResponse: ${data.substring(0, 200)}`));
                }
                try {
                    const responseJson = JSON.parse(data);
                    if (responseJson.error) {
                        if (action === "notesInfo" && responseJson.error.includes("deck was not found")) {
                            return reject(new Error(`Anki Error: Deck "${params?.query?.match(/deck:"([^"]+)"/)?.[1] || 'provided name'}" not found.`));
                        }
                        if (action === "updateNoteFields") {
                            if (responseJson.error.includes("field not found") || responseJson.error.includes("no field named")) {
                                const fieldName = Object.keys(params?.note?.fields ?? {})[0] || TARGET_UPDATE_FIELD;
                                return reject(new Error(`Field "${fieldName}" not found in note ID ${params?.note?.id}. Ensure it exists in the note type.`));
                            }
                            if (responseJson.error.includes("Network Fail")) {
                                return reject(new Error(`Network failure during update for note ID ${params?.note?.id}. Check Anki/AnkiConnect.`));
                            }
                        }
                        throw new Error(`AnkiConnect API Error (${action}): ${responseJson.error}`);
                    }
                    if (responseJson.hasOwnProperty("result")) {
                        resolve(responseJson.result);
                    } else {
                        throw new Error(`AnkiConnect response missing 'result' field for action ${action}.`);
                    }
                } catch (parseError) {
                    reject(new Error(`Failed to parse AnkiConnect response: ${parseError.message}\nRaw: ${data.substring(0, 200)}`));
                }
            });
        });
        req.on("timeout", () => {
            req.destroy();
            reject(new Error(`AnkiConnect request timed out after ${ANKI_REQUEST_TIMEOUT / 1000} seconds.`));
        });
        req.on("error", (error) => {
            if (error.code === "ECONNREFUSED") {
                reject(new Error(`Connection refused at ${ANKI_CONNECT_URL}. Is Anki open and the AnkiConnect add-on installed and enabled?`));
            } else {
                reject(new Error(`HTTP Request error: ${error.message}`));
            }
        });
        req.write(payload);
        req.end();
    });
}


// --- Helper: Fetch Note Info (ID and Token) from Anki Deck ---
// (Remains the same as previous version - suppressed logs)
async function fetchNoteInfoForDeck(deckName) {
    // console.log(`[Anki] Fetching notes from deck: "${deckName}"...`); // Suppressed
    let notesInfo;
    try {
        notesInfo = await ankiConnectRequest("notesInfo", { query: `deck:"${deckName}"` });
    } catch (err) {
        if (err.message.includes("Deck") && err.message.includes("not found")) {
            throw err;
        }
        throw new Error(`[Anki] Failed to fetch notes info: ${err.message}`);
    }

    if (!notesInfo || notesInfo.length === 0) {
        // console.log(`[Anki] No notes found in deck "${deckName}".`); // Suppressed
        return [];
    }

    // console.log(`[Anki] Found ${notesInfo.length} notes. Extracting Note ID and '${TOKEN_FIELD_NAME}'...`); // Suppressed
    const extractedNotes = [];
    let skippedCount = 0;

    notesInfo.forEach((note, index) => {
        const tokenValue = note?.fields?.[TOKEN_FIELD_NAME]?.value;
        const noteId = note?.noteId;

        if (!noteId) {
            // console.warn(`[Anki] Warning: Note index ${index} is missing a Note ID. Skipping.`); // Suppressed
            skippedCount++;
            return;
        }
        if (!tokenValue) {
            // console.warn(`[Anki] Warning: Note ID ${noteId} (Index ${index}) is missing '${TOKEN_FIELD_NAME}' field or its value is empty. Skipping.`); // Suppressed
            skippedCount++;
            return;
        }

        const sanitizedToken = tokenValue.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
        if (sanitizedToken !== tokenValue) {
            // console.warn(`[Anki] Warning: Token "${tokenValue}" contained invalid characters or extra whitespace, sanitized to "${sanitizedToken}". Note ID: ${noteId}`); // Suppressed
        }
        if (!sanitizedToken) {
            // console.warn(`[Anki] Warning: Note ID ${noteId} resulted in an empty token after sanitization ("${tokenValue}"). Skipping.`); // Suppressed
            skippedCount++;
            return;
        }

        extractedNotes.push({ noteId: noteId, tokenNo: sanitizedToken });
    });

    if (skippedCount > 0) {
        // console.warn(`[Anki] Note: ${skippedCount} notes were excluded due to missing Note ID or missing/invalid '${TOKEN_FIELD_NAME}'.`); // Suppressed
    }
    // console.log(`[Anki] Successfully extracted info for ${extractedNotes.length} notes.`); // Suppressed
    return extractedNotes;
}


// --- Helper: Get and Sort MKV Files by Creation Time ---
// (Remains the same as previous version - suppressed logs)
async function getSortedMkvFiles(folderPath) {
    // console.log(`[FS] Reading directory: "${folderPath}"...`); // Suppressed
    let filesWithStats = [];
    try {
        const dirents = await fs.readdir(folderPath, { withFileTypes: true });
        const mkvFiles = dirents.filter(dirent => dirent.isFile() && path.extname(dirent.name).toLowerCase() === '.mkv');
        // console.log(`[FS] Found ${mkvFiles.length} MKV files. Getting creation times...`); // Suppressed

        for (const file of mkvFiles) {
            const fullPath = path.join(folderPath, file.name);
            try {
                const stats = await fs.stat(fullPath);
                filesWithStats.push({ path: fullPath, name: file.name, timeMs: stats.birthtimeMs || stats.mtimeMs });
            } catch (statError) {
                // console.warn(`[FS] Warning: Could not get stats for "${file.name}": ${statError.message}. Skipping file.`); // Suppressed
            }
        }
    } catch (readDirError) {
        throw new Error(`[FS] Failed to read directory "${folderPath}": ${readDirError.message}`);
    }

    filesWithStats.sort((a, b) => a.timeMs - b.timeMs);
    // console.log(`[FS] Sorted ${filesWithStats.length} MKV files by creation time.`); // Suppressed
    return filesWithStats.map(f => ({ path: f.path, name: f.name }));
}

// --- Helper: Delay Function ---
// (Remains the same)
function delay(ms) {
    if (ms <= 0) return Promise.resolve();
    return new Promise(resolve => setTimeout(resolve, ms));
}


// --- Core Processing Logic ---
// (Remains the same as previous version)
async function processFilesAndNotes(folderPath, deckNameToUse) {
    // --- Suppress Initial Output ---
    // (Initial logging remains suppressed)

    // Counters
    let fileCount = 0;
    let noteCount = 0;
    let processCount = 0;
    let successRenameCount = 0, failRenameCount = 0, skippedRenameCount = 0;
    let successCopyCount = 0, failCopyCount = 0;
    let successAnkiUpdateCount = 0, failAnkiUpdateCount = 0;
    let overallSuccessCount = 0;

    try {
        // --- 1. Preparation (Perform actions, minimize logging) ---

        // 1a. Validate Target Path
        try {
            await fs.access(TARGET_COPY_DIR, fs.constants.W_OK);
            const stats = await fs.stat(TARGET_COPY_DIR);
            if (!stats.isDirectory()) throw new Error('Target path exists but is not a directory');
        } catch (err) {
            if (err.code === 'ENOENT') throw new Error(`Target copy directory not found: "${TARGET_COPY_DIR}". Please create it first.`);
            else if (err.code === 'EACCES' || err.code === 'EPERM') throw new Error(`No write permission for target copy directory: "${TARGET_COPY_DIR}"`);
            else throw new Error(`Error accessing target copy directory "${TARGET_COPY_DIR}": ${err.message}`);
        }

        // 1b. Fetch Note Info
        const fetchedNotes = await fetchNoteInfoForDeck(deckNameToUse);
        noteCount = fetchedNotes.length;
        if (noteCount === 0) {
            console.error("[INFO] No valid notes fetched from Anki. Nothing to process.");
            return 0;
        }

        // 1c. Get Sorted MKV Files
        const sortedMkvFiles = await getSortedMkvFiles(folderPath);
        fileCount = sortedMkvFiles.length;
        if (fileCount === 0) {
            console.error("[INFO] No MKV files found in the source folder. Nothing to process.");
            return 0;
        }

        // 1d. Match Files and Notes & Prepare Data Structure
        processCount = Math.min(fileCount, noteCount);
        if (fileCount !== noteCount) {
            console.warn(`[WARNING] Mismatch: ${fileCount} MKV files vs ${noteCount} Anki notes. Processing the first ${processCount} pairs based on MKV creation time order.`);
        }
        if (processCount === 0) {
            console.error("[INFO] No file/note pairs to process after matching.");
            return 0;
        }

        const itemsToProcess = [];
        for (let i = 0; i < processCount; i++) {
            const fileInfo = sortedMkvFiles[i];
            const noteInfo = fetchedNotes[i];
            const token = noteInfo.tokenNo;
            const newFilename = `${token}.mkv`;
            const newPath = path.join(folderPath, newFilename);
            itemsToProcess.push({
                index: i,
                originalPath: fileInfo.path,
                originalFilename: fileInfo.name,
                noteId: noteInfo.noteId,
                token: token,
                newFilename: newFilename,
                newPath: newPath,
                targetCopyPath: path.join(TARGET_COPY_DIR, newFilename),
                soundTag: `[sound:${newFilename}]`,
            });
        }

        // --- Pre-Processing Delay ---
        if (PRE_PROCESSING_DELAY_MS > 0) {
            await delay(PRE_PROCESSING_DELAY_MS);
        }

        // --- 2. Processing Loop ---
        console.log(`\n--- Phase 2: Processing ${processCount} Matched Items ---`);

        for (let i = 0; i < itemsToProcess.length; i++) {
            const item = itemsToProcess[i];
            console.log(`\n[${i + 1}/${processCount}] NoteID: ${item.noteId}`);

            let currentPathForCopy = item.originalPath;
            let stepFailed = false;

            // --- Step 2a: Rename ---
            if (item.originalPath === item.newPath) {
                console.log(`${INDENT}${SUCCESS_MARK} Renaming skipped (already named correctly)`);
                successRenameCount++;
                skippedRenameCount++;
            } else {
                try {
                    try {
                        await fs.access(item.newPath);
                        console.log(`${INDENT}${FAILURE_MARK} Renaming to "${item.newFilename}"`);
                        console.log(`${INDENT}${INDENT}Error: Target file "${item.newFilename}" already exists.`);
                        failRenameCount++;
                        stepFailed = true;
                    } catch (accessError) {
                        if (accessError.code !== 'ENOENT') throw accessError;
                        await fs.rename(item.originalPath, item.newPath);
                        console.log(`${INDENT}${SUCCESS_MARK} Renaming to "${item.newFilename}"`);
                        successRenameCount++;
                        currentPathForCopy = item.newPath;
                    }
                } catch (renameError) {
                    console.log(`${INDENT}${FAILURE_MARK} Renaming to "${item.newFilename}"`);
                    console.log(`${INDENT}${INDENT}Error: ${renameError.message}`);
                    failRenameCount++;
                    stepFailed = true;
                }
            }

            if (stepFailed) {
                if (i < itemsToProcess.length - 1 && INTER_NOTE_DELAY_MS > 0) {
                    await delay(INTER_NOTE_DELAY_MS);
                }
                continue;
            }

            // --- Step 2b: Copy ---
            try {
                await fs.copyFile(currentPathForCopy, item.targetCopyPath);
                console.log(`${INDENT}${SUCCESS_MARK} Copying "${path.basename(currentPathForCopy)}" to "${TARGET_COPY_DIR}"`);
                successCopyCount++;
            } catch (copyError) {
                console.log(`${INDENT}${FAILURE_MARK} Copying "${path.basename(currentPathForCopy)}" to "${TARGET_COPY_DIR}"`);
                console.log(`${INDENT}${INDENT}Error: ${copyError.message}`);
                failCopyCount++;
                stepFailed = true;
            }

            if (stepFailed) {
                if (i < itemsToProcess.length - 1 && INTER_NOTE_DELAY_MS > 0) {
                    await delay(INTER_NOTE_DELAY_MS);
                }
                continue;
            }

            // --- Step 2c: Update Anki Note ---
            try {
                const payload = { note: { id: item.noteId, fields: { [TARGET_UPDATE_FIELD]: item.soundTag } } };
                await ankiConnectRequest("updateNoteFields", payload);
                console.log(`${INDENT}${SUCCESS_MARK} Updating Anki field "${TARGET_UPDATE_FIELD}" with "${item.soundTag}"`);
                successAnkiUpdateCount++;
                overallSuccessCount++;
            } catch (updateError) {
                console.log(`${INDENT}${FAILURE_MARK} Updating Anki field "${TARGET_UPDATE_FIELD}" with "${item.soundTag}"`);
                console.log(`${INDENT}${INDENT}Error: ${updateError.message}`);
                failAnkiUpdateCount++;
            }

             // --- Step 2d: Inter-Note Delay ---
            if (i < itemsToProcess.length - 1 && INTER_NOTE_DELAY_MS > 0) {
                await delay(INTER_NOTE_DELAY_MS);
            }

        } // End of loop

        // --- 3. Final Summary (Keep this logging) ---
        console.log("\n--- Processing Complete ---");
        console.log(`Target Anki Deck:           "${deckNameToUse}"`);
        console.log(`Source MKV Folder:          "${folderPath}"`);
        console.log(`Target Copy Directory:      "${TARGET_COPY_DIR}"`);
        console.log(`Anki Update Field:          "${TARGET_UPDATE_FIELD}"`);
        console.log("---------------------------");
        console.log(`Total MKV files found:        ${fileCount}`);
        console.log(`Total valid Anki notes found: ${noteCount}`);
        console.log(`File/Note pairs processed:    ${processCount}`);
        console.log("--- Operation Results ---");
        console.log("Rename:");
        console.log(`  Success (Renamed):        ${successRenameCount - skippedRenameCount}`);
        console.log(`  Success (Skipped/As Is):  ${skippedRenameCount}`);
        console.log(`  Failed:                   ${failRenameCount}`);
        console.log("Copy:");
        console.log(`  Success:                  ${successCopyCount}`);
        console.log(`  Failed:                   ${failCopyCount}`);
        console.log("Anki Update:");
        console.log(`  Success:                  ${successAnkiUpdateCount}`);
        console.log(`  Failed:                   ${failAnkiUpdateCount}`);
        console.log("---------------------------");
        console.log(`Overall items completed successfully (all steps): ${overallSuccessCount} / ${processCount}`);

        if (failRenameCount > 0 || failCopyCount > 0 || failAnkiUpdateCount > 0) {
            console.error("\nErrors occurred during processing. Please review the logs above.");
            return 1;
        } else if (processCount > 0 && overallSuccessCount === processCount) {
             console.log("\nAll items processed successfully!");
             return 0;
        } else if (processCount > 0) {
             console.log("\nProcessing finished, but some items may not have completed all steps (check logs).");
             return 0;
        }
        return 0;

    } catch (error) {
        console.error("\n--- SCRIPT HALTED ---");
        console.error(`Error during processing: ${error.message}`);
        if (error.stack && process.env.NODE_ENV === 'development') {
             console.error(error.stack);
        }
        console.error("---------------------");
        return 1; // Indicate failure
    }
}


// --- Main Function using Commander ---
async function main() {
    // Define command-line interface
    program
        .version('1.1.0') // Updated version example
        .description('Rename/copy MKV files based on Anki notes and update a specific Anki field.')
        .requiredOption('-p, --path <folderPath>', 'Full path to the folder containing MKV files')
        .parse(process.argv); // Parse arguments from process.argv

    const options = program.opts();
    const folderPathArg = options.path; // Get the path value
    const deckName = DEFAULT_DECK_NAME; // Deck name remains fixed

    let resolvedFolderPath = '';

    // --- Input Validation ---
    try {
        // Trim whitespace and resolve to an absolute path
        resolvedFolderPath = path.resolve(folderPathArg.trim());
        const stats = await fs.stat(resolvedFolderPath);
        if (!stats.isDirectory()) {
            // Use console.error for errors
            console.error(`Error: The provided path is not a directory: "${resolvedFolderPath}"`);
            console.error('Use --help for usage information.');
            process.exitCode = 1; // Set exit code to indicate failure
            return; // Stop execution
        }
        // Path is valid and is a directory
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.error(`Error: Folder not found: "${resolvedFolderPath}" (Resolved from "${folderPathArg}")`);
        } else {
            console.error(`Error accessing path "${resolvedFolderPath}": ${err.message}`);
        }
         console.error('Use --help for usage information.');
        process.exitCode = 1;
        return; // Stop execution
    }

    // --- Execute Core Logic ---
    // Proceed only if folderPath was successfully validated
    const exitCode = await processFilesAndNotes(resolvedFolderPath, deckName);
    process.exitCode = exitCode; // Set exit code based on processing result
}

// --- Run the main function ---
main();