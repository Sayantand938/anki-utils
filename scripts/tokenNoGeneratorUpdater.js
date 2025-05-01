// scripts\tokenNoGeneratorUpdater.js
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");
const { program } = require("commander");

// --- Configuration ---
const EXAM_TYPE_MAP = { Prelims: "01", Mains: "02" };
const SUBJECT_MAP = { MATH: "01", GI: "02", ENG: "03", GK: "04" };

const ANKI_CONNECT_URL = "http://localhost:8765";
const ANKI_TOKEN_FIELD_NAME = "TokenNo"; // **IMPORTANT**: Ensure this matches your Anki field name
const ANKI_API_VERSION = 6;
const DELAY_BEFORE_UPDATE_LOOP = 1000; // Delay before starting the update loop
const ANKI_UPDATE_DELAY_MS = 1000; // Delay BETWEEN each update request
const ANKI_REQUEST_TIMEOUT = 60000; // Timeout for AnkiConnect requests
// --- End Configuration ---

// Helper function for creating delays
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Helper Function to Call AnkiConnect ---
// (Includes retries and robust error handling - unchanged)
async function ankiConnectRequest(action, params = {}, attempt = 1) {
  const MAX_ATTEMPTS = 2;
  try {
    const response = await axios.post(
      ANKI_CONNECT_URL,
      {
        action: action,
        version: ANKI_API_VERSION,
        params: params,
      },
      { timeout: ANKI_REQUEST_TIMEOUT }
    );

    if (response.data.error) {
      if (
        action === "notesInfo" &&
        response.data.error.includes("deck was not found")
      ) {
        // Modify warning to show the name *attempted*
        console.warn(
          `[WARN] Deck "${
            params?.query?.match(/deck:"([^"]+)"/)?.[1] || "provided name"
          }" not found in Anki.`
        );
        return [];
      }
      if (
        action === "updateNote" &&
        response.data.error.includes("note was not found")
      ) {
        process.stdout.write("\n");
        console.warn(
          `  [WARN] updateNote failed: ${response.data.error}. Skipping.`
        );
        return null;
      }
      throw new Error(`AnkiConnect Error (${action}): ${response.data.error}`);
    }
    return response.data.result;
  } catch (error) {
    const isTimeout =
      error.code === "ECONNABORTED" ||
      error.message.toLowerCase().includes("timeout");
    const isNetworkError = [
      "ECONNRESET",
      "ECONNREFUSED",
      "ENOTFOUND",
      "EAI_AGAIN",
    ].includes(error.code);

    if ((isTimeout || isNetworkError) && attempt < MAX_ATTEMPTS) {
      process.stdout.write("\n");
      console.warn(
        `  [WARN] AnkiConnect connection issue for action '${action}' (Attempt ${attempt}/${MAX_ATTEMPTS}, Error: ${
          error.code || error.message
        }). Retrying in 3s...`
      );
      await delay(3000);
      return ankiConnectRequest(action, params, attempt + 1);
    }
    process.stdout.write("\n");
    if (isTimeout)
      throw new Error(
        `AnkiConnect request timed out for action '${action}' after ${MAX_ATTEMPTS} attempts.`
      );
    if (isNetworkError)
      throw new Error(
        `AnkiConnect network error (Code: ${error.code}) for action '${action}'. Is Anki running?`
      );
    if (error.response)
      throw new Error(
        `AnkiConnect communication error (${action}): Status ${
          error.response.status
        }, Data: ${JSON.stringify(error.response.data)}`
      );
    if (error.request)
      throw new Error(
        `No response received from AnkiConnect for action '${action}'. Is Anki running?`
      );
    if (error.message.startsWith("AnkiConnect Error")) throw error;
    throw new Error(
      `Failed during AnkiConnect request (${action}): ${error.message}`
    );
  }
}

/**
 * Fetches note details directly from Anki for a specific deck.
 * @param {string} deckName - The exact name of the deck in Anki.
 * @returns {Promise<Array<Object>>} - Array of note info objects.
 */
async function fetchNotesFromAnki(deckName) {
  console.log(`[INFO] Fetching notes from Anki deck "${deckName}"...`);
  // Use the potentially transformed deckName here
  const notes = await ankiConnectRequest("notesInfo", {
    query: `deck:"${deckName}"`,
  });
  return notes || [];
}

/**
 * Generates token data silently in memory.
 * @param {Array<Object>} notes - Array of note objects from notesInfo.
 * @returns {{outputData: Array, totalAttempted: number, errorCount: number}}
 */
function generateTokenData(notes) {
  // This function's internal logic remains the same
  const groupCounters = {};
  const outputData = [];
  let skippedCount = 0;
  let processedCount = 0;
  let errorCount = 0;

  for (const note of notes) {
    let pp = null,
      nnn = null,
      ss = null,
      nnnStr = null;
    let processingError = false;

    if (
      !note ||
      typeof note !== "object" ||
      !note.noteId ||
      !Array.isArray(note.tags) ||
      typeof note.fields !== "object"
    ) {
      console.error(
        `[ERROR] Invalid note structure encountered for noteId (if available): ${
          note?.noteId || "unknown"
        }`
      );
      errorCount++;
      continue;
    }

    for (const tag of note.tags) {
      if (typeof tag === "string" && tag.includes("::")) {
        const [prefix, value] = tag.split("::", 2);
        if (prefix in EXAM_TYPE_MAP && pp === null) {
          const parsedNum = parseInt(value, 10);
          if (!isNaN(parsedNum)) {
            pp = EXAM_TYPE_MAP[prefix];
            nnn = parsedNum;
            nnnStr = String(nnn);
          } else {
            processingError = true;
            break;
          }
        } else if (prefix in SUBJECT_MAP && ss === null) {
          ss = SUBJECT_MAP[prefix];
        }
      }
    }

    if (processingError || pp === null || nnn === null || ss === null) {
      if (pp !== null || nnn !== null || ss !== null || processingError) {
        console.warn(
          `[WARN] Could not derive complete token parts for noteId ${note.noteId}. Skipping.`
        );
      }
      errorCount++;
      continue;
    }

    const groupKey = `${pp}-${nnn}-${ss}`;
    const currentSequence = (groupCounters[groupKey] || 0) + 1;
    groupCounters[groupKey] = currentSequence;
    const xx = String(currentSequence).padStart(2, "0");
    const calculatedTokenNo = `${pp}-${nnnStr}-${ss}-${xx}`;

    const existingTokenField = note.fields[ANKI_TOKEN_FIELD_NAME];
    const existingTokenNo = existingTokenField
      ? existingTokenField.value
      : null;

    if (
      existingTokenNo &&
      typeof existingTokenNo === "string" &&
      existingTokenNo === calculatedTokenNo
    ) {
      skippedCount++;
      continue;
    }

    outputData.push({ noteId: note.noteId, TokenNo: calculatedTokenNo });
    processedCount++;
  }

  const totalAttempted = processedCount + skippedCount + errorCount;
  console.log(
    `[INFO] Token Generation: Processed=${processedCount}, Skipped (already correct)=${skippedCount}, Errors/Incomplete=${errorCount}`
  );
  return { outputData, totalAttempted, errorCount };
}

/**
 * Updates notes in Anki using the in-memory list with configured delay BETWEEN updates.
 * @param {Array<{noteId: number, TokenNo: string}>} notesToUpdate
 * @returns {Promise<boolean>} - True if all attempts were successful or skipped correctly, false otherwise.
 */
async function updateAnkiNotesIndividually(notesToUpdate) {
  // This function remains the same
  if (!notesToUpdate || notesToUpdate.length === 0) {
    console.log("[INFO] No notes require updating in Anki.");
    return true;
  }

  console.log(
    `[INFO] Starting Anki update process for ${notesToUpdate.length} notes (${ANKI_UPDATE_DELAY_MS}ms delay between updates)...`
  );
  let failureCount = 0;
  const totalNotes = notesToUpdate.length;

  for (let i = 0; i < totalNotes; i++) {
    const note = notesToUpdate[i];
    process.stdout.write(
      `  Updating note ${i + 1}/${totalNotes} (ID: ${note.noteId})... `
    );

    try {
      const result = await ankiConnectRequest("updateNote", {
        note: {
          id: note.noteId,
          fields: { [ANKI_TOKEN_FIELD_NAME]: note.TokenNo },
        },
      });
      if (result === null && !axios.isAxiosError(null)) {
        process.stdout.write("Success.\n");
      } else {
        process.stdout.write("Skipped/Failed.\n");
        if (result !== null) {
          console.error(
            `  [ERROR] Unexpected response for noteId ${
              note.noteId
            }. Result: ${JSON.stringify(result)}`
          );
        }
        failureCount++;
      }
    } catch (error) {
      process.stdout.write("Failed (Request Error).\n");
      failureCount++;
    }

    if (i < totalNotes - 1 && ANKI_UPDATE_DELAY_MS > 0) {
      await delay(ANKI_UPDATE_DELAY_MS);
    }
  }

  console.log(
    `[INFO] Anki update process finished. Failures/Skipped: ${failureCount}.`
  );
  return failureCount === 0;
}

/**
 * Transforms deck input like "Prelims::165" to "Prelims-165".
 * If the format doesn't match, returns the input trimmed.
 * @param {string} rawInput - The raw input string from the command line.
 * @returns {string} The transformed deck name or the original trimmed input.
 */
function transformInputToDeckName(rawInput) {
  if (!rawInput) return ""; // Handle empty input case
  const trimmedInput = rawInput.trim();
  const match = trimmedInput.match(/^(.+)::(\d+)$/); // Regex to match Prefix::Number format

  if (match && match[1] && match[2]) {
    // Found the pattern, transform it
    const prefix = match[1];
    const number = match[2];
    const transformedName = `${prefix}-${number}`;
    console.log(
      `[INFO] Input "${trimmedInput}" matches pattern, transformed to deck name: "${transformedName}"`
    );
    return transformedName;
  } else {
    // Doesn't match the pattern, use the input as is
    console.log(
      `[INFO] Input "${trimmedInput}" does not match Prefix::Number pattern, using it directly as deck name.`
    );
    return trimmedInput;
  }
}

/**
 * Main async function.
 */
async function main() {
  program
    .name("anki-token-updater")
    .description(
      "Fetch notes from a specific Anki deck (transforming Prefix::Num input), generate tokens, and update Anki."
    )
    .version("1.1.0") // Incremented version
    .requiredOption(
      "-d, --deck <name>",
      'Specify the Anki deck name to process (e.g., "Prelims-165" or "Prelims::165")'
    );

  program.parse(process.argv);
  const options = program.opts();
  const rawDeckInput = options.deck; // Get the raw input

  // *** TRANSFORM THE INPUT HERE ***
  const deckNameToProcess = transformInputToDeckName(rawDeckInput);

  if (!deckNameToProcess) {
    console.error("[ERROR] Deck name cannot be empty after processing input.");
    process.exitCode = 1;
    return;
  }

  console.log(
    `[INFO] Script started. Will process Anki deck: "${deckNameToProcess}"`
  );

  let fetchedNotes = [];
  let noteCount = 0;

  try {
    // --- Step 1: Fetch Notes from Anki ---
    // fetchNotesFromAnki now receives the potentially transformed name
    fetchedNotes = await fetchNotesFromAnki(deckNameToProcess);
    noteCount = fetchedNotes.length;
    if (noteCount === 0) {
      // Warning for deck not found is handled within fetchNotesFromAnki/ankiConnectRequest
      console.log(
        `[INFO] No notes found to process in deck "${deckNameToProcess}".`
      );
      console.log("[✓] Script finished.");
      return;
    }
    console.log(
      `[✓] Fetched ${noteCount} notes from Anki deck "${deckNameToProcess}".`
    );

    // --- Step 2: Process Notes & Generate Tokens (In Memory) ---
    console.log("[INFO] Generating token data...");
    const tokenResult = generateTokenData(fetchedNotes);
    const outputData = tokenResult.outputData;

    // --- Delay before starting updates ---
    if (outputData.length > 0 && DELAY_BEFORE_UPDATE_LOOP > 0) {
      console.log(
        `[INFO] Pausing for ${
          DELAY_BEFORE_UPDATE_LOOP / 1000
        } second(s) before starting Anki updates...`
      );
      await delay(DELAY_BEFORE_UPDATE_LOOP);
    }

    // --- Step 3: Update Anki Notes ---
    const ankiUpdateSuccess = await updateAnkiNotesIndividually(outputData);

    // --- Final Summary ---
    console.log("\n--- Processing Summary ---");
    console.log(`[✓] Target Deck: "${deckNameToProcess}"`);
    console.log(`[✓] Notes Fetched: ${noteCount}`);
    if (outputData.length > 0) {
      if (ankiUpdateSuccess) {
        console.log(`[✓] Anki Update Attempted: ${outputData.length} notes.`);
        console.log("[✓] Anki Update Status: SUCCESSFUL");
      } else {
        console.error(
          "[X] Anki Update Status: FAILED (Errors occurred, check logs above)"
        );
        throw new Error("Anki note update process finished with errors.");
      }
    } else {
      console.log("[✓] Anki Update Attempted: 0 notes (no changes needed).");
      console.log("[✓] Anki Update Status: Not Applicable");
    }
  } catch (error) {
    console.error(`\n[FATAL ERROR] ${error.message}`);
    if (
      error.message.includes("AnkiConnect") ||
      error.message.includes("ECONNREFUSED")
    ) {
      console.error(
        " >> Hint: Ensure Anki is running with the AnkiConnect add-on enabled and accessible at " +
          ANKI_CONNECT_URL
      );
    }
    process.exitCode = 1;
  }
}

// --- Run the main function ---
main();
