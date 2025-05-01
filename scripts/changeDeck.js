// scripts\changeDeck.js
const axios = require("axios");
const { program } = require("commander"); // Import commander

// --- Configuration ---
const ANKICONNECT_URL = "http://127.0.0.1:8765";
const ANKICONNECT_VERSION = 6;
const REQUEST_TIMEOUT = 60000; // Timeout for individual AnkiConnect requests (60 seconds)
const CHANGE_DECK_BATCH_SIZE = 500; // How many cards to move in one API call
const DELAY_BEFORE_MOVING = 3000; // 3-second delay AFTER finding cards, BEFORE moving them (within a deck)
const DELAY_BETWEEN_DECKS = 3000; // 3-second delay AFTER finishing one deck, BEFORE starting the next

// --- Source Decks to Process ---
const SOURCE_DECK_NAMES = ["MATH", "ENG", "GK", "GI"]; // Edit this list as needed

// --- Helper Function: Delay ---
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Helper Function to Call AnkiConnect ---
// (Includes retries and robust error handling)
async function ankiConnectRequest(action, params = {}, attempt = 1) {
  const MAX_ATTEMPTS = 2; // Number of attempts (1 initial + 1 retry)
  try {
    // console.log(`Sending action: ${action}, attempt: ${attempt}...`); // Uncomment for Debugging
    const response = await axios.post(
      ANKICONNECT_URL,
      {
        action: action,
        version: ANKICONNECT_VERSION,
        params: params,
      },
      {
        timeout: REQUEST_TIMEOUT, // Apply timeout to the request
      }
    );

    // Check for errors specifically reported by AnkiConnect in the response body
    if (response.data.error) {
      // Gracefully handle ignorable errors for changeDeck
      if (
        action === "changeDeck" &&
        (response.data.error.includes("deck was not found") ||
          response.data.error.includes("card was not found"))
      ) {
        process.stdout.write("\n"); // Ensure warning is on a new line
        console.warn(
          `  Warning during changeDeck: ${response.data.error}. Often ignorable if deck was just created or cards were deleted.`
        );
        return response.data.result; // Treat as partial success or okay
      }
      // Gracefully handle 'deck not found' during findCards
      if (
        action === "findCards" &&
        response.data.error.includes("deck was not found")
      ) {
        const deckName =
          params?.query?.match(/deck:"([^"]+)"/)?.[1] || "Unknown";
        console.warn(`  Source deck "${deckName}" not found in Anki.`);
        return []; // Return empty array, as if no cards were found
      }
      // For other AnkiConnect errors, throw them to be caught below
      throw new Error(`AnkiConnect Error (${action}): ${response.data.error}`);
    }
    // If no error in response, return the result
    return response.data.result;
  } catch (error) {
    // --- Error Handling for Network/Request Issues ---

    // Check if it's a timeout error
    const isTimeout =
      error.code === "ECONNABORTED" ||
      error.message.toLowerCase().includes("timeout");
    // Check if it's a common network connection error
    const isNetworkError = [
      "ECONNRESET",
      "ECONNREFUSED",
      "ENOTFOUND",
      "EAI_AGAIN",
    ].includes(error.code);

    // Check if the error is retryable and we haven't exceeded max attempts
    if ((isTimeout || isNetworkError) && attempt < MAX_ATTEMPTS) {
      process.stdout.write("\n"); // Ensure warning starts on a new line
      console.warn(
        `  AnkiConnect connection issue for action '${action}' (Attempt ${attempt}/${MAX_ATTEMPTS}, Error: ${
          error.code || error.message
        }). Anki might be busy. Retrying in 3s...`
      );
      await delay(3000); // Wait 3 seconds before retrying
      return ankiConnectRequest(action, params, attempt + 1); // Recursively call the function for the next attempt
    }

    // --- Final Error Handling (if not retryable or retries failed) ---
    process.stdout.write("\n"); // Ensure error message starts on a new line

    if (isTimeout) {
      console.error(
        `Error: AnkiConnect request timed out for action '${action}' after ${MAX_ATTEMPTS} attempts.`
      );
      throw new Error(`AnkiConnect request timed out for ${action}.`); // Throw specific error
    } else if (isNetworkError) {
      console.error(
        `Error: Network error (Code: ${error.code}) connecting to AnkiConnect for action '${action}' after ${MAX_ATTEMPTS} attempts.`
      );
      throw new Error(`AnkiConnect network error for ${action}.`); // Throw specific error
    } else if (error.response) {
      // The request was made and the server responded with a status code outside the 2xx range
      console.error(
        `Error communicating with AnkiConnect (${action}): Status ${
          error.response.status
        }, Data: ${JSON.stringify(error.response.data)}`
      );
      throw new Error(`AnkiConnect communication error (${action})`); // Throw specific error
    } else if (error.request) {
      // The request was made but no response was received
      console.error(
        `Error: No response received from AnkiConnect for action '${action}'. Is Anki running?`
      );
      throw new Error(`No response from AnkiConnect for ${action}.`); // Throw specific error
    } else if (error.message && error.message.startsWith("AnkiConnect Error")) {
      // Error explicitly thrown above from AnkiConnect response's error field
      console.error(error.message); // Log the specific AnkiConnect error message
      throw error; // Re-throw the original error
    } else {
      // Something else happened in setting up the request or an unexpected error
      console.error(
        `Error setting up AnkiConnect request (${action}):`,
        error.message
      );
      throw new Error(`Failed to execute AnkiConnect action ${action}.`); // Throw generic error
    }
  }
}

// --- Sanitize Deck Name Function ---
// Replaces '::' with '-' and removes other invalid characters for deck names.
function sanitizeDeckName(name) {
  let sanitized = name.replace(/::/g, "-"); // Replace Anki sub-deck separator
  sanitized = sanitized.replace(/[<>:"/\\|?*]/g, "_"); // Remove characters invalid in many contexts
  sanitized = sanitized.trim(); // Remove leading/trailing whitespace
  return sanitized || "Tagged-Cards-Deck"; // Provide a fallback if the name becomes empty
}

// --- Main Application Logic ---
async function findAndMoveCardsMultiDeck() {
  // --- Setup Command Line Argument Parsing ---
  program
    .name("anki-multi-deck-mover") // Script name for help messages
    .description(
      "Finds cards with a specific tag across multiple source decks and moves them to a new deck named after the tag."
    )
    .version("2.0.1") // Version number
    .requiredOption(
      "-t, --tag <name>",
      'Specify the EXACT tag to search for (e.g., "Prelims::163")'
    ); // Mandatory tag argument

  program.parse(process.argv); // Parse arguments from the command line
  const options = program.opts(); // Get the parsed options
  const tagToFind = options.tag.trim(); // Retrieve the tag value and remove whitespace

  // --- Initial Setup & Logging ---
  console.log(`--- Anki Card Mover (Multiple Source Decks) ---`);
  console.log(`Source Decks to process: ${SOURCE_DECK_NAMES.join(", ")}`);
  console.log(`Tag specified via command line: "${tagToFind}"`);

  let targetDeckName = ""; // Will be derived from the tag
  let totalCardsFound = 0; // Counter for cards found across all decks
  let totalCardsMoved = 0; // Counter for cards successfully moved
  let overallSuccess = true; // Flag to track if any deck processing failed

  try {
    // --- Derive Target Deck Name from Tag ---
    targetDeckName = sanitizeDeckName(tagToFind);
    console.log(`Target Deck: "${targetDeckName}" (Derived from tag)`);

    // --- Loop through each source deck defined in SOURCE_DECK_NAMES ---
    for (let i = 0; i < SOURCE_DECK_NAMES.length; i++) {
      const sourceDeck = SOURCE_DECK_NAMES[i]; // Get the current deck name

      // --- Log start of processing for the current deck ---
      console.log(`\n--------------------------------------------------`);
      console.log(
        `Processing Source Deck (${i + 1}/${
          SOURCE_DECK_NAMES.length
        }): "${sourceDeck}"`
      );
      console.log(`--------------------------------------------------`);

      let cardIds = []; // Array to store card IDs found in *this* deck

      try {
        // --- Step 1: Find Card IDs matching Current Deck and Tag ---
        console.log(
          `Step 1: Finding Card IDs in "${sourceDeck}" with tag "${tagToFind}"...`
        );
        const query = `deck:"${sourceDeck}" tag:"${tagToFind}"`; // Construct Anki search query
        cardIds = await ankiConnectRequest("findCards", { query: query }); // Use the findCards action

        // Check if any cards were found
        if (!cardIds || cardIds.length === 0) {
          console.log(
            `Result: No cards found matching criteria in "${sourceDeck}".`
          );
          // Skip to the delay between decks if no cards found
        } else {
          // Cards were found in this deck
          console.log(`Result: Found ${cardIds.length} matching card(s).`);
          totalCardsFound += cardIds.length; // Add to the overall count

          // --- Optional Delay BEFORE Moving (within this deck) ---
          if (DELAY_BEFORE_MOVING > 0) {
            console.log(
              `Pausing for ${
                DELAY_BEFORE_MOVING / 1000
              } seconds before starting move...`
            );
            await delay(DELAY_BEFORE_MOVING); // Wait for the specified duration
          }

          // --- Step 2: Move the collected Card IDs to the Target Deck ---
          console.log(
            `Step 2: Moving ${cardIds.length} cards from "${sourceDeck}" to deck "${targetDeckName}"...`
          );
          let movedInDeck = 0; // Counter for cards moved from this specific deck

          // Process moves in batches if necessary
          for (let j = 0; j < cardIds.length; j += CHANGE_DECK_BATCH_SIZE) {
            const batchCardIds = cardIds.slice(j, j + CHANGE_DECK_BATCH_SIZE); // Get a slice for the current batch
            process.stdout.write(
              `  Moving cards ${j + 1} to ${Math.min(
                j + CHANGE_DECK_BATCH_SIZE,
                cardIds.length
              )}... `
            ); // Progress indicator

            // Call the changeDeck action for the current batch
            await ankiConnectRequest("changeDeck", {
              cards: batchCardIds, // The list of card IDs for this batch
              deck: targetDeckName, // The destination deck name
            });
            movedInDeck += batchCardIds.length; // Add the number moved in this batch
            process.stdout.write(`Done.\n`); // Indicate batch completion
          }
          totalCardsMoved += movedInDeck; // Add this deck's moved count to the overall total
          console.log(
            `Successfully requested move for ${movedInDeck} card(s) from "${sourceDeck}".`
          );
        }
      } catch (deckError) {
        // Handle errors specific to processing this particular deck
        console.error(`\n--- Error processing deck "${sourceDeck}" ---`);
        console.error(
          `Error details: ${deckError.message}. Skipping remaining operations for this deck.`
        );
        overallSuccess = false; // Mark the overall process as having encountered an error
        // Continue to the next deck in the list
      }

      // --- Delay BETWEEN Processing Decks ---
      const isLastDeck = i === SOURCE_DECK_NAMES.length - 1; // Check if this is the last deck
      // Apply delay only if it's not the last deck and a delay is configured
      if (!isLastDeck && DELAY_BETWEEN_DECKS > 0) {
        console.log(
          `\nFinished processing "${sourceDeck}". Pausing for ${
            DELAY_BETWEEN_DECKS / 1000
          } second(s) before next deck...`
        );
        await delay(DELAY_BETWEEN_DECKS); // Wait for the specified duration
      }
    } // --- End loop through source decks ---

    // --- Final Summary Output ---
    console.log(`\n==================================================`);
    console.log(`--- Overall Summary ---`);
    console.log(`Processed Decks: ${SOURCE_DECK_NAMES.join(", ")}`);
    console.log(`Tag Searched: "${tagToFind}"`);
    console.log(`Target Deck: "${targetDeckName}"`);
    console.log(
      `Total cards found across all specified decks: ${totalCardsFound}`
    );
    console.log(
      `Total cards successfully requested for move: ${totalCardsMoved}`
    );

    // Add warnings if issues occurred
    if (!overallSuccess) {
      console.warn(
        "\nWarning: One or more decks encountered errors during processing. Please review the logs."
      );
    } else if (totalCardsFound > totalCardsMoved) {
      // Check if fewer cards were moved than found (could indicate warnings during changeDeck)
      console.warn(
        "\nWarning: Fewer cards were moved than found. Check logs for potential issues or warnings during the move step."
      );
    } else {
      console.log("\nAll specified decks processed without critical errors.");
    }
    console.log("Please verify the final state in your Anki application.");
    console.log(`==================================================`);
  } catch (error) {
    // Catch errors that occur outside the deck processing loop (e.g., initial AnkiConnect failure)
    console.error(
      "\n--- A critical error occurred during script execution ---"
    );
    console.error(`Error: ${error.message}`);
    // Hint for connection errors is now within the helper, so this catch is more general.
    overallSuccess = false;
    process.exitCode = 1; // Indicate script failure to the OS
  }
  // No finally block needed as readline is not used.
}

// --- Run the main function ---
console.log("Ensure Anki is running with the AnkiConnect add-on enabled.");
findAndMoveCardsMultiDeck(); // Start the process
