# this file is used to test google image search function
import requests
def google_search_image(query, api_key, cse_id, num=10):
    """
    Search for images using Google Custom Search JSON API.

    Parameters:
    - query: Search term or query.
    - api_key: Your Google API key.
    - cse_id: Your Custom Search Engine ID.
    - num: Number of search results to return (max 10 per request).

    Returns:
    - A list of image URLs.
    """
    search_url = "https://www.googleapis.com/customsearch/v1"
    params = {
        'q': query,
        'cx': cse_id,
        'key': api_key,
        'searchType': 'image',
        'num': num
    }
    
    response = requests.get(search_url, params=params)
    result = response.json()
    
    image_urls = []
    if 'items' in result:
        for item in result['items']:
            image_urls.append(item['link'])
    
    return image_urls

# Example usage
api_key = 'YOUR_API_KEY'
cse_id = 'YOUR_CSE_ID'
query = 'Cute kittens'

image_urls = google_search_image(query, api_key, cse_id)
for url in image_urls:
    print(url)