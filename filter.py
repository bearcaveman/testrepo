import os
from bs4 import BeautifulSoup
import datetime

# Specify your HTML file
html_file = 'movielist.html'

# Load HTML content
with open(html_file, 'r', encoding='utf-8') as file:
    soup = BeautifulSoup(file, 'html.parser')

def parse_date(date_string):
    """
    Parses a date string of the format:
    "Sun May 21 22:58:54 IDT 2023"
    and returns a datetime object.
    The timezone is removed for parsing.
    """
    tokens = date_string.split()
    if len(tokens) < 6:
        return datetime.datetime.min
    # Remove the timezone (5th token) and rebuild the date string.
    new_date_str = " ".join([tokens[0], tokens[1], tokens[2], tokens[3], tokens[-1]])
    try:
        return datetime.datetime.strptime(new_date_str, "%a %b %d %H:%M:%S %Y")
    except Exception:
        return datetime.datetime.min

# Find all movie entries
movie_divs = soup.find_all('div', class_='responsive')

# Sort movies by 'data-added' date descending (most recent first)
sorted_movies = sorted(
    movie_divs,
    key=lambda movie: parse_date(movie.find('a').get('data-added', '')),
    reverse=True
)

# Find the parent container holding the movies (assuming they are all under the form with id "searchResults")
parent = soup.find('form', id='searchResults')
if parent:
    # Remove all existing movie divs
    for movie in parent.find_all('div', class_='responsive'):
        movie.extract()
    # Append the sorted movie divs back into the parent container
    for movie in sorted_movies:
        parent.append(movie)

# Rename original file to movielist_all.html for backup
os.rename(html_file, 'movielist_all.html')

# Save the updated HTML back to the original filename
with open(html_file, 'w', encoding='utf-8') as file:
    file.write(str(soup))

print("Movies sorted successfully by date descending. Backup saved as 'movielist_all.html'.")
