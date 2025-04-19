const fs = require("fs");
const path = require("path");

// Define global constants
const INPUT_FILE = path.resolve(
  __dirname,
  "..",
  "notes",
  "Custom Study Session.json"
); // Corrected input JSON file path
const OUTPUT_FILE = INPUT_FILE; // Output JSON file (overwrite the input file)

// List of tags to retain (in addition to those starting with "Prelims")
const ALLOWED_TAGS = ["ENG", "GK", "MATH", "GI"];

// Function to filter tags based on the rules
function filterTags(tags) {
  return tags.filter((tag) => {
    // Retain tags that start with "Prelims"
    if (tag.startsWith("Prelims")) {
      return true;
    }
    // Retain specific allowed tags
    if (ALLOWED_TAGS.includes(tag)) {
      return true;
    }
    // Remove all other tags
    return false;
  });
}

// Function to process the JSON file
function processJsonFile() {
  try {
    // Step 1: Read the JSON file
    const jsonData = JSON.parse(fs.readFileSync(INPUT_FILE, "utf8"));

    // Step 2: Process each note and filter its tags
    jsonData.forEach((note) => {
      note.tags = filterTags(note.tags);
    });

    // Step 3: Write the modified JSON back to the file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(jsonData, null, 2));

    console.log(`Processed JSON has been saved to ${OUTPUT_FILE}.`);
  } catch (error) {
    console.error("An error occurred:", error.message);
  }
}

// Call the function
processJsonFile();
