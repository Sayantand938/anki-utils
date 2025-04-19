/**
 * Script to update the 'Extra' field of Anki notes based on data from a JSON file.
 *
 * Requirements:
 * 1. Node.js installed.
 * 2. `axios` library installed (`npm install axios` in the terminal in your project directory).
 * 3. Anki desktop application running.
 * 4. AnkiConnect add-on installed and enabled in Anki.
 * 5. An `output.json` file located at ../notes/output.json relative to this script,
 *    containing a JSON array of objects, where each object has a `noteId` (number)
 *    and an `Extra` (string) property.
 *
 * Example output.json structure:
 * [
 *   { "noteId": 1739605588100, "Extra": "HTML content for note 1..." },
 *   { "noteId": 1739605588101, "Extra": "HTML content for note 2..." }
 * ]
 */

const fs = require("fs");
const axios = require("axios");
const path = require("path");

// --- Configuration ---
// Path to the JSON file containing note data
const DATA_FILE_PATH = path.join(__dirname, "../notes/output.json");
// URL for the AnkiConnect API (default)
const ANKI_CONNECT_URL = "http://localhost:8765";
// Name of the field in Anki to update (case-sensitive)
const TARGET_FIELD_NAME = "Extra";
// Optional: Add a small delay (in milliseconds) between update requests
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
 * Updates a specific field of a single Anki note using AnkiConnect.
 * @param {number} noteId - The ID of the Anki note to update.
 * @param {string} fieldName - The exact name of the field to update.
 * @param {string} content - The new content for the field.
 * @returns {Promise<boolean>} - True if the update was successful according to AnkiConnect, false otherwise.
 */
async function updateAnkiNoteField(noteId, fieldName, content) {
  const payload = {
    action: "updateNoteFields",
    version: 6,
    params: {
      note: {
        id: noteId,
        fields: {
          [fieldName]: content, // Use computed property name to set the target field
        },
      },
    },
  };

  try {
    // console.log(`Attempting to update Note ID: ${noteId}, Field: ${fieldName}`); // More verbose logging if needed
    const response = await axios.post(ANKI_CONNECT_URL, payload, {
      timeout: 10000, // 10 second timeout per request
    });

    // Check AnkiConnect's response structure
    if (response.data && response.data.error) {
      console.error(
        `AnkiConnect Error updating Note ID ${noteId}: ${response.data.error}`
      );
      return false;
    } else if (response.data && response.data.result === null) {
      // AnkiConnect signals success with result: null for this action
      console.log(
        `Successfully updated Note ID: ${noteId} (Field: ${fieldName})`
      );
      return true;
    } else {
      // Unexpected response format from AnkiConnect
      console.warn(
        `Unexpected response from AnkiConnect for Note ID ${noteId}:`,
        JSON.stringify(response.data)
      );
      return false;
    }
  } catch (error) {
    // Handle different types of errors (network, timeout, etc.)
    if (error.code === "ECONNABORTED") {
      console.error(`Error updating Note ID ${noteId}: Request timed out.`);
    } else if (error.response) {
      // Server responded with a status code outside the 2xx range
      console.error(
        `Error updating Note ID ${noteId}: AnkiConnect request failed with Status ${
          error.response.status
        }. Response: ${JSON.stringify(error.response.data)}`
      );
    } else if (error.request) {
      // Request was made but no response received
      console.error(
        `Error updating Note ID ${noteId}: No response received from AnkiConnect at ${ANKI_CONNECT_URL}. Is Anki running with AnkiConnect enabled?`
      );
    } else {
      // Other errors (e.g., setting up the request)
      console.error(
        `Error sending update request for Note ID ${noteId}: ${error.message}`
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
 * Main function to orchestrate the process.
 */
async function runUpdateProcess() {
  console.log("--- Starting Anki Note Update Process ---");

  // 1. Load data
  const notesToUpdate = loadNotesData();
  if (!notesToUpdate) {
    console.error("Halting process due to errors loading data.");
    return; // Stop if data loading failed
  }

  if (notesToUpdate.length === 0) {
    console.log(
      "JSON file is empty or contains no valid entries. Nothing to update."
    );
    return;
  }

  // 2. Iterate and update notes
  let successCount = 0;
  let errorCount = 0;

  console.log(`\nProcessing ${notesToUpdate.length} notes...`);

  for (let i = 0; i < notesToUpdate.length; i++) {
    const note = notesToUpdate[i];
    const { noteId, [TARGET_FIELD_NAME]: content } = note; // Dynamically access the target field content

    // Validate data for the current note
    if (
      typeof noteId !== "number" ||
      typeof content === "undefined" ||
      content === null
    ) {
      console.warn(
        `Skipping entry ${
          i + 1
        }: Invalid or missing 'noteId' (${noteId}) or '${TARGET_FIELD_NAME}' content in: ${JSON.stringify(
          note
        )}`
      );
      errorCount++;
      continue; // Skip to the next note
    }

    // Call the update function
    const success = await updateAnkiNoteField(
      noteId,
      TARGET_FIELD_NAME,
      content
    );
    if (success) {
      successCount++;
    } else {
      errorCount++;
    }

    // Optional delay between requests
    if (REQUEST_DELAY_MS > 0 && i < notesToUpdate.length - 1) {
      await delay(REQUEST_DELAY_MS);
    }
  }

  // 3. Log summary
  console.log("\n--- Update Process Finished ---");
  console.log(`Successfully updated: ${successCount} notes`);
  console.log(`Failed/Skipped: ${errorCount} notes`);
  console.log("------------------------------");
}

// --- Run the script ---
runUpdateProcess();
