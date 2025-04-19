import os

# Function to merge files in order
def merge_files(folder_path):
    # Get the list of files in the directory
    files = os.listdir(folder_path)
    
    # Filter only the files that match the pattern 'Prelims-x.txt'
    txt_files = [file for file in files if file.startswith("Prelims-") and file.endswith(".txt")]
    
    # Sort the files based on the integer after 'Prelims-'
    txt_files.sort(key=lambda x: int(x.split('-')[1].split('.txt')[0]))
    
    # Output file path
    folder_name = os.path.basename(folder_path)
    output_file = os.path.join(folder_path, f"{folder_name}_merged.txt")
    
    # Open the output file for writing with UTF-8 encoding
    with open(output_file, 'w', encoding='utf-8') as merged_file:
        # Write the header once at the beginning of the merged file
        merged_file.write("#separator:tab\n#html:true\n#tags column:8\n")
        
        for txt_file in txt_files:
            file_path = os.path.join(folder_path, txt_file)
            # Open each file with UTF-8 encoding and skip the header lines (first 3 lines)
            with open(file_path, 'r', encoding='utf-8') as file:
                # Skip the header lines
                lines = file.readlines()[3:]
                # Write the remaining content to the merged file
                merged_file.writelines(lines)
    
    print(f"Files merged successfully into {output_file}")

# Prompt for folder path
folder_path = input("Please enter the folder path: ")

# Check if the folder exists
if os.path.isdir(folder_path):
    merge_files(folder_path)
else:
    print("Invalid folder path. Please try again.")
