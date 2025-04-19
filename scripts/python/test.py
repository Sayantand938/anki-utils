# import re
# import sys
# import os
# import xxhash
# from rich.table import Table
# from rich.console import Console
# from rich.progress import Progress
# from datetime import datetime
# import requests

# def extract_links(file_path):
#     try:
#         with open(file_path, 'r', encoding='utf-8') as file:
#             content = file.read()
#         pattern = r"https://[^\s\"']+"
#         links = re.findall(pattern, content)
#         cleaned_links = [link.rstrip('\"') for link in links]
#         return cleaned_links
#     except Exception as e:
#         print(f"Error reading file: {e}")
#         return []

# def download_image(link, hash_value, output_folder):
#     try:
#         response = requests.get(link, stream=True, timeout=10)
#         response.raise_for_status()
#         file_path = os.path.join(output_folder, f"{hash_value}.png")
#         with open(file_path, 'wb') as image_file:
#             for chunk in response.iter_content(1024):
#                 image_file.write(chunk)
#         return file_path
#     except Exception as e:
#         return f"Failed: {e}"

# if __name__ == "__main__":
#     if len(sys.argv) != 2:
#         print("Usage: python links_and_hashes_with_progress.py <path_to_file>")
#         sys.exit(1)

#     file_path = sys.argv[1]
#     links = extract_links(file_path)

#     if links:
#         output_folder = "output/images"
#         os.makedirs(output_folder, exist_ok=True)

#         console = Console()
#         results = []
#         failed_links = []

#         with Progress(console=console, transient=True) as progress:
#             task = progress.add_task("[cyan]Downloading Images...", total=len(links))

#             for i, link in enumerate(links, start=1):
#                 timestamp = datetime.now().isoformat()
#                 hash_input = f"{link}::{timestamp}"
#                 hash_value = xxhash.xxh64(hash_input).hexdigest()
#                 saved_file = download_image(link, hash_value, output_folder)
#                 results.append((i, link, saved_file))
#                 if "Failed" in saved_file:
#                     failed_links.append((i, link, hash_value))
#                 progress.advance(task)

#         # Retry failed downloads once
#         if failed_links:
#             console.print(f"\n[bold yellow]Retrying {len(failed_links)} failed downloads...[/bold yellow]")
#             for i, link, hash_value in failed_links:
#                 saved_file = download_image(link, hash_value, output_folder)
#                 results[i - 1] = (i, link, saved_file)

#         # Final check
#         saved_images = [
#             f for f in os.listdir(output_folder)
#             if os.path.isfile(os.path.join(output_folder, f)) and f.endswith(".png")
#         ]

#         if len(saved_images) == len(links):
#             # Step 1: Modify original file content
#             try:
#                 with open(file_path, 'r', encoding='utf-8') as f:
#                     original_text = f.read()

#                 for _, link, saved_file in results:
#                     if "Failed" not in saved_file:
#                         filename = os.path.basename(saved_file)
#                         original_text = original_text.replace(link, filename)

#                 with open(file_path, 'w', encoding='utf-8') as f:
#                     f.write(original_text)

#                 console.print(f"[green]Replaced all links with filenames in:[/green] {file_path}")
#             except Exception as e:
#                 console.print(f"[red]Failed to update original file:[/red] {e}")

#             # Step 2: Show table
#             table = Table(title="Saved Files Summary")
#             table.add_column("SL", justify="right", style="bold magenta")
#             table.add_column("Saved File", justify="left", style="yellow")

#             for sl, _, saved_file in results:
#                 name = os.path.basename(saved_file) if "Failed" not in saved_file else "[red]Download Failed[/red]"
#                 table.add_row(str(sl), name)

#             console.print(table)
#         else:
#             console.print(f"[red]Error:[/red] Expected {len(links)} images, but found {len(saved_images)} in '{output_folder}'.")

#     else:
#         print("No links found or an error occurred.")

import re
import sys
import os
import xxhash
from rich.table import Table
from rich.console import Console
from rich.progress import Progress
from datetime import datetime
import requests

def extract_links(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            content = file.read()
        pattern = r"https://[^\s\"']+"
        links = re.findall(pattern, content)
        return content, links
    except Exception as e:
        print(f"Error reading file: {e}")
        return "", []

def download_image(link, hash_value, output_folder):
    try:
        response = requests.get(link, stream=True, timeout=10)
        response.raise_for_status()
        file_path = os.path.join(output_folder, f"{hash_value}.png")
        with open(file_path, 'wb') as image_file:
            for chunk in response.iter_content(1024):
                image_file.write(chunk)
        return file_path
    except Exception:
        return None

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python script.py <path_to_file>")
        sys.exit(1)

    file_path = sys.argv[1]
    content, links = extract_links(file_path)

    if not links:
        print("No links found or an error occurred.")
        sys.exit(1)

    output_folder = "output/images"
    os.makedirs(output_folder, exist_ok=True)

    console = Console()
    updated_content = content
    results = []
    failed_links = []

    with Progress(console=console) as progress:
        task = progress.add_task("[cyan]Downloading Images...", total=len(links))

        for i, link in enumerate(links, start=1):
            timestamp = datetime.now().isoformat()
            hash_input = f"{link}::{timestamp}"
            hash_value = xxhash.xxh64(hash_input).hexdigest()

            saved_file = download_image(link, hash_value, output_folder)

            # Retry once if failed
            if not saved_file:
                saved_file = download_image(link, hash_value, output_folder)

            if saved_file:
                filename = os.path.basename(saved_file)
                updated_content = updated_content.replace(link, filename)
                results.append((i, filename))
            else:
                failed_links.append((i, link))

            progress.advance(task)

    # Write updated content back to the file
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(updated_content)
        console.print(f"[green]Updated file saved with downloaded filenames:[/green] {file_path}")
    except Exception as e:
        console.print(f"[red]Failed to write updated file:[/red] {e}")

    # Show final summary table
    table = Table(title="Downloaded Files Summary")
    table.add_column("SL", justify="right", style="bold magenta")
    table.add_column("Saved File", justify="left", style="yellow")

    for sl, filename in results:
        table.add_row(str(sl), filename)

    console.print(table)

    # Show failed links, if any
    if failed_links:
        console.print(f"\n[red]Failed to download {len(failed_links)} link(s):[/red]")
        for sl, link in failed_links:
            console.print(f"[{sl}] {link}")
