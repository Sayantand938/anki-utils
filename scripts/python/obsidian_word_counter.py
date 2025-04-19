import re
import urllib.parse
import os

def count_words_excluding_bold_and_headings(obsidian_url):
    # Parse the Obsidian URL to extract the file path
    parsed_url = urllib.parse.urlparse(obsidian_url)
    query_params = urllib.parse.parse_qs(parsed_url.query)
    
    file_path_encoded = query_params.get("file", [""])[0]
    file_path = urllib.parse.unquote(file_path_encoded)  # Decode the file path

    # Get the base path for the Obsidian vault from the environment variable
    base_path = os.getenv('OBSIDIAN_DIR')
    if not base_path:
        raise EnvironmentError("The OBSIDIAN environment variable is not set or is empty.")

    # Construct the absolute file path (vault name is not needed)
    absolute_file_path = os.path.join(base_path, file_path + ".md")
    
    # Validate if the file exists
    if not os.path.exists(absolute_file_path):
        raise FileNotFoundError(f"The file '{absolute_file_path}' does not exist.")
    
    # Count words excluding bold text and headings
    word_count = 0
    bold_pattern = re.compile(r'\*\*(.*?)\*\*')  # matches **bold text**
    
    with open(absolute_file_path, 'r', encoding='utf-8') as file:
        for line in file:
            if line.strip().startswith("##"):  # skip markdown headings
                continue

            # Remove bold text
            line = re.sub(bold_pattern, '', line)

            # Count remaining words
            words = line.strip().split()
            word_count += len(words)

    return word_count

# Example usage:
obsidian_url = input("Enter the Obsidian URL: ").strip().strip('"')
try:
    print("Word count (excluding bold text and headings):", count_words_excluding_bold_and_headings(obsidian_url))
except Exception as e:
    print("Error:", str(e))
