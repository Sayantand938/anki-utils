const fs = require("fs/promises");
const path = require("path");
const axios = require("axios");
// Import ora dynamically
let ora;

// --- Configuration ---
const scriptDir = __dirname;
const projectRoot = path.join(scriptDir, "..");
const outputJsonPath = path.join(projectRoot, "notes", "output.json"); // Path to the JSON with localized data
const ANKI_CONNECT_URL = "http://127.0.0.1:8765"; // Default AnkiConnect URL
const UPDATE_DELAY_MS = 1000; // 1 second delay between updates

// --- Specify the fields you expect to update ---
// --- IMPORTANT: Adjust this array to match EXACTLY the fields ---
// --- containing images in your output.json that need updating ---
const FIELDS_TO_UPDATE = ["Question", "Extra"];
// --------------------------------------------------

// --- Helper Functions ---

/**
 * Simple delay function.
 * @param {number} ms Milliseconds to wait.
 * @returns {Promise<void>}
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends an update request to AnkiConnect for a single note's fields.
 * @param {number} noteId The ID of the note to update.
 * @param {object} fieldsToUpdate Object mapping field names to their new content.
 * @returns {Promise<boolean>} True on success, throws error on failure.
 */
async function updateAnkiNote(noteId, fieldsToUpdate) {
  const payload = {
    action: "updateNoteFields",
    version: 6,
    params: {
      note: {
        id: noteId,
        fields: fieldsToUpdate,
      },
    },
  };

  try {
    const response = await axios.post(ANKI_CONNECT_URL, payload, {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });

    // Check AnkiConnect's specific error field
    if (
      response.data &&
      Object.hasOwnProperty.call(response.data, "error") &&
      response.data.error !== null
    ) {
      throw new Error(`AnkiConnect API Error: ${response.data.error}`);
    }

    // Check for unexpected response structure (though updateNoteFields often returns null result on success)
    if (
      !response.data ||
      !Object.hasOwnProperty.call(response.data, "result")
    ) {
      console.warn(
        `Note ${noteId}: Received unexpected response format from AnkiConnect, but no explicit error. Assuming success. Response:`,
        JSON.stringify(response.data)
      );
      // return true; // Or handle as needed
    }

    // Usually result is null for successful updateNoteFields
    return true;
  } catch (error) {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      throw new Error(
        `AnkiConnect request failed: ${error.message} - Status ${
          error.response.status
        } - Data: ${JSON.stringify(error.response.data)}`
      );
    } else if (error.request) {
      // The request was made but no response was received
      if (error.code === "ECONNREFUSED") {
        throw new Error(
          `Connection to AnkiConnect (${ANKI_CONNECT_URL}) refused. Is Anki running with AnkiConnect installed and enabled?`
        );
      } else {
        throw new Error(
          `AnkiConnect request failed: No response received. ${error.message}`
        );
      }
    } else if (error.message.startsWith("AnkiConnect API Error:")) {
      // Error originating from AnkiConnect's error field
      throw error;
    } else {
      // Something happened in setting up the request that triggered an Error
      throw new Error(`AnkiConnect request setup failed: ${error.message}`);
    }
  }
}

// --- Main Execution Logic ---

async function main() {
  // --- Initialize Spinner ---
  try {
    const oraModule = await import("ora");
    ora = oraModule.default;
  } catch (err) {
    console.error("Failed to load 'ora'. Install with: npm install ora");
    console.warn("Proceeding without spinner visuals.");
    ora = () => ({
      // Mock ora factory
      start: (text) => {
        console.log(`[INFO] ${text || "Processing..."}`);
        return mockSpinner;
      },
    });
    const mockSpinner = {
      // Mock spinner instance
      succeed: (text) => console.log(`[SUCCESS] ${text || "Done."}`),
      fail: (text) => console.error(`[FAIL] ${text || "Failed."}`),
      warn: (text) => console.warn(`[WARN] ${text || "Warning."}`),
      info: (text) => console.info(`[INFO] ${text || "Info."}`),
      stop: () => {},
      set text(value) {
        console.log(`[STATUS] ${value}`);
      },
      get text() {
        return "Processing...";
      },
      isSpinning: true,
    };
  }
  const spinner = ora({
    text: "Initializing Anki update...",
    spinner: "dots",
  }).start();
  // --- End Spinner Init ---

  let notesToUpdate = [];
  let stats = {
    read: 0,
    skipped: 0,
    updated: 0,
    failed: 0,
  };

  try {
    // 1. Read the output JSON file
    spinner.text = `Reading data from ${path.basename(outputJsonPath)}...`;
    try {
      const jsonContent = await fs.readFile(outputJsonPath, "utf-8");
      notesToUpdate = JSON.parse(jsonContent);
      if (!Array.isArray(notesToUpdate)) {
        throw new Error("Parsed JSON data is not an array.");
      }
      stats.read = notesToUpdate.length;
      spinner.info(
        `Read ${stats.read} notes from ${path.basename(outputJsonPath)}.`
      );
    } catch (err) {
      throw new Error(
        `Failed to read or parse ${outputJsonPath}: ${err.message}`
      );
    }

    if (stats.read === 0) {
      spinner.succeed("No notes found in the input file to update.");
      return;
    }

    // 2. Iterate and update notes in Anki
    spinner.start(
      `Starting Anki note updates (1 note / ${UPDATE_DELAY_MS / 1000} sec)...`
    );
    for (let i = 0; i < notesToUpdate.length; i++) {
      const noteData = notesToUpdate[i];
      const noteId = noteData.noteId; // Assuming the field is named 'noteId'

      spinner.text = `[${i + 1}/${
        stats.read
      }] Processing Note ID: ${noteId}...`;

      // Basic validation
      if (typeof noteId !== "number" && typeof noteId !== "string") {
        // Anki IDs are numbers but might be strings in JSON
        spinner.warn(
          `[${i + 1}/${
            stats.read
          }] Skipping item - Invalid or missing 'noteId'. Data: ${JSON.stringify(
            noteData
          ).substring(0, 100)}...`
        );
        stats.skipped++;
        await delay(UPDATE_DELAY_MS); // Still wait to maintain overall rate
        continue;
      }

      // Prepare fields payload
      const fieldsPayload = {};
      let hasFields = false;
      for (const fieldName of FIELDS_TO_UPDATE) {
        if (Object.hasOwnProperty.call(noteData, fieldName)) {
          fieldsPayload[fieldName] = noteData[fieldName];
          hasFields = true;
        } else {
          spinner.warn(
            `[${i + 1}/${
              stats.read
            }] Note ID ${noteId}: Expected field '${fieldName}' not found in JSON data. Skipping update for this field.`
          );
        }
      }

      if (!hasFields) {
        spinner.warn(
          `[${i + 1}/${
            stats.read
          }] Note ID ${noteId}: No fields specified in FIELDS_TO_UPDATE were found for this note. Skipping update.`
        );
        stats.skipped++;
        await delay(UPDATE_DELAY_MS);
        continue;
      }

      // Attempt update
      try {
        spinner.text = `[${i + 1}/${
          stats.read
        }] Updating Note ID: ${noteId} via AnkiConnect...`;
        await updateAnkiNote(noteId, fieldsPayload);
        stats.updated++;
        spinner.text = `[${i + 1}/${
          stats.read
        }] Note ID: ${noteId} updated successfully.`; // Temporary success message
      } catch (error) {
        spinner.fail(
          `[${i + 1}/${stats.read}] Failed to update Note ID ${noteId}: ${
            error.message
          }`
        );
        stats.failed++;
        // Optional: Stop on first error? Or continue? Currently continues.
        // if (error.message.includes('Connection to AnkiConnect')) throw error; // Example: Stop if connection lost
      }

      // Wait before next iteration (even if failed, to avoid hammering)
      if (i < notesToUpdate.length - 1) {
        spinner.text = `[${i + 1}/${stats.read}] Waiting ${
          UPDATE_DELAY_MS / 1000
        } sec...`;
        await delay(UPDATE_DELAY_MS);
      }
    }

    spinner.succeed("Anki note update process finished!");
  } catch (error) {
    spinner.fail(`Anki update process failed: ${error.message}`);
    // console.error(error.stack); // Uncomment for full stack trace if needed
    process.exitCode = 1;
  } finally {
    if (spinner && typeof spinner.stop === "function" && spinner.isSpinning) {
      spinner.stop();
    }
    // Print Summary
    console.log("\n--- Anki Update Summary ---");
    console.log(
      ` Input File  : ${path
        .relative(projectRoot, outputJsonPath)
        .replace(/\\/g, "/")}`
    );
    console.log("---------------------------");
    console.log(` Notes Read    : ${stats.read}`);
    console.log(` Updated       : ${stats.updated}`);
    console.log(` Failed        : ${stats.failed}`);
    console.log(` Skipped       : ${stats.skipped}`);
    console.log("---------------------------");
  }
}

// --- Run the main function ---
main();
