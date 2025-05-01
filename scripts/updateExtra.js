// Use CommonJS require syntax
const fs = require("fs");
const axios = require("axios"); // Require axios

// --- Configuration ---
const ankiConnectUrl = "http://127.0.0.1:8765"; // Default Anki-Connect URL
const inputFile = "notes/output.json"; // Path to your JSON file
const ankiFieldName = "Extra"; // *** IMPORTANT: The exact name of the field in your Anki Note Type ***
const ankiConnectVersion = 6; // Use API version 6
const delayBeforeStartMs = 1000; // Delay before starting updates (in milliseconds)
const delayBetweenNotesMs = 1000; // Delay between each note update attempt (in milliseconds)

// --- Helper function for delays ---
function sleep(ms) {
  console.log(`Waiting for ${ms / 1000} second(s)...`);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Helper function to call Anki-Connect using Axios ---
async function invokeAnkiConnect(action, params = {}) {
  const requestPayload = {
    action: action,
    version: ankiConnectVersion,
    params: params,
  };

  try {
    const response = await axios.post(ankiConnectUrl, requestPayload, {
      headers: { "Content-Type": "application/json" },
    });

    const data = response.data;

    if (data === null || typeof data !== "object") {
      throw new Error("Received invalid response format from Anki-Connect.");
    }
    if (!data.hasOwnProperty("error")) {
      throw new Error(
        'Anki-Connect response is missing required "error" field'
      );
    }
    if (!data.hasOwnProperty("result")) {
      throw new Error(
        'Anki-Connect response is missing required "result" field'
      );
    }
    if (data.error) {
      throw new Error(`Anki-Connect API Error: ${data.error}`);
    }

    return data.result;
  } catch (error) {
    let errorMessage = `Failed to invoke Anki-Connect action "${action}": `;
    if (axios.isAxiosError(error)) {
      if (error.response) {
        errorMessage += `Server responded with status ${
          error.response.status
        } - ${error.response.statusText}. Data: ${JSON.stringify(
          error.response.data
        )}`;
      } else if (error.request) {
        errorMessage += `No response received from Anki-Connect at ${ankiConnectUrl}. Is Anki running with Anki-Connect enabled?`;
      } else {
        errorMessage += `Axios setup error: ${error.message}`;
      }
    } else {
      errorMessage += error.message;
    }
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
}

// --- Main function to process the file ---
async function processNotes() {
  console.log(`Reading notes from ${inputFile}...`);
  let notesData;

  // 1. Read and parse the JSON file
  try {
    const fileContent = fs.readFileSync(inputFile, "utf-8");
    notesData = JSON.parse(fileContent);
    if (!Array.isArray(notesData)) {
      throw new Error(
        `Input file "${inputFile}" does not contain a valid JSON array.`
      );
    }
    console.log(`Successfully read and parsed ${notesData.length} notes.`);
  } catch (error) {
    console.error(`Error reading or parsing ${inputFile}:`, error.message);
    if (error instanceof SyntaxError) {
      console.error(
        "This often means the file content is not correctly formatted JSON."
      );
    } else if (error.code === "ENOENT") {
      console.error(
        `File not found at path: ${inputFile}. Make sure the path is correct relative to where you run the script.`
      );
    }
    process.exit(1);
  }

  // --- Add Delay Before Starting ---
  if (delayBeforeStartMs > 0) {
    await sleep(delayBeforeStartMs);
  }
  // --------------------------------

  // 2. Iterate and update each note in Anki
  console.log(
    `\nStarting to update notes in Anki (Field: "${ankiFieldName}")...`
  );
  let successCount = 0;
  let errorCount = 0;
  const totalNotes = notesData.length;

  for (let i = 0; i < totalNotes; i++) {
    const note = notesData[i];
    const noteIndex = i + 1;

    if (
      !note ||
      typeof note.noteId !== "number" ||
      typeof note.Extra !== "string"
    ) {
      console.warn(
        `[${noteIndex}/${totalNotes}] Skipping invalid note object:`,
        JSON.stringify(note)
      );
      errorCount++;
      // --- Add Delay Between Notes ---
      if (delayBetweenNotesMs > 0 && i < totalNotes - 1) {
        // Don't wait after the last note
        await sleep(delayBetweenNotesMs);
      }
      // ---------------------------------
      continue; // Skip to the next iteration
    }

    const noteId = note.noteId;
    const extraContent = note.Extra;

    console.log(`\n[${noteIndex}/${totalNotes}] Processing Note ID: ${noteId}`);

    const params = {
      note: {
        id: noteId,
        fields: {
          [ankiFieldName]: extraContent,
        },
      },
    };

    try {
      await invokeAnkiConnect("updateNoteFields", params);
      console.log(
        `  ✅ Success: Field "${ankiFieldName}" updated for Note ID: ${noteId}`
      );
      successCount++;
    } catch (error) {
      console.error(
        `  ❌ Failed to update Note ID: ${noteId}. See error details above.`
      );
      errorCount++;
    }

    // --- Add Delay Between Notes ---
    if (delayBetweenNotesMs > 0 && i < totalNotes - 1) {
      // Don't wait after the last note
      await sleep(delayBetweenNotesMs);
    }
    // ---------------------------------
  }

  // 3. Final Summary
  console.log("\n--- Processing Complete ---");
  console.log(`Total notes processed: ${totalNotes}`);
  console.log(`Successfully updated:  ${successCount}`);
  console.log(`Failed/Skipped:      ${errorCount}`);
  console.log("--------------------------");

  if (errorCount > 0) {
    console.log("Check the log above for details on failed updates.");
    process.exitCode = 1;
  }
}

// --- Run the main function ---
(async () => {
  try {
    await processNotes();
  } catch (error) {
    console.error(
      "\n🚨 An unexpected error occurred during script execution:",
      error
    );
    process.exit(1);
  }
})();
