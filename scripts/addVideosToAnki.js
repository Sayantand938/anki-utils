// // addVideosToAnki.js
// const fs = require("fs").promises;
// const path = require("path");
// const http = require("http");
// const { program } = require("commander");

// // --- Configuration ---
// const ANKI_CONNECT_URL = "http://localhost:8765"; // Default AnkiConnect URL
// const TOKEN_FIELD_NAME = "TokenNo";             // The field containing the unique ID
// const TARGET_UPDATE_FIELD = "Video";         // The field in Anki to update with the sound tag
// const ANKI_API_VERSION = 6;
// const ANKI_REQUEST_TIMEOUT = 15000; // 15 seconds timeout for AnkiConnect requests
// const DEFAULT_DECK_NAME = "Custom Study Session"; // Default deck if none provided
// // --- !! Hardcoded Copy Destination !! ---
// const TARGET_COPY_DIR = "D:\\AnkiData\\NOTES\\collection.media"; // Hardcoded path
// // ---------------------

// // --- Helper: AnkiConnect Request ---
// function ankiConnectRequest(action, params = {}) {
//     // ... (AnkiConnect request logic remains the same) ...
//     return new Promise((resolve, reject) => {
//         const payload = JSON.stringify({
//             action: action,
//             version: ANKI_API_VERSION,
//             params: params,
//         });

//         const url = new URL(ANKI_CONNECT_URL);
//         const options = {
//             hostname: url.hostname,
//             port: url.port,
//             path: url.pathname,
//             method: "POST",
//             headers: {
//                 "Content-Type": "application/json; charset=utf-8",
//                 "Content-Length": Buffer.byteLength(payload, "utf-8"),
//             },
//             timeout: ANKI_REQUEST_TIMEOUT,
//         };

//         const req = http.request(options, (res) => {
//             let data = "";
//             res.setEncoding("utf8");
//             res.on("data", (chunk) => { data += chunk; });
//             res.on("end", () => {
//                 if (res.statusCode < 200 || res.statusCode >= 300) {
//                     return reject(new Error(`HTTP Error: ${res.statusCode} ${res.statusMessage}\nResponse: ${data.substring(0, 200)}`));
//                 }
//                 try {
//                     const responseJson = JSON.parse(data);
//                     if (responseJson.error) {
//                          // Handle specific common errors more gracefully
//                         if (action === "notesInfo" && responseJson.error.includes("deck was not found")) {
//                             return reject(new Error(`Anki Error: Deck "${params?.query?.match(/deck:"([^"]+)"/)?.[1] || 'provided name'}" not found.`));
//                         }
//                         if (action === "updateNoteFields" && responseJson.error.includes("field not found")) {
//                              return reject(new Error(`Anki Error: Field "${TARGET_UPDATE_FIELD}" not found in note ID ${params?.note?.id}. Please ensure the field exists in the note type.`));
//                         }
//                          if (action === "updateNoteFields" && responseJson.error.includes("no field named")) {
//                              return reject(new Error(`Anki Error: Field "${Object.keys(params?.note?.fields ?? {})[0]}" (e.g., "${TARGET_UPDATE_FIELD}") not found in note ID ${params?.note?.id}. Check field name and note type.`));
//                         }
//                         throw new Error(`AnkiConnect API Error (${action}): ${responseJson.error}`);
//                     }
//                      // Check for null result explicitly, as updateNoteFields returns null on success
//                     if (responseJson.hasOwnProperty("result")) {
//                          resolve(responseJson.result); // Could be null for updateNoteFields
//                     } else {
//                         throw new Error(`AnkiConnect response missing 'result' field for action ${action}.`);
//                     }
//                 } catch (parseError) {
//                     reject(new Error(`Failed to parse AnkiConnect response: ${parseError.message}\nRaw: ${data.substring(0, 200)}`));
//                 }
//             });
//         });

//         req.on("timeout", () => {
//             req.destroy();
//             reject(new Error(`AnkiConnect request timed out after ${ANKI_REQUEST_TIMEOUT / 1000} seconds.`));
//         });
//         req.on("error", (error) => {
//             if (error.code === "ECONNREFUSED") {
//                 reject(new Error(`Connection refused at ${ANKI_CONNECT_URL}. Is Anki/AnkiConnect running?`));
//             } else {
//                 reject(new Error(`HTTP Request error: ${error.message}`));
//             }
//         });
//         req.write(payload);
//         req.end();
//     });
// }


// // --- Helper: Fetch Note Info (ID and Token) from Anki Deck ---
// async function fetchNoteInfoForDeck(deckName) {
//     console.log(`[Anki] Fetching notes from deck: "${deckName}"...`);
//     let notesInfo;
//     try {
//         notesInfo = await ankiConnectRequest("notesInfo", {
//             query: `deck:"${deckName}"`,
//         });
//     } catch (err) {
//         // Rethrow specific deck not found error, handle others generally
//         if (err.message.includes("Deck") && err.message.includes("not found")) {
//             throw err;
//         }
//         throw new Error(`[Anki] Failed to fetch notes info: ${err.message}`);
//     }


//     if (!notesInfo || notesInfo.length === 0) {
//         console.log(`[Anki] No notes found in deck "${deckName}".`);
//         return [];
//     }

//     console.log(`[Anki] Found ${notesInfo.length} notes. Extracting Note ID and '${TOKEN_FIELD_NAME}'...`);

//     const extractedNotes = notesInfo
//         .map((note, index) => {
//             const tokenValue = note?.fields?.[TOKEN_FIELD_NAME]?.value;
//             const noteId = note?.noteId;

//             if (!noteId) {
//                  console.warn(`[Anki] Warning: Note index ${index} is missing a Note ID. Skipping.`);
//                  return null;
//             }
//             if (!tokenValue) {
//                 console.warn(`[Anki] Warning: Note ID ${noteId} (Index ${index}) is missing '${TOKEN_FIELD_NAME}' field or value. Skipping.`);
//                 return null;
//             }

//             // Ensure token doesn't contain invalid filename characters (basic check)
//             const sanitizedToken = tokenValue.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
//             if (sanitizedToken !== tokenValue) {
//                 console.warn(`[Anki] Warning: Token "${tokenValue}" contained invalid characters or extra whitespace, sanitized to "${sanitizedToken}". Note ID: ${noteId}`);
//             }
//             if (!sanitizedToken) {
//                  console.warn(`[Anki] Warning: Note ID ${noteId} resulted in an empty token after sanitization ("${tokenValue}"). Skipping.`);
//                  return null;
//             }

//             // Check if the target update field exists (optional, but good for early warning)
//             if (!note?.fields?.hasOwnProperty(TARGET_UPDATE_FIELD)) {
//                  console.warn(`[Anki] Warning: Note ID ${noteId} does not appear to have the target field "${TARGET_UPDATE_FIELD}". Update may fail later.`);
//             }


//             return { noteId: noteId, tokenNo: sanitizedToken };
//         })
//         .filter(noteData => noteData !== null);

//     if (extractedNotes.length !== notesInfo.length) {
//          console.warn(`[Anki] Note: ${notesInfo.length - extractedNotes.length} notes were excluded due to missing Note ID, missing/invalid '${TOKEN_FIELD_NAME}', or other issues.`);
//     }

//     // **Important:** We are returning the notes in the order Anki provided them.
//     // The pairing logic relies on this order matching the file creation order.
//     console.log(`[Anki] Successfully extracted info for ${extractedNotes.length} notes.`);
//     return extractedNotes;
// }

// // --- Helper: Get and Sort MKV Files by Creation Time ---
// async function getSortedMkvFiles(folderPath) {
//     // ... (getSortedMkvFiles logic remains the same) ...
//     console.log(`[FS] Reading directory: "${folderPath}"...`);
//     let filesWithStats = [];
//     try {
//         const dirents = await fs.readdir(folderPath, { withFileTypes: true });
//         const mkvFiles = dirents.filter(dirent => dirent.isFile() && path.extname(dirent.name).toLowerCase() === '.mkv');

//         console.log(`[FS] Found ${mkvFiles.length} MKV files. Getting creation times...`);

//         for (const file of mkvFiles) {
//             const fullPath = path.join(folderPath, file.name);
//             try {
//                 const stats = await fs.stat(fullPath);
//                 filesWithStats.push({ path: fullPath, birthtimeMs: stats.birthtimeMs });
//             } catch (statError) {
//                 console.warn(`[FS] Warning: Could not get stats for "${file.name}": ${statError.message}. Skipping file.`);
//             }
//         }
//     } catch (readDirError) {
//         throw new Error(`[FS] Failed to read directory "${folderPath}": ${readDirError.message}`);
//     }

//     // Sort by creation time (birthtimeMs)
//     filesWithStats.sort((a, b) => a.birthtimeMs - b.birthtimeMs);

//     console.log(`[FS] Sorted ${filesWithStats.length} MKV files by creation time.`);
//     return filesWithStats.map(f => f.path); // Return only the paths in sorted order
// }

// // --- Helper: Transform Deck Input (like Prelims::165 to Prelims-165) ---
// function transformInputToDeckName(rawInput) {
//     // ... (transformInputToDeckName logic remains the same) ...
//     if (!rawInput) return "";
//     const trimmedInput = rawInput.trim();
//     const match = trimmedInput.match(/^(.+?)::(\d+)$/);
//     if (match && match[1] && match[2]) {
//         const transformedName = `${match[1]}-${match[2]}`;
//         console.log(`[INFO] Input "${trimmedInput}" transformed to deck name: "${transformedName}"`);
//         return transformedName;
//     }
//     if (trimmedInput !== DEFAULT_DECK_NAME && !match) {
//         console.log(`[INFO] Input "${trimmedInput}" used directly as deck name.`);
//     }
//     return trimmedInput;
// }

// // --- Helper: Update Anki Note Field ---
// async function updateAnkiNoteVideoField(noteId, soundTag, dryRun) {
//     if (dryRun) {
//         // console.log(`DRY RUN: Would update Note ID ${noteId}, Field "${TARGET_UPDATE_FIELD}" with: ${soundTag}`);
//         return true; // Simulate success
//     }

//     const payload = {
//         note: {
//             id: noteId,
//             fields: {
//                 [TARGET_UPDATE_FIELD]: soundTag // Use computed property name
//             },
//             // No need for audio/video/picture array here, we're just setting field text
//         }
//     };

//     try {
//         await ankiConnectRequest("updateNoteFields", payload);
//         // updateNoteFields returns null on success, so no need to check result value
//         return true;
//     } catch (error) {
//         console.error(`\n  └─ [Anki Update Error] Failed for Note ID ${noteId}: ${error.message}`);
//         // Avoid logging the full stack trace here unless needed, keep it concise
//         return false;
//     }
// }


// // --- Main Execution Logic ---
// async function main(folderPath, rawDeckInput, options) {
//     console.log("--- Starting MKV Renaming, Copying, and Anki Update Process ---");
//     const { dryRun } = options;

//     if (dryRun) {
//         console.log("\n*** DRY RUN MODE ENABLED: No files will be renamed/copied, no Anki notes updated. ***\n");
//     } else {
//         console.log(`\n[COPY] Files will be copied to: "${TARGET_COPY_DIR}"`);
//         console.log(`[ANKI] Notes will be updated in field: "${TARGET_UPDATE_FIELD}"\n`);
//     }

//     try {
//         // 1. Validate Folder Paths
//         console.log(`[FS] Checking source folder path: ${folderPath}`);
//         try {
//             const stats = await fs.stat(folderPath);
//             if (!stats.isDirectory()) {
//                 throw new Error(`Source path is not a directory: ${folderPath}`);
//             }
//             console.log("[FS] Source folder exists and is a directory.");
//         } catch (err) {
//             if (err.code === 'ENOENT') { throw new Error(`Source folder not found: ${folderPath}`); }
//             throw err;
//         }

//         if (!dryRun) {
//             console.log(`[FS] Checking target copy directory: ${TARGET_COPY_DIR}`);
//              try {
//                 await fs.access(TARGET_COPY_DIR, fs.constants.W_OK); // Check write permissions too
//                 const stats = await fs.stat(TARGET_COPY_DIR);
//                 if (!stats.isDirectory()) {
//                     throw new Error(`Target copy path exists but is not a directory: ${TARGET_COPY_DIR}`);
//                 }
//                 console.log("[FS] Target copy directory exists and is writable.");
//              } catch (err) {
//                 if (err.code === 'ENOENT') {
//                      throw new Error(`Target copy directory not found: ${TARGET_COPY_DIR}. Please create it first.`);
//                 } else if (err.code === 'EPERM' || err.code === 'EACCES') {
//                      throw new Error(`No write permission for target copy directory: ${TARGET_COPY_DIR}`);
//                 }
//                  throw new Error(`Error accessing target copy directory "${TARGET_COPY_DIR}": ${err.message}`);
//              }
//         } else {
//              console.log(`[FS] Skipping check for target copy directory in dry run: ${TARGET_COPY_DIR}`);
//         }


//         // 2. Determine Deck Name and Fetch Note Info (ID + Token)
//         const deckNameToUse = transformInputToDeckName(rawDeckInput);
//         if (!deckNameToUse) throw new Error("Anki deck name cannot be empty.");
//         console.log(`[INFO] Using Anki deck: "${deckNameToUse}"`);
//         const fetchedNotes = await fetchNoteInfoForDeck(deckNameToUse); // Now gets {noteId, tokenNo}
//         if (fetchedNotes.length === 0) {
//             console.log("[INFO] No valid notes (with Note ID and TokenNo) fetched from Anki. Cannot proceed.");
//             return;
//         }

//         // 3. Get Sorted MKV Files
//         const sortedMkvFiles = await getSortedMkvFiles(folderPath);
//         if (sortedMkvFiles.length === 0) {
//             console.log("[INFO] No MKV files found in the specified folder. Nothing to process.");
//             return;
//         }

//         // 4. Match Files and Notes, then Rename, Copy, and Update Anki
//         const fileCount = sortedMkvFiles.length;
//         const noteCount = fetchedNotes.length;

//         console.log(`\n[INFO] Matching ${fileCount} sorted MKV files with ${noteCount} fetched Anki notes.`);

//         if (fileCount !== noteCount) {
//             console.warn("\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
//             console.warn(`[WARNING] Mismatch: Found ${fileCount} MKV files but ${noteCount} valid Anki notes.`);
//             console.warn(`         Will only process the first ${Math.min(fileCount, noteCount)} pairs.`);
//             console.warn("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n");
//         }

//         const processCount = Math.min(fileCount, noteCount);
//         let successRenameCount = 0;
//         let successCopyCount = 0;
//         let successAnkiUpdateCount = 0;
//         let failRenameCount = 0;
//         let failCopyCount = 0;
//         let failAnkiUpdateCount = 0;
//         let skippedCount = 0;

//         console.log(`[PROCESS] Starting processing loop for ${processCount} file-note pairs...`);

//         for (let i = 0; i < processCount; i++) {
//             const originalPath = sortedMkvFiles[i];
//             const originalFilename = path.basename(originalPath);
//             const noteInfo = fetchedNotes[i]; // { noteId: ..., tokenNo: ... }
//             const token = noteInfo.tokenNo;
//             const noteId = noteInfo.noteId;

//             const newFilename = `${token}.mkv`;
//             const newPath = path.join(folderPath, newFilename);
//             const targetCopyPath = path.join(TARGET_COPY_DIR, newFilename);
//             const soundTag = `[sound:${newFilename}]`; // Generate the sound tag

//             let renamedSuccessfully = false;
//             let copiedSuccessfully = false;

//             process.stdout.write(`\r[${i + 1}/${processCount}] Processing "${originalFilename}" (Note ID ${noteId}) -> "${newFilename}"... `);

//             // --- Check if already named ---
//             if (originalPath === newPath) {
//                 process.stdout.write("Skipped (already named).");
//                 skippedCount++;
//                 renamedSuccessfully = true; // Treat as successful rename for subsequent steps
//                 // Still try to copy and update Anki even if rename was skipped
//             } else {
//             // --- Rename Step ---
//                 if (!dryRun) {
//                     try {
//                         await fs.rename(originalPath, newPath);
//                         process.stdout.write(" Renamed.");
//                         successRenameCount++;
//                         renamedSuccessfully = true;
//                     } catch (renameError) {
//                         process.stdout.write(` Rename FAILED: ${renameError.message}\n`);
//                         failRenameCount++;
//                         continue; // Skip copy and Anki update if rename failed
//                     }
//                 } else {
//                      // Dry run rename simulation (check if target exists)
//                      try {
//                         await fs.access(newPath, fs.constants.F_OK);
//                         process.stdout.write(" DRY RUN: Skip rename (Target exists).");
//                      } catch (accessError) {
//                          if (accessError.code === 'ENOENT') { process.stdout.write(" DRY RUN: Would rename."); }
//                          else { process.stdout.write(` DRY RUN: WARN (Potential issue: ${accessError.message}).`); }
//                      }
//                      successRenameCount++; // Count simulated renames
//                      renamedSuccessfully = true; // Simulate success for subsequent steps
//                 }
//             }

//             // --- Copy Step (only if rename was successful/skipped/simulated) ---
//             if (renamedSuccessfully) {
//                  if (!dryRun) {
//                     try {
//                         await fs.copyFile(newPath, targetCopyPath);
//                         process.stdout.write(" Copied.");
//                         successCopyCount++;
//                         copiedSuccessfully = true;
//                     } catch (copyError) {
//                         process.stdout.write(` Copy FAILED: ${copyError.message}\n`);
//                         failCopyCount++;
//                          // Decide if you want to continue to Anki update if copy fails.
//                          // Currently, it will continue. Add 'continue;' here to skip Anki update on copy fail.
//                     }
//                  } else {
//                      process.stdout.write(" (Would copy).");
//                      successCopyCount++; // Count simulated copies
//                      copiedSuccessfully = true; // Simulate success for Anki update step
//                  }
//             }

//             // --- Anki Update Step (only if rename was successful/skipped/simulated) ---
//             // Note: We proceed even if copy failed, based on current logic.
//              if (renamedSuccessfully) {
//                   process.stdout.write(` Updating Anki (Note ${noteId})...`);
//                   const updateSuccess = await updateAnkiNoteVideoField(noteId, soundTag, dryRun);
//                   if (updateSuccess) {
//                       process.stdout.write(" Updated.\n");
//                       successAnkiUpdateCount++;
//                   } else {
//                       process.stdout.write(" Update FAILED.\n"); // Error details logged by updateAnkiNoteVideoField
//                       failAnkiUpdateCount++;
//                   }
//              }

//         } // End of loop

//         // 5. Final Summary
//         console.log("\n--- Processing Complete ---");
//         if (dryRun) console.log("*** NOTE: Dry run mode was active. No files or Anki notes were changed. ***");
//         console.log(`Target Anki Deck:           "${deckNameToUse}"`);
//         console.log(`Source MKV Folder:          "${folderPath}"`);
//         if (!dryRun) {
//             console.log(`Target Copy Directory:      "${TARGET_COPY_DIR}"`);
//             console.log(`Anki Update Field:          "${TARGET_UPDATE_FIELD}"`);
//         }
//         console.log(`Total MKV files found:        ${fileCount}`);
//         console.log(`Total valid Anki notes found: ${noteCount}`);
//         console.log(`File/Note pairs processed:    ${processCount}`);
//         console.log(`Files skipped (already named):${skippedCount}`);
//         if (!dryRun) {
//             console.log(`Successfully renamed:       ${successRenameCount}`);
//             console.log(`Successfully copied:        ${successCopyCount}`);
//             console.log(`Successfully updated Anki:  ${successAnkiUpdateCount}`);
//             console.log(`Failed renames:             ${failRenameCount}`);
//             console.log(`Failed copies:              ${failCopyCount}`);
//             console.log(`Failed Anki updates:        ${failAnkiUpdateCount}`);
//         } else {
//              console.log(`Simulated renames:        ${successRenameCount}`);
//              console.log(`Simulated copies:         ${successCopyCount}`);
//              console.log(`Simulated Anki updates:   ${successAnkiUpdateCount}`);
//         }
//         console.log("---------------------------");

//         // Exit with error code if any actual operation failed
//         if (!dryRun && (failRenameCount > 0 || failCopyCount > 0 || failAnkiUpdateCount > 0)) {
//              process.exitCode = 1;
//         }

//     } catch (error) {
//         console.error("\n--- SCRIPT FAILED ---");
//         console.error(`Error: ${error.message}`);
//         if (error.stack && !error.message.includes(error.stack.split('\n')[1]?.trim())) { // Optional: more detailed stack
//             console.error(error.stack);
//         }
//         console.error("---------------------");
//         process.exitCode = 1;
//     }
// }

// // --- Setup Commander ---
// program
//     .name("addVideosToAnki")
//     .description(`Renames MKVs by Anki TokenNo, copies them to ${TARGET_COPY_DIR}, and updates the '${TARGET_UPDATE_FIELD}' field in matching Anki notes.`)
//     .version("1.3.0") // Incremented version
//     .requiredOption("-f, --folder <path>", "Path to the folder containing MKV files")
//     .option(
//         "-d, --deck <name>",
//         `Anki deck name (e.g., "Prelims::162"). Defaults to "${DEFAULT_DECK_NAME}"`,
//         DEFAULT_DECK_NAME
//     )
//     .option('--dry-run', 'Simulate all actions without changing files or Anki notes', false)
//     .action((options) => {
//         main(options.folder, options.deck, { dryRun: options.dryRun });
//     });

// // --- Parse Arguments and Run ---
// program.parse(process.argv);


// renameMkvByAnkiTokenAndUpdateNote_Sequential.js
const fs = require("fs").promises;
const path = require("path");
const http = require("http");
const { program } = require("commander");

// --- Configuration ---
const ANKI_CONNECT_URL = "http://localhost:8765";
const TOKEN_FIELD_NAME = "TokenNo";
const TARGET_UPDATE_FIELD = "Video";
const ANKI_API_VERSION = 6;
const ANKI_REQUEST_TIMEOUT = 15000;
const DEFAULT_DECK_NAME = "Custom Study Session";
const TARGET_COPY_DIR = "D:\\AnkiData\\NOTES\\collection.media";
// --- New Configuration ---
const ANKI_UPDATE_DELAY_MS = 1000; // Delay between Anki updates in milliseconds
// ---------------------

// --- Helper: AnkiConnect Request ---
// ... (AnkiConnect request logic remains the same) ...
function ankiConnectRequest(action, params = {}) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({ action: action, version: ANKI_API_VERSION, params: params });
        const url = new URL(ANKI_CONNECT_URL);
        const options = { /* ... options ... */
            hostname: url.hostname, port: url.port, path: url.pathname, method: "POST",
            headers: { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload, "utf-8") },
            timeout: ANKI_REQUEST_TIMEOUT
        };
        const req = http.request(options, (res) => {
            let data = "";
            res.setEncoding("utf8");
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
                if (res.statusCode < 200 || res.statusCode >= 300) { return reject(new Error(`HTTP Error: ${res.statusCode} ${res.statusMessage}\nResponse: ${data.substring(0, 200)}`)); }
                try {
                    const responseJson = JSON.parse(data);
                    if (responseJson.error) {
                        if (action === "notesInfo" && responseJson.error.includes("deck was not found")) { return reject(new Error(`Anki Error: Deck "${params?.query?.match(/deck:"([^"]+)"/)?.[1] || 'provided name'}" not found.`)); }
                        if (action === "updateNoteFields" && responseJson.error.includes("field not found")) { return reject(new Error(`Anki Error: Field "${TARGET_UPDATE_FIELD}" not found in note ID ${params?.note?.id}. Please ensure the field exists in the note type.`)); }
                        if (action === "updateNoteFields" && responseJson.error.includes("no field named")) { return reject(new Error(`Anki Error: Field "${Object.keys(params?.note?.fields ?? {})[0]}" (e.g., "${TARGET_UPDATE_FIELD}") not found in note ID ${params?.note?.id}. Check field name and note type.`)); }
                        throw new Error(`AnkiConnect API Error (${action}): ${responseJson.error}`);
                    }
                    if (responseJson.hasOwnProperty("result")) { resolve(responseJson.result); }
                    else { throw new Error(`AnkiConnect response missing 'result' field for action ${action}.`); }
                } catch (parseError) { reject(new Error(`Failed to parse AnkiConnect response: ${parseError.message}\nRaw: ${data.substring(0, 200)}`)); }
            });
        });
        req.on("timeout", () => { req.destroy(); reject(new Error(`AnkiConnect request timed out after ${ANKI_REQUEST_TIMEOUT / 1000} seconds.`)); });
        req.on("error", (error) => {
            if (error.code === "ECONNREFUSED") { reject(new Error(`Connection refused at ${ANKI_CONNECT_URL}. Is Anki/AnkiConnect running?`)); }
            else { reject(new Error(`HTTP Request error: ${error.message}`)); }
        });
        req.write(payload);
        req.end();
    });
}


// --- Helper: Fetch Note Info (ID and Token) from Anki Deck ---
// ... (fetchNoteInfoForDeck logic remains the same) ...
async function fetchNoteInfoForDeck(deckName) {
    console.log(`[Anki] Fetching notes from deck: "${deckName}"...`);
    let notesInfo;
    try { notesInfo = await ankiConnectRequest("notesInfo", { query: `deck:"${deckName}"` }); }
    catch (err) {
        if (err.message.includes("Deck") && err.message.includes("not found")) { throw err; }
        throw new Error(`[Anki] Failed to fetch notes info: ${err.message}`);
    }
    if (!notesInfo || notesInfo.length === 0) { console.log(`[Anki] No notes found in deck "${deckName}".`); return []; }
    console.log(`[Anki] Found ${notesInfo.length} notes. Extracting Note ID and '${TOKEN_FIELD_NAME}'...`);
    const extractedNotes = notesInfo.map((note, index) => {
            const tokenValue = note?.fields?.[TOKEN_FIELD_NAME]?.value;
            const noteId = note?.noteId;
            if (!noteId) { console.warn(`[Anki] Warning: Note index ${index} is missing a Note ID. Skipping.`); return null; }
            if (!tokenValue) { console.warn(`[Anki] Warning: Note ID ${noteId} (Index ${index}) is missing '${TOKEN_FIELD_NAME}' field or value. Skipping.`); return null; }
            const sanitizedToken = tokenValue.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
            if (sanitizedToken !== tokenValue) { console.warn(`[Anki] Warning: Token "${tokenValue}" contained invalid characters or extra whitespace, sanitized to "${sanitizedToken}". Note ID: ${noteId}`); }
            if (!sanitizedToken) { console.warn(`[Anki] Warning: Note ID ${noteId} resulted in an empty token after sanitization ("${tokenValue}"). Skipping.`); return null; }
            // if (!note?.fields?.hasOwnProperty(TARGET_UPDATE_FIELD)) { console.warn(`[Anki] Warning: Note ID ${noteId} does not appear to have the target field "${TARGET_UPDATE_FIELD}". Update may fail later.`); } // Check can be done just before update
            return { noteId: noteId, tokenNo: sanitizedToken };
        }).filter(noteData => noteData !== null);
    if (extractedNotes.length !== notesInfo.length) { console.warn(`[Anki] Note: ${notesInfo.length - extractedNotes.length} notes were excluded due to missing Note ID, missing/invalid '${TOKEN_FIELD_NAME}', or other issues.`); }
    console.log(`[Anki] Successfully extracted info for ${extractedNotes.length} notes.`);
    return extractedNotes;
}


// --- Helper: Get and Sort MKV Files by Creation Time ---
// ... (getSortedMkvFiles logic remains the same) ...
async function getSortedMkvFiles(folderPath) {
    console.log(`[FS] Reading directory: "${folderPath}"...`);
    let filesWithStats = [];
    try {
        const dirents = await fs.readdir(folderPath, { withFileTypes: true });
        const mkvFiles = dirents.filter(dirent => dirent.isFile() && path.extname(dirent.name).toLowerCase() === '.mkv');
        console.log(`[FS] Found ${mkvFiles.length} MKV files. Getting creation times...`);
        for (const file of mkvFiles) {
            const fullPath = path.join(folderPath, file.name);
            try {
                const stats = await fs.stat(fullPath);
                filesWithStats.push({ path: fullPath, birthtimeMs: stats.birthtimeMs });
            } catch (statError) { console.warn(`[FS] Warning: Could not get stats for "${file.name}": ${statError.message}. Skipping file.`); }
        }
    } catch (readDirError) { throw new Error(`[FS] Failed to read directory "${folderPath}": ${readDirError.message}`); }
    filesWithStats.sort((a, b) => a.birthtimeMs - b.birthtimeMs);
    console.log(`[FS] Sorted ${filesWithStats.length} MKV files by creation time.`);
    return filesWithStats.map(f => f.path);
}

// --- Helper: Transform Deck Input (like Prelims::165 to Prelims-165) ---
// ... (transformInputToDeckName logic remains the same) ...
function transformInputToDeckName(rawInput) {
    if (!rawInput) return "";
    const trimmedInput = rawInput.trim();
    const match = trimmedInput.match(/^(.+?)::(\d+)$/);
    if (match && match[1] && match[2]) {
        const transformedName = `${match[1]}-${match[2]}`;
        console.log(`[INFO] Input "${trimmedInput}" transformed to deck name: "${transformedName}"`);
        return transformedName;
    }
    if (trimmedInput !== DEFAULT_DECK_NAME && !match) { console.log(`[INFO] Input "${trimmedInput}" used directly as deck name.`); }
    return trimmedInput;
}


// --- Helper: Update Anki Note Field ---
// ... (updateAnkiNoteVideoField logic remains the same, Dry Run handling might change slightly if delay is skipped) ...
async function updateAnkiNoteVideoField(noteId, soundTag, dryRun) {
    if (dryRun) {
        // In dry run, we don't actually call AnkiConnect
        return true; // Simulate success
    }
    const payload = { note: { id: noteId, fields: { [TARGET_UPDATE_FIELD]: soundTag } } };
    try {
        await ankiConnectRequest("updateNoteFields", payload);
        return true;
    } catch (error) {
        // Log error here, as it's specific to this step
        console.error(`\n  └─ [Anki Update Error] Failed for Note ID ${noteId}: ${error.message}`);
        return false;
    }
}

// --- Helper: Delay Function ---
function delay(ms) {
    if (ms <= 0) return Promise.resolve();
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Main Execution Logic ---
async function main(folderPath, rawDeckInput, options) {
    console.log("--- Starting MKV Renaming, Copying, and Anki Update Process (Sequential) ---");
    const { dryRun } = options;
    const effectiveDelay = dryRun ? 0 : ANKI_UPDATE_DELAY_MS; // No delay in dry run

    if (dryRun) {
        console.log("\n*** DRY RUN MODE ENABLED: No files/notes changed. Delays skipped. ***\n");
    } else {
        console.log(`\n[COPY] Target directory: "${TARGET_COPY_DIR}"`);
        console.log(`[ANKI] Target field: "${TARGET_UPDATE_FIELD}"`);
        console.log(`[ANKI] Update delay: ${ANKI_UPDATE_DELAY_MS / 1000} second(s)\n`);
    }

    let processedItems = []; // Array to hold info for each file/note pair
    let fileCount = 0;
    let noteCount = 0;
    let processCount = 0;

    // Counters for each phase
    let successRenameCount = 0, failRenameCount = 0, skippedRenameCount = 0;
    let successCopyCount = 0, failCopyCount = 0;
    let successAnkiUpdateCount = 0, failAnkiUpdateCount = 0;

    try {
        // --- Preparation Phase ---
        console.log("--- Phase 0: Preparation ---");
        // 1. Validate Paths
        console.log(`[FS] Checking source folder: ${folderPath}`);
        // ... (validation logic as before) ...
        try { const stats = await fs.stat(folderPath); if (!stats.isDirectory()) throw new Error('Not a directory'); console.log("[FS] Source folder OK."); }
        catch (err) { if (err.code === 'ENOENT') throw new Error(`Source folder not found: ${folderPath}`); throw err; }

        if (!dryRun) {
            console.log(`[FS] Checking target copy directory: ${TARGET_COPY_DIR}`);
            // ... (validation logic as before) ...
             try { await fs.access(TARGET_COPY_DIR, fs.constants.W_OK); const stats = await fs.stat(TARGET_COPY_DIR); if (!stats.isDirectory()) throw new Error('Not a directory'); console.log("[FS] Target copy directory OK."); }
             catch (err) { if (err.code === 'ENOENT') throw new Error(`Target copy directory not found: ${TARGET_COPY_DIR}. Create it first.`); else if (err.code === 'EPERM' || err.code === 'EACCES') throw new Error(`No write permission for target copy directory: ${TARGET_COPY_DIR}`); else throw new Error(`Error accessing target copy directory: ${err.message}`); }
        } else { console.log(`[FS] Skipping target copy directory check in dry run.`); }

        // 2. Fetch Note Info
        const deckNameToUse = transformInputToDeckName(rawDeckInput);
        if (!deckNameToUse) throw new Error("Anki deck name cannot be empty.");
        console.log(`[INFO] Using Anki deck: "${deckNameToUse}"`);
        const fetchedNotes = await fetchNoteInfoForDeck(deckNameToUse);
        noteCount = fetchedNotes.length;
        if (noteCount === 0) { console.log("[INFO] No valid notes fetched from Anki. Aborting."); return; }

        // 3. Get Sorted MKV Files
        const sortedMkvFiles = await getSortedMkvFiles(folderPath);
        fileCount = sortedMkvFiles.length;
        if (fileCount === 0) { console.log("[INFO] No MKV files found. Aborting."); return; }

        // 4. Match Files and Notes & Prepare Data Structure
        console.log(`\n[INFO] Matching ${fileCount} files with ${noteCount} notes.`);
        processCount = Math.min(fileCount, noteCount);
        if (fileCount !== noteCount) {
            console.warn(`[WARNING] Mismatch: ${fileCount} files vs ${noteCount} notes. Processing first ${processCount} pairs.`);
        }
        if (processCount === 0) { console.log("[INFO] No file/note pairs to process. Aborting."); return; }

        console.log(`[INFO] Preparing data for ${processCount} items...`);
        for (let i = 0; i < processCount; i++) {
            const originalPath = sortedMkvFiles[i];
            const noteInfo = fetchedNotes[i];
            const token = noteInfo.tokenNo;
            const newFilename = `${token}.mkv`;
            const newPath = path.join(folderPath, newFilename);
            processedItems.push({
                index: i,
                originalPath: originalPath,
                originalFilename: path.basename(originalPath),
                noteId: noteInfo.noteId,
                token: token,
                newFilename: newFilename,
                newPath: newPath,
                targetCopyPath: path.join(TARGET_COPY_DIR, newFilename),
                soundTag: `[sound:${newFilename}]`,
                renameSuccess: false, // Will be updated in Phase 1
                copySuccess: false,   // Will be updated in Phase 2
                updateSuccess: false, // Will be updated in Phase 3
                skippedRename: false
            });
        }
        console.log("[INFO] Preparation complete.");

        // --- Phase 1: Rename Files ---
        console.log(`\n--- Phase 1: Renaming ${processCount} Files ---`);
        for (const item of processedItems) {
            process.stdout.write(`\r[${item.index + 1}/${processCount}] Renaming "${item.originalFilename}" -> "${item.newFilename}"... `);

            if (item.originalPath === item.newPath) {
                process.stdout.write("Skipped (already named).\n");
                item.renameSuccess = true; // Treat as success for subsequent steps
                item.skippedRename = true;
                skippedRenameCount++;
                successRenameCount++; // Count skipped as a form of success here
                continue;
            }

            if (!dryRun) {
                try {
                    await fs.rename(item.originalPath, item.newPath);
                    process.stdout.write("Success.\n");
                    item.renameSuccess = true;
                    successRenameCount++;
                } catch (renameError) {
                    process.stdout.write(`FAILED: ${renameError.message}\n`);
                    item.renameSuccess = false;
                    failRenameCount++;
                }
            } else {
                // Dry run rename simulation
                try { await fs.access(item.newPath, fs.constants.F_OK); process.stdout.write("DRY RUN: Skipped (Target exists).\n"); }
                catch (accessError) { if (accessError.code === 'ENOENT') { process.stdout.write("DRY RUN: OK (Would rename).\n"); } else { process.stdout.write(`DRY RUN: WARN (${accessError.message}).\n`); } }
                item.renameSuccess = true; // Simulate success
                successRenameCount++;
            }
        }
        console.log(`[Phase 1 Summary] Renamed/Skipped: ${successRenameCount}, Failed: ${failRenameCount}`);

        // --- Phase 2: Copy Files ---
        const itemsToCopy = processedItems.filter(item => item.renameSuccess);
        console.log(`\n--- Phase 2: Copying ${itemsToCopy.length} Files ---`);
        if (itemsToCopy.length === 0 && failRenameCount < processCount) {
             console.log("[INFO] No files were successfully renamed (or simulated), skipping copy phase.");
        } else {
             for (const item of itemsToCopy) {
                 process.stdout.write(`\r[${item.index + 1}/${processCount}] Copying "${item.newFilename}" to ${TARGET_COPY_DIR}... `);
                 if (!dryRun) {
                     try {
                         // Source for copy is the NEW path (or original if skipped rename)
                         const sourcePath = item.skippedRename ? item.originalPath : item.newPath;
                         await fs.copyFile(sourcePath, item.targetCopyPath);
                         process.stdout.write("Success.\n");
                         item.copySuccess = true;
                         successCopyCount++;
                     } catch (copyError) {
                         process.stdout.write(`FAILED: ${copyError.message}\n`);
                         item.copySuccess = false;
                         failCopyCount++;
                     }
                 } else {
                     process.stdout.write("DRY RUN: OK (Would copy).\n");
                     item.copySuccess = true; // Simulate success
                     successCopyCount++;
                 }
             }
             console.log(`[Phase 2 Summary] Copied: ${successCopyCount}, Failed: ${failCopyCount}`);
        }


        // --- Phase 3: Update Anki Notes ---
        const itemsToUpdate = processedItems.filter(item => item.renameSuccess); // Update notes whose files were successfully renamed/skipped
        console.log(`\n--- Phase 3: Updating ${itemsToUpdate.length} Anki Notes ---`);
         if (itemsToUpdate.length === 0 && failRenameCount < processCount) {
             console.log("[INFO] No files were successfully renamed (or simulated), skipping Anki update phase.");
        } else {
             for (let i = 0; i < itemsToUpdate.length; i++) {
                 const item = itemsToUpdate[i];

                 // Apply delay before each update (except the first one if desired, but applying before all is simpler)
                 if (i > 0 || itemsToUpdate.length > 1) { // Apply delay if not the very first item overall in this phase
                    if (dryRun) {
                        process.stdout.write(`\r[${item.index + 1}/${processCount}] DRY RUN: Would wait ${ANKI_UPDATE_DELAY_MS}ms... `);
                    } else {
                        process.stdout.write(`\r[${item.index + 1}/${processCount}] Waiting ${ANKI_UPDATE_DELAY_MS}ms... `);
                        await delay(effectiveDelay);
                    }
                 }

                 process.stdout.write(`\r[${item.index + 1}/${processCount}] Updating Note ID ${item.noteId} Field "${TARGET_UPDATE_FIELD}" with "${item.soundTag}"... `);

                 const updateSuccess = await updateAnkiNoteVideoField(item.noteId, item.soundTag, dryRun);

                 if (updateSuccess) {
                     process.stdout.write("Success.\n");
                     item.updateSuccess = true;
                     successAnkiUpdateCount++;
                 } else {
                     // Error is logged within updateAnkiNoteVideoField
                     process.stdout.write("FAILED.\n"); // Keep output consistent
                     item.updateSuccess = false;
                     failAnkiUpdateCount++;
                 }
             }
            console.log(`[Phase 3 Summary] Updated: ${successAnkiUpdateCount}, Failed: ${failAnkiUpdateCount}`);
        }


        // --- Final Summary ---
        console.log("\n--- Processing Complete ---");
        if (dryRun) console.log("*** NOTE: Dry run mode was active. No files or Anki notes were changed. ***");
        console.log(`Target Anki Deck:           "${deckNameToUse}"`);
        console.log(`Source MKV Folder:          "${folderPath}"`);
        if (!dryRun) console.log(`Target Copy Directory:      "${TARGET_COPY_DIR}"`);
        if (!dryRun) console.log(`Anki Update Field:          "${TARGET_UPDATE_FIELD}"`);
        console.log(`Total MKV files found:        ${fileCount}`);
        console.log(`Total valid Anki notes found: ${noteCount}`);
        console.log(`File/Note pairs matched:      ${processCount}`);
        console.log("--- Results ---");
        if (!dryRun) {
            console.log(`Phase 1 (Rename): Skipped: ${skippedRenameCount}, Renamed: ${successRenameCount - skippedRenameCount}, Failed: ${failRenameCount}`);
            console.log(`Phase 2 (Copy):   Copied: ${successCopyCount}, Failed: ${failCopyCount}`);
            console.log(`Phase 3 (Anki):   Updated: ${successAnkiUpdateCount}, Failed: ${failAnkiUpdateCount}`);
        } else {
            console.log(`Phase 1 (Rename): Simulated OK: ${successRenameCount}, Simulated Fail: ${failRenameCount}`);
            console.log(`Phase 2 (Copy):   Simulated OK: ${successCopyCount}, Simulated Fail: ${failCopyCount}`);
            console.log(`Phase 3 (Anki):   Simulated OK: ${successAnkiUpdateCount}, Simulated Fail: ${failAnkiUpdateCount}`);
        }
        console.log("---------------");

        // Exit with error code if any actual operation failed
        if (!dryRun && (failRenameCount > 0 || failCopyCount > 0 || failAnkiUpdateCount > 0)) {
             process.exitCode = 1;
        }

    } catch (error) {
        console.error("\n--- SCRIPT FAILED ---");
        console.error(`Error: ${error.message}`);
        if (error.stack && !error.message.includes(error.stack.split('\n')[1]?.trim())) {
            console.error(error.stack);
        }
        console.error("---------------------");
        process.exitCode = 1;
    }
}

// --- Setup Commander ---
program
    .name("anki-mkv-processor-seq")
    .description(`Sequentially Renames MKVs by Anki TokenNo, Copies them to ${TARGET_COPY_DIR}, and Updates the '${TARGET_UPDATE_FIELD}' field in matching Anki notes with a delay.`)
    .version("1.4.0") // Incremented version
    .requiredOption("-f, --folder <path>", "Path to the folder containing MKV files")
    .option(
        "-d, --deck <name>",
        `Anki deck name (e.g., "Prelims::162"). Defaults to "${DEFAULT_DECK_NAME}"`,
        DEFAULT_DECK_NAME
    )
    .option('--dry-run', 'Simulate all actions without changing files or Anki notes', false)
    .action((options) => {
        main(options.folder, options.deck, { dryRun: options.dryRun });
    });

// --- Parse Arguments and Run ---
program.parse(process.argv);