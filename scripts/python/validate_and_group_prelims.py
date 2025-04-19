import os
import re
import argparse
import sys
import csv # Keep csv import for the validation part if needed, even if split is used
from collections import defaultdict

# Define the subject tags we are looking for
SUBJECT_TAGS = {"ENG", "GK", "MATH", "GI"}
TAG_COLUMN_INDEX = 7 # Column 8 is index 7 (0-based)

# ==============================================================================
# Validation Function (from check-format.py)
# ==============================================================================

def validate_tsv_structure(filepath, expected_columns=8, header_lines=3):
    """
    Validates if each line in a TSV file, after skipping header lines,
    has the expected number of columns.

    Args:
        filepath (str): The path to the TSV file to validate.
        expected_columns (int): The number of columns expected in each data line.
        header_lines (int): The number of lines to skip at the beginning of the file.

    Returns:
        list: A list of line numbers (1-based) that do not have the
              expected number of columns. Returns an empty list if all
              data lines are valid or the file is empty/only contains headers.

    Raises:
        FileNotFoundError: If the filepath does not exist.
        IOError: If there's an error reading the file.
        Exception: For other potential errors during processing.
    """
    incorrect_lines = []
    total_line_count = 0
    data_lines_processed = 0

    print(f"Step 1: Validating file structure '{filepath}'...")
    print(f" -> Expecting {expected_columns} columns per data line.")
    print(f" -> Skipping first {header_lines} header lines.")

    try:
        with open(filepath, 'r', encoding='utf-8', newline='') as infile:
            for line_num, row in enumerate(infile, 1):
                total_line_count += 1

                # --- Skip Header Lines ---
                if line_num <= header_lines:
                    continue # Move to the next line

                # --- Process Data Lines ---
                data_lines_processed += 1
                # Simple split is often enough for basic TSV without special quoting
                # rstrip to remove trailing newline before splitting
                columns = row.rstrip('\n').split('\t')
                num_columns = len(columns)

                if num_columns != expected_columns:
                    # Check for common case: line is completely empty or just whitespace
                    if not row.strip():
                        # Optionally report empty lines, but don't treat as column error by default
                        print(f"  Info: Line {line_num} is empty or whitespace-only.")
                        # uncomment next line to treat empty lines as errors
                        # incorrect_lines.append(line_num)
                    else:
                        incorrect_lines.append(line_num)

    except FileNotFoundError:
        print(f"Error: Input file not found at '{filepath}'", file=sys.stderr)
        raise
    except IOError as e:
        print(f"Error reading file '{filepath}': {e}", file=sys.stderr)
        raise
    except Exception as e:
        current_line_info = f"around line {total_line_count + 1}" if total_line_count >= 0 else "at the beginning"
        print(f"An unexpected error occurred during validation {current_line_info}: {e}", file=sys.stderr)
        raise

    print(f" -> Processed {total_line_count} total lines.")
    print(f" -> Checked {data_lines_processed} data lines.")
    return incorrect_lines

# ==============================================================================
# Subject Tag Check Function
# ==============================================================================

def determine_consistent_subject_tag(filepath, header_lines=3, tag_column_index=TAG_COLUMN_INDEX):
    """
    Checks if all data lines in the file contain the *same* subject tag
    (from SUBJECT_TAGS) in the specified tag column.

    Args:
        filepath (str): Path to the input TSV file.
        header_lines (int): Number of header lines to skip.
        tag_column_index (int): The 0-based index of the column containing tags.

    Returns:
        str or None: The consistent subject tag (e.g., "ENG", "GK") if found
                     in all data lines, otherwise None. Returns None if no
                     data lines exist or if tags are inconsistent or missing.
    """
    print(f"\nStep 2: Checking for consistent subject tag in column {tag_column_index + 1}...")

    first_subject_tag_found = None
    is_consistent = True
    data_lines_checked = 0

    try:
        with open(filepath, 'r', encoding='utf-8', newline='') as infile:
            for line_num, line in enumerate(infile, 1):
                # Skip headers
                if line_num <= header_lines:
                    continue

                # Skip empty or whitespace-only lines
                if not line.strip():
                    continue

                data_lines_checked += 1
                columns = line.rstrip('\n').split('\t')

                # Safety check (validation should catch this, but good practice)
                if len(columns) <= tag_column_index:
                    print(f"  Warning: Line {line_num} has fewer columns ({len(columns)}) than expected tag column index ({tag_column_index}). Cannot check subject tag.", file=sys.stderr)
                    is_consistent = False
                    break # Inconsistency found

                tag_column_content = columns[tag_column_index]
                # Simple check: see if any subject tag is a substring.
                # For more robustness, could split tag_column_content by space/comma
                # and check for exact matches in the resulting list.
                current_line_subject_tag = None
                for subj_tag in SUBJECT_TAGS:
                    # Use word boundaries (\b) for a slightly safer check than simple 'in'
                    # This helps avoid matching 'ENGINE' if looking for 'ENG'
                    if re.search(r'\b' + re.escape(subj_tag) + r'\b', tag_column_content):
                         # Found a subject tag for this line
                        if current_line_subject_tag is not None:
                             # Found *multiple* subject tags on the same line - treat as inconsistent for this purpose
                             print(f"  Info: Line {line_num} contains multiple subject tags ({current_line_subject_tag}, {subj_tag}). Treating as inconsistent for directory naming.")
                             is_consistent = False
                             break # Break inner loop (subject tags)
                        current_line_subject_tag = subj_tag
                if not is_consistent: # Break outer loop if multiple tags found on one line
                    break

                # Now compare with the first tag found
                if data_lines_checked == 1:
                    if current_line_subject_tag is None:
                        # First data line doesn't have a recognized subject tag
                        print(f"  Info: First data line ({line_num}) has no recognized subject tag ({list(SUBJECT_TAGS)}) in column {tag_column_index + 1}.")
                        is_consistent = False
                        break
                    first_subject_tag_found = current_line_subject_tag
                    print(f"  -> Found potential subject tag '{first_subject_tag_found}' on line {line_num}. Checking consistency...")
                else:
                    # Subsequent lines must match the first tag
                    if current_line_subject_tag != first_subject_tag_found:
                        print(f"  Info: Inconsistent subject tag found. Line {line_num} has tag '{current_line_subject_tag}' (or none), expected '{first_subject_tag_found}'.")
                        is_consistent = False
                        break # Inconsistency found

    except (IOError, FileNotFoundError) as e: # FileNotFoundError handled earlier, but keep for safety
        print(f"Error reading file '{filepath}' during subject tag check: {e}", file=sys.stderr)
        return None # Cannot determine consistency
    except Exception as e:
        print(f"An unexpected error occurred during subject tag check: {e}", file=sys.stderr)
        return None # Cannot determine consistency

    if data_lines_checked == 0:
        print("  Info: No data lines found to check for subject tags.")
        return None

    if is_consistent:
        print(f" -> Consistent subject tag '{first_subject_tag_found}' found across all {data_lines_checked} data lines.")
        return first_subject_tag_found
    else:
        print(f" -> Subject tags are inconsistent or missing across {data_lines_checked} data lines.")
        return None

# ==============================================================================
# Grouping Function (from run.py) - Modified to accept target output dir
# ==============================================================================

def group_by_prelims_tag(input_file, target_output_dir, header_lines=3):
    """
    Reads an input text file, groups lines based on 'Prelims-N' tags
    (where N is one or more digits), and writes each group to a separate
    file in the target output directory. Assumes input file structure is valid.

    Args:
        input_file (str): Path to the input text file.
        target_output_dir (str): Path to the specific directory where output
                                 files will be saved (could be base or subject subdir).
                                 The directory will be created if it doesn't exist.
        header_lines (int): Number of header lines in the input file (needed to skip).

    Raises:
        PermissionError: If the script lacks permissions to create the output
                         directory or write output files.
        IOError: For other file I/O related errors during reading/writing.
    """
    print(f"\nStep 3: Grouping lines from '{input_file}' by Prelims tag...")

    # --- 1. Create Target Output Directory ---
    try:
        # target_output_dir is now the final destination (e.g., "output/ENG")
        os.makedirs(target_output_dir, exist_ok=True)
        print(f" -> Output directory: '{target_output_dir}'")
    except PermissionError:
        print(f"Error: Permission denied to create directory '{target_output_dir}'.", file=sys.stderr)
        raise
    except Exception as e:
        print(f"Error creating directory '{target_output_dir}': {e}", file=sys.stderr)
        raise

    # --- 2. Prepare for Grouping ---
    prelims_groups = defaultdict(list)
    prelims_pattern = re.compile(r'Prelims-\d+')
    lines_processed = 0
    tags_found = set()
    # Read header lines from input to write to output files
    header_to_write = ""
    try:
         with open(input_file, 'r', encoding='utf-8') as infile:
             for i, line in enumerate(infile):
                 if i < header_lines:
                     header_to_write += line
                 else:
                     break # Stop reading after headers
    except IOError as e:
        print(f"Warning: Could not read header lines from '{input_file}': {e}. Output files will have a default header.", file=sys.stderr)
        header_to_write = "#separator:tab\n#html:true\n#tags column:8\n" # Fallback header

    # --- 3. Read Input File and Group Lines ---
    try:
        with open(input_file, 'r', encoding='utf-8') as infile:
            # Read the file again for grouping
            for line_num, line in enumerate(infile, 1):
                 # Skip header lines when grouping content
                 if line_num <= header_lines:
                     continue

                 lines_processed += 1
                 match = prelims_pattern.search(line)
                 if match:
                     tag = match.group()
                     # Store the line *exactly* as it was, including newline
                     prelims_groups[tag].append(line)
                     tags_found.add(tag)

    except IOError as e:
        print(f"Error reading input file '{input_file}' during grouping: {e}", file=sys.stderr)
        raise
    except Exception as e:
        print(f"An unexpected error occurred during file reading/grouping: {e}", file=sys.stderr)
        raise

    print(f" -> Processed {lines_processed} data lines for grouping.")
    print(f" -> Found {len(tags_found)} unique Prelims tags.")

    if not prelims_groups:
        print(" -> No 'Prelims-N' tags found in data lines. No output files generated.")
        return # Exit grouping gracefully

    # --- 4. Write Grouped Lines to Separate Files ---
    files_written = 0
    print(" -> Writing output files...")
    for tag, lines in prelims_groups.items():
        filename_tag = tag # Use the full 'Prelims-N' tag for filename
        output_file = os.path.join(target_output_dir, f"{filename_tag}.txt")

        try:
            with open(output_file, 'w', encoding='utf-8', newline='') as outfile: # Use newline='' to prevent extra blank rows
                outfile.write(header_to_write) # Write the captured or default header
                outfile.writelines(lines)      # Write the data lines for this group
            files_written += 1
            # print(f"  -> Written: {output_file}") # Optional: print each file written
        except PermissionError:
            print(f"  Error: Permission denied to write file '{output_file}'. Skipping tag '{tag}'.", file=sys.stderr)
        except IOError as e:
            print(f"  Error writing file '{output_file}' for tag '{tag}': {e}. Skipping.", file=sys.stderr)
        except Exception as e:
             print(f"  An unexpected error occurred writing file for tag '{tag}': {e}. Skipping.", file=sys.stderr)

    print(f" -> Successfully wrote {files_written} files to '{target_output_dir}'.")


# ==============================================================================
# Main Execution Logic
# ==============================================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Validate TSV format, check for consistent subject tag, and group lines by 'Prelims-N' tags into separate files, potentially within a subject-specific subdirectory.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter # Show defaults in help
    )
    parser.add_argument(
        "input_file",
        help="Path to the input TSV file."
    )
    parser.add_argument(
        "-o", "--output-dir",
        default="output",
        help="Base directory to save the grouped output files. A subject subdirectory (e.g., ENG, GK) may be created within this directory if a consistent subject tag is found."
    )
    parser.add_argument(
        "-c", "--columns",
        type=int,
        default=8,
        help="Expected number of columns per data line for validation."
    )
    parser.add_argument(
        "-H", "--header-lines",
        type=int,
        default=3,
        help="Number of header lines to skip during validation and processing."
    )
    parser.add_argument(
        "--tag-column",
        type=int,
        default=8,
        help="The column number (1-based) containing tags (used for subject check)."
    )

    args = parser.parse_args()

    # --- Basic Argument Checks ---
    if not os.path.isfile(args.input_file): # More specific check for file
         print(f"Error: Input file not found or is not a file at '{args.input_file}'", file=sys.stderr)
         sys.exit(1)

    if args.header_lines < 0:
        print("Error: Number of header lines cannot be negative.", file=sys.stderr)
        sys.exit(1)

    if args.columns <= 0:
        print("Error: Expected number of columns must be positive.", file=sys.stderr)
        sys.exit(1)

    if not (1 <= args.tag_column <= args.columns):
         print(f"Error: Tag column ({args.tag_column}) must be between 1 and the expected number of columns ({args.columns}).", file=sys.stderr)
         sys.exit(1)

    # Convert 1-based tag column argument to 0-based index
    tag_column_index = args.tag_column - 1

    # --- Run Workflow ---
    try:
        # Step 1: Validate Structure
        invalid_lines = validate_tsv_structure(
            args.input_file, args.columns, args.header_lines
        )

        # Check Validation Results
        if invalid_lines:
            print(f"\nValidation Failed: Found {len(invalid_lines)} data lines with incorrect number of columns (expected {args.columns}).")
            print("Incorrect line numbers:", ", ".join(map(str, invalid_lines)))
            print("\nPlease fix the input file format before proceeding.")
            sys.exit(1) # Exit with error code because validation failed
        else:
            print(" -> Validation successful: Input file format is correct.")

            # Step 2: Determine consistent subject tag
            consistent_subject = determine_consistent_subject_tag(
                args.input_file, args.header_lines, tag_column_index
            )

            # Determine final output directory
            base_output_dir = args.output_dir
            if consistent_subject:
                target_output_dir = os.path.join(base_output_dir, consistent_subject)
                print(f" -> Using subject-specific output directory: '{target_output_dir}'")
            else:
                target_output_dir = base_output_dir
                print(f" -> Using base output directory: '{target_output_dir}' (no consistent subject tag found)")

            # Step 3: Group by Tag (only if validation passed)
            group_by_prelims_tag(args.input_file, target_output_dir, args.header_lines)
            print("\nScript finished successfully.")
            sys.exit(0) # Explicitly exit with success code

    except (FileNotFoundError, PermissionError, IOError) as e:
        # Errors during file operations (already printed specific messages)
        print("\nScript finished with file/permission errors.", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        # Catch any other unexpected errors
        print(f"\nAn unexpected critical error occurred: {e}", file=sys.stderr)
        # You might want to print traceback here for debugging
        # import traceback
        # traceback.print_exc()
        sys.exit(1)