const fs = require("fs");
const axios = require("axios");
const path = require("path");

// --- Configuration ---
// Path to the JSON file containing note data
// Corrected: Go up two levels from scripts/js to the project root, then into notes
const DATA_FILE_PATH = path.join(__dirname, "../../notes/output.json");
// URL for the AnkiConnect API (default)
const ANKI_CONNECT_URL = "http://localhost:8765";
// Name of the key in the JSON object containing the tag to add/replace with
const TAG_KEY_NAME = "chosenTag";
// The separator used to determine the parent tag to replace (e.g., "::" in "Parent::Child")
const TAG_SEPARATOR = "::";
// Optional: Add a small delay (in milliseconds) between tagging requests
// Set to 0 to disable delay. Helps prevent overwhelming AnkiConnect if you have many notes.
const REQUEST_DELAY_MS = 50;
// --- End Configuration ---

/**
 * Reads and parses the JSON data file.
 * @returns {Array|null} An array of note objects or null if an error occurs.
 */
function loadNotesData() {
  try {
    console.log(`Attempting to read data from: ${DATA_FILE_PATH}`);
    if (!fs.existsSync(DATA_FILE_PATH)) {
      console.error(`Error: File not found at ${DATA_FILE_PATH}`);
      return null;
    }

    const fileContent = fs.readFileSync(DATA_FILE_PATH, "utf8");
    const data = JSON.parse(fileContent);

    if (!Array.isArray(data)) {
      console.error(
        `Error: The content of ${DATA_FILE_PATH} is not a valid JSON array.`
      );
      return null;
    }

    console.log(`Successfully loaded ${data.length} entries from JSON file.`);
    return data;
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error(
        `Error: Failed to parse JSON from ${DATA_FILE_PATH}. Please check the file format.`,
        error.message
      );
    } else {
      console.error(
        `Error reading or parsing file ${DATA_FILE_PATH}:`,
        error.message
      );
    }
    return null;
  }
}

/**
 * Replaces a specific tag on an Anki note with another tag using AnkiConnect.
 * @param {number} noteId - The ID of the Anki note to modify.
 * @param {string} tagToReplace - The tag string to find and remove/replace.
 * @param {string} replaceWithTag - The new tag string to add in its place.
 * @returns {Promise<boolean>} - True if the tag was replaced successfully according to AnkiConnect, false otherwise.
 */
async function replaceTagOnAnkiNote(noteId, tagToReplace, replaceWithTag) {
  const payload = {
    action: "replaceTags",
    version: 6,
    params: {
      notes: [noteId], // Note ID must be in an array
      tag_to_replace: tagToReplace, // The tag to find
      replace_with_tag: replaceWithTag, // The tag to replace it with
    },
  };

  try {
    // console.log(`Attempting to replace tag '${tagToReplace}' with '${replaceWithTag}' on Note ID: ${noteId}`); // More verbose logging if needed
    const response = await axios.post(ANKI_CONNECT_URL, payload, {
      timeout: 15000, // Increased timeout slightly for replace operations
    });

    // Check AnkiConnect's response structure for the 'replaceTags' action
    if (response.data && response.data.error) {
      console.error(
        `AnkiConnect Error replacing tag '${tagToReplace}' with '${replaceWithTag}' on Note ID ${noteId}: ${response.data.error}`
      );
      // Common errors might include "note was not found" or if the tag_to_replace doesn't exist (though replaceTags might not error on this).
      if (response.data.error.includes("not found")) {
        console.warn(
          `-> Hint: Verify that Note ID ${noteId} exists in your Anki collection.`
        );
      } else if (response.data.error.includes("collection is not available")) {
        console.error(
          `-> Hint: AnkiConnect cannot access the collection. Is Anki running? Is a profile loaded? Is a sync/other operation in progress?`
        );
      }
      return false;
    } else if (response.data && response.data.result === null) {
      // AnkiConnect signals success with result: null for this action
      console.log(
        `Successfully replaced tag '${tagToReplace}' with '${replaceWithTag}' on Note ID: ${noteId}`
      );
      return true;
    } else {
      // Unexpected response format from AnkiConnect
      console.warn(
        `Unexpected response from AnkiConnect when replacing tag on Note ID ${noteId}:`,
        JSON.stringify(response.data)
      );
      return false;
    }
  } catch (error) {
    // Handle different types of errors (network, timeout, etc.)
    if (error.code === "ECONNABORTED") {
      console.error(
        `Error replacing tag on Note ID ${noteId}: Request timed out.`
      );
    } else if (error.response) {
      // Server responded with a status code outside the 2xx range
      console.error(
        `Error replacing tag on Note ID ${noteId}: AnkiConnect request failed with Status ${
          error.response.status
        }. Response: ${JSON.stringify(error.response.data)}`
      );
    } else if (error.request) {
      // Request was made but no response received
      console.error(
        `Error replacing tag on Note ID ${noteId}: No response received from AnkiConnect at ${ANKI_CONNECT_URL}. Is Anki running with AnkiConnect enabled and the correct profile open?`
      );
    } else {
      // Other errors (e.g., setting up the request)
      console.error(
        `Error sending tag replacement request for Note ID ${noteId}: ${error.message}`
      );
    }
    return false;
  }
}

/**
 * Pauses execution for a specified number of milliseconds.
 * @param {number} ms - Milliseconds to pause.
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Main function to orchestrate the tagging process.
 */
async function runTaggingProcess() {
  console.log("--- Starting Anki Note Tag Replacement Process ---");

  // 1. Load data
  const notesToModify = loadNotesData();
  if (!notesToModify) {
    console.error("Halting process due to errors loading data.");
    process.exitCode = 1; // Indicate failure
    return; // Stop if data loading failed
  }

  if (notesToModify.length === 0) {
    console.log(
      "JSON file is empty or contains no valid entries. Nothing to process."
    );
    return;
  }

  // 2. Iterate and replace tags on notes
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  console.log(
    `\nProcessing ${notesToModify.length} notes for tag replacement...`
  );

  for (let i = 0; i < notesToModify.length; i++) {
    const noteData = notesToModify[i];
    const progress = `[${i + 1}/${notesToModify.length}]`; // Progress indicator

    // Dynamically access the tag value using the configured key name
    const { noteId, [TAG_KEY_NAME]: replaceWithTagValue } = noteData;

    // --- Validate Core Data ---
    if (
      typeof noteId !== "number" ||
      !Number.isInteger(noteId) || // Be more strict: ensure it's an integer
      noteId <= 0 // Note IDs are positive timestamps
    ) {
      console.warn(
        `${progress} Skipping: Invalid or missing 'noteId' (${noteId}) in: ${JSON.stringify(
          noteData
        )}`
      );
      skippedCount++;
      continue; // Skip to the next note
    }
    if (
      typeof replaceWithTagValue !== "string" ||
      replaceWithTagValue.trim() === ""
    ) {
      console.warn(
        `${progress} Skipping (Note ID: ${noteId}): Invalid, empty, or missing tag value for key '${TAG_KEY_NAME}' in: ${JSON.stringify(
          noteData
        )}`
      );
      skippedCount++;
      continue; // Skip to the next note
    }

    const cleanReplaceWithTag = replaceWithTagValue.trim();

    // --- Determine the tag to replace based on the TAG_SEPARATOR ---
    const separatorIndex = cleanReplaceWithTag.indexOf(TAG_SEPARATOR);

    if (separatorIndex <= 0) {
      // Check if separator is missing or at the very beginning
      console.warn(
        `${progress} Skipping (Note ID: ${noteId}): Cannot determine tag to replace from '${cleanReplaceWithTag}'. Expected format 'Parent${TAG_SEPARATOR}Child'.`
      );
      skippedCount++;
      continue; // Skip this note
    }

    const tagToReplace = cleanReplaceWithTag.substring(0, separatorIndex);

    // Make sure tagToReplace is not empty after potential trimming/extraction issues
    if (!tagToReplace) {
      console.warn(
        `${progress} Skipping (Note ID: ${noteId}): Calculated tag to replace is empty for '${cleanReplaceWithTag}'.`
      );
      skippedCount++;
      continue;
    }

    // --- Call the tag replacement function ---
    // console.log(`${progress} Processing Note ID ${noteId}: Replacing '${tagToReplace}' with '${cleanReplaceWithTag}'`); // Debug log
    const success = await replaceTagOnAnkiNote(
      noteId,
      tagToReplace,
      cleanReplaceWithTag
    );
    if (success) {
      successCount++;
    } else {
      errorCount++; // Count AnkiConnect communication errors or explicit 'false' returns
    }

    // Optional delay between requests
    if (REQUEST_DELAY_MS > 0 && i < notesToModify.length - 1) {
      await delay(REQUEST_DELAY_MS);
    }
  }

  // 3. Log summary
  console.log("\n--- Tag Replacement Process Finished ---");
  console.log(`Total notes processed: ${notesToModify.length}`);
  console.log(
    `Successfully processed (tag replaced/confirmed): ${successCount} notes`
  );
  console.log(`Skipped (invalid data or format): ${skippedCount} notes`);
  console.log(`Failed (AnkiConnect error): ${errorCount} notes`);
  console.log("--------------------------------------");

  if (errorCount > 0 || skippedCount > 0) {
    process.exitCode = 1; // Indicate partial failure or issues
  }
}

// --- Run the script ---
runTaggingProcess().catch((err) => {
  console.error("An unexpected error occurred in the main process:", err);
  process.exitCode = 1; // Indicate failure
});
