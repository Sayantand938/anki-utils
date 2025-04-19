const fs = require("fs");

// Define global constants
const INPUT_FILE = "notes/input.json"; // Input JSON file
const OUTPUT_FILE = "notes/Custom Study Session.txt"; // Output TXT file
const METADATA = ["#separator:tab", "#html:true", "#tags column:8"];

// Function to read the JSON file and convert it to TXT format
function convertJsonToTxt() {
  try {
    // Step 1: Read the JSON file from the current directory
    const jsonData = JSON.parse(fs.readFileSync(INPUT_FILE, "utf8"));

    // Step 2: Convert JSON data to tab-separated rows
    const rows = jsonData.map((note) => {
      return [
        note.Question,
        note.OP1,
        note.OP2,
        note.OP3,
        note.OP4,
        note.Answer,
        note.Extra || "", // Handle empty Extra field
        note.tags.join(" "), // Join tags into a space-separated string
      ].join("\t"); // Use tab as the separator
    });

    // Step 3: Combine metadata and rows
    const txtContent = [...METADATA, ...rows].join("\n");

    // Step 4: Save the content to the output file
    fs.writeFileSync(OUTPUT_FILE, txtContent);

    console.log(`TXT file has been saved to ${OUTPUT_FILE}.`);
  } catch (error) {
    console.error("An error occurred:", error.message);
  }
}

// Call the function
convertJsonToTxt();
