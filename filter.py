import os
from bs4 import BeautifulSoup

# Specify your HTML file
html_file = 'movielist.html'

# Load HTML content
with open(html_file, 'r', encoding='utf-8') as file:
    soup = BeautifulSoup(file, 'html.parser')

# Find all movie entries
movie_divs = soup.find_all('div', class_='responsive')

# Filter movies based on date
for movie in movie_divs:
    a_tag = movie.find('a')
    date_added = a_tag.get('data-added', '')
    if not any(year in date_added for year in ['2024', '2025']):
        movie.decompose()

# Rename original file to movielist_all.html for backup
os.rename(html_file, 'movielist_all.html')

# Save filtered HTML back to original filename
with open(html_file, 'w', encoding='utf-8') as file:
    file.write(str(soup))

print("Movies filtered successfully. Backup saved as 'movielist_all.html'.")
