const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");

// --- Configuration ---
const INPUT_FILE_PATH = path.join(__dirname, "..", "notes", "output.json");

// --- AnkiConnect Configuration ---
const ANKI_CONNECT_URL = "http://localhost:8765";
const ANKI_EXTRA_FIELD_NAME = "Extra"; // **IMPORTANT**: Set correctly!
const ANKI_API_VERSION = 6;
const ANKI_UPDATE_DELAY_MS = 150; // Delay between each update request in milliseconds (adjust as needed)
// --- End Configuration ---

// Helper function for creating delays
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Updates the specified field in Anki notes individually with delays.
 * Returns success status based on whether all requests succeeded without *network* errors
 * and AnkiConnect didn't report errors in its response *for each note*.
 * @param {Array<{noteId: number, modifiedExtra: string}>} notesToUpdate
 * @returns {Promise<boolean>} - True if all attempted updates were successful, false otherwise.
 */
async function updateAnkiExtraFieldIndividually(notesToUpdate) {
  if (!notesToUpdate || notesToUpdate.length === 0) {
    return true; // Nothing to do, considered success.
  }

  let successCount = 0;
  let failureCount = 0;
  const totalNotes = notesToUpdate.length;

  // Optional: Log start only if updating notes
  // console.log(`[INFO] Starting individual Anki updates for ${totalNotes} notes with ${ANKI_UPDATE_DELAY_MS}ms delay...`);

  for (let i = 0; i < totalNotes; i++) {
    const note = notesToUpdate[i];
    const requestBody = {
      action: "updateNote",
      version: ANKI_API_VERSION,
      params: {
        note: {
          id: note.noteId,
          fields: {
            [ANKI_EXTRA_FIELD_NAME]: note.modifiedExtra,
          },
        },
      },
    };

    try {
      const response = await axios.post(ANKI_CONNECT_URL, requestBody);

      // Check AnkiConnect's response for *this specific* note update
      if (response.data.error) {
        // AnkiConnect reported an error for this note
        console.error(
          `[ERROR] AnkiConnect failed to update noteId ${note.noteId}: ${response.data.error}`
        );
        failureCount++;
      } else {
        successCount++;
        // Minimal logging - don't log individual successes
      }
    } catch (error) {
      // Network or other request error for this specific note
      console.error(
        `[ERROR] Request failed for noteId ${note.noteId}: ${error.message}`
      );
      if (error.response) {
        console.error(` >> Status ${error.response.status}`);
      } else if (error.request) {
        console.error(" >> No response received.");
      }
      failureCount++;

      // Optional: Decide if you want to stop the whole process on the first network error
      // For now, we'll log it and continue trying the rest.
    }

    // Add delay before the next iteration (unless it's the very last note)
    if (i < totalNotes - 1) {
      await delay(ANKI_UPDATE_DELAY_MS);
    }
  } // End for loop

  // Log summary after loop completion
  // console.log(`[INFO] Anki update attempt finished: ${successCount} successful, ${failureCount} failed.`);

  // Return true only if all notes were updated without any reported errors
  return failureCount === 0;
}

/**
 * Main async function with minimal logging.
 */
async function main() {
  let notesReadCount = 0;
  let notesToUpdateCount = 0;
  let updateFunction = updateAnkiExtraFieldIndividually; // Use the individual update function

  try {
    // --- Step 1: Read Input File ---
    let rawData;
    try {
      rawData = await fs.readFile(INPUT_FILE_PATH, "utf8");
    } catch (readError) {
      if (readError.code === "ENOENT") {
        throw new Error(`Input file not found: ${INPUT_FILE_PATH}`);
      }
      throw new Error(`Failed to read input file: ${readError.message}`);
    }

    let parsedNotes;
    try {
      parsedNotes = JSON.parse(rawData);
    } catch (parseError) {
      throw new Error(`Input JSON parsing failed: ${parseError.message}`);
    }
    if (!Array.isArray(parsedNotes)) {
      throw new Error("Input file is not a valid JSON array.");
    }
    notesReadCount = parsedNotes.length;

    const notesToUpdate = parsedNotes.filter(
      (note) =>
        note &&
        typeof note === "object" &&
        note.noteId &&
        typeof note.modifiedExtra === "string"
    );
    notesToUpdateCount = notesToUpdate.length;
    const skippedCount = notesReadCount - notesToUpdateCount;

    // --- Step 2: Update Anki Notes ---
    let ankiUpdateSuccess = false;
    if (notesToUpdateCount > 0) {
      ankiUpdateSuccess = await updateFunction(notesToUpdate); // Call the chosen update function
      if (!ankiUpdateSuccess) {
        // Error details should have been logged inside the update function
        throw new Error("Anki note update process encountered errors.");
      }
    } else {
      ankiUpdateSuccess = true; // No notes to update, so considered successful.
    }

    // --- Log successes together ---
    console.log(
      `[✓] Read ${notesReadCount} records from ${path.basename(
        INPUT_FILE_PATH
      )}.`
    );
    if (skippedCount > 0) {
      // Optionally mention skipped records
      console.log(
        `   [INFO] ${skippedCount} records skipped due to missing data.`
      );
    }
    if (notesToUpdateCount > 0) {
      console.log(
        `[✓] Anki update process for ${notesToUpdateCount} notes completed.`
      );
    } else {
      console.log(`[✓] No notes required updating in Anki.`);
    }
  } catch (error) {
    console.error(`\n[ERROR] ${error.message}`);
    if (
      error.message.includes("AnkiConnect") ||
      (error.request && !error.response) ||
      error.message.includes("ECONNREFUSED")
    ) {
      console.error(
        " >> Hint: Check if Anki and AnkiConnect add-on are running."
      );
    }
    process.exitCode = 1;
  }
}

// --- Run the main function ---
main();
