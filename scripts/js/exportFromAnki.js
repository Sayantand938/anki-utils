const http = require("http");
const fs = require("fs");

// Define global constants
const ANKI_CONNECT_URL = "http://localhost:8765"; // AnkiConnect API endpoint
const DECK_NAME = "Custom Study Session"; // Deck name
const OUTPUT_FILE = "notes/input.json"; // Output file path

// Function to send a request to AnkiConnect API
async function getDeckNoteDetails() {
  try {
    const notesInfoPayload = JSON.stringify({
      action: "notesInfo",
      version: 6,
      params: {
        query: `deck:\"${DECK_NAME}\"`,
      },
    });

    const options = {
      hostname: "localhost",
      port: 8765,
      path: "/",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(notesInfoPayload),
      },
    };

    const req = http.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const notesInfoResponse = JSON.parse(data);
          if (notesInfoResponse.error) {
            throw new Error(notesInfoResponse.error);
          }

          const notesDetails = notesInfoResponse.result;
          if (!notesDetails || notesDetails.length === 0) {
            console.log(`No notes found in the "${DECK_NAME}" deck.`);
            return;
          }

          // Transform data
          const transformedNotes = notesDetails.map((note) => {
            const fields = note.fields;
            return {
              noteId: note.noteId,
              Question: fields.Question?.value || "",
              OP1: fields.OP1?.value || "",
              OP2: fields.OP2?.value || "",
              OP3: fields.OP3?.value || "",
              OP4: fields.OP4?.value || "",
              Answer: fields.Answer?.value || "",
              Extra: fields.Extra?.value || "", // Added Extra field
              tags: note.tags || [],
            };
          });

          // Save to JSON file
          fs.writeFileSync(
            OUTPUT_FILE,
            JSON.stringify(transformedNotes, null, 2)
          );
          console.log(
            `Details of ${transformedNotes.length} notes have been saved to ${OUTPUT_FILE}.`
          );
        } catch (error) {
          console.error("Error processing response:", error.message);
        }
      });
    });

    req.on("error", (error) => {
      console.error("Request error:", error.message);
    });

    req.write(notesInfoPayload);
    req.end();
  } catch (error) {
    console.error("An error occurred:", error.message);
  }
}

// Call the function
getDeckNoteDetails();
