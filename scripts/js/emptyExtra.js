const fs = require("fs");
const path = require("path");

// --- Configuration ---
const inputFileName = "input.json";
const notesDirRelativePath = "../notes"; // Relative path to the notes directory
// ---------------------

// Construct the full path to the input JSON file
const inputFilePath = path.join(__dirname, notesDirRelativePath, inputFileName);
// Since we're overwriting the input file, the outputFilePath is the same as inputFilePath
const outputFilePath = inputFilePath; // Overwrite the input file
// Get the directory path for the input file (which is also the output directory)
const outputDir = path.dirname(outputFilePath);

console.log(`Input file: ${inputFilePath}`);
console.log(`Output directory: ${outputDir}`);
console.log(`Output file (same as input): ${outputFilePath}`);

try {
  // 1. Read the INPUT JSON file
  // Check if input file exists first
  if (!fs.existsSync(inputFilePath)) {
    console.error(`Error: Input file not found at ${inputFilePath}`);
    process.exit(1);
  }
  const fileContent = fs.readFileSync(inputFilePath, "utf-8");
  console.log(`Successfully read input file: ${inputFileName}`);

  // 2. Parse the JSON content (expecting an array)
  let jsonDataArray;
  try {
    jsonDataArray = JSON.parse(fileContent);
    if (!Array.isArray(jsonDataArray)) {
      throw new Error(
        "The root JSON structure is not an array. Please ensure the input file contains a valid JSON array."
      );
    }
  } catch (parseError) {
    console.error(`Error parsing JSON data from ${inputFileName}:`, parseError);
    console.error("Please ensure the file contains a valid JSON array.");
    process.exit(1);
  }
  console.log(
    `Successfully parsed JSON array containing ${jsonDataArray.length} objects.`
  );

  // 3. Iterate through the array and empty the 'Extra' field for each object
  let fieldsModifiedCount = 0;
  jsonDataArray.forEach((item, index) => {
    if (typeof item !== "object" || item === null) {
      console.warn(`Skipping item at index ${index} as it's not an object.`);
      return;
    }
    if (item.hasOwnProperty("Extra")) {
      // Only count modification if the value actually changes
      if (item.Extra !== "") {
        item.Extra = ""; // Set the value to an empty string
        fieldsModifiedCount++;
      }
    } else {
      console.warn(
        `Warning: The 'Extra' field was not found in the object at index ${index}.`
      );
    }
  });

  if (fieldsModifiedCount > 0) {
    console.log(`Emptied the 'Extra' field in ${fieldsModifiedCount} objects.`);
  } else {
    console.log(
      "No 'Extra' fields required modification (already empty or not found)."
    );
  }

  // 4. Convert the modified array back to a JSON string
  const updatedJsonString = JSON.stringify(jsonDataArray, null, 4); // Use 4 spaces for indentation

  // 5. Ensure the output directory exists before writing the file
  try {
    if (!fs.existsSync(outputDir)) {
      console.log(`Output directory does not exist. Creating: ${outputDir}`);
      fs.mkdirSync(outputDir, { recursive: true }); // Create directory recursively if it doesn't exist
      console.log(`Successfully created output directory.`);
    }
  } catch (dirError) {
    console.error(`Error creating output directory '${outputDir}':`, dirError);
    process.exit(1);
  }

  // 6. Write the updated JSON string to the input file (overwrite)
  fs.writeFileSync(outputFilePath, updatedJsonString, "utf-8");
  console.log(`Successfully wrote updated data to: ${outputFilePath}`);
} catch (error) {
  // Catch general errors (like permissions issues during write)
  console.error(`An unexpected error occurred: ${error.message}`);
  if (error.code === "ENOENT" && error.path === inputFilePath) {
    console.error(
      `Error: The input file path does not exist: ${inputFilePath}`
    );
  } else if (error.code === "EACCES") {
    console.error(
      `Error: Permission denied when trying to write to ${outputFilePath}`
    );
  }
  process.exit(1); // Exit the script with an error code
}
