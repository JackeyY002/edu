from flask import Flask, jsonify, request, render_template, url_for,stream_with_context, Response, send_file, after_this_request
from flask_cors import CORS
import openai
from openai import OpenAI
import os
import random
import json
import re
app = Flask(__name__)
CORS(app)

initial_conversation = [{
    "role": "system",
    "content": ("You are a helpful assistant for answering rail-related questions. You should provide specific explanations and extend the related knowledge to the user. However, you also need to keep the response concise.")
}]

initial_hint_list = [{
    "role": "system",
    "content": "You are a helpful assistant. Provide hints to the user based on the current question and their choice. It needs to be brief and concise."
}]

initial_explain_list = [{
    "role": "system",
    "content": "You are a helpful assistant, skilled in explaining rail-related concepts. "
                "Your responses should be clear and educational but need to be brief and concise."
                
}]
initial_determine_list = [{
    "role": "system",
    "content": ("You are a highly intelligent assistant capable of understanding complex requests related to image generation, video searching, and text responses. "
                "When you receive a user message, analyze the nature of the request. "
                "For image requests, respond with 'type: image' and 'keyword: a keyword for Google Search Engine.' "
                "For video search requests, respond with 'type: video' and a 'search_query: searching keyword'. "
                "For text responses, simply respond with 'type: text'. "
                "Ensure your response is clear and specific to the user's request.")
}]


# Global variables to maintain state
message = []
conversation = []
hint_list = []
explain_list = []

# Function to reset history
def resetHistory():
    global message, conversation, hint_list, explain_list
    conversation = initial_conversation[:]
    hint_list = initial_hint_list[:]
    explain_list = initial_explain_list[:]
openai_api_key = os.getenv("OPENAI_API_KEY")
client = openai.Client(api_key=openai_api_key)


def gpt4_dialogue(conversation):  # fetch question through openAi Api
    try:
        response = client.chat.completions.create(
            model="gpt-4-1106-preview",
            messages=conversation,
        )
        response_content = response.choices[0].message.content
        print(response_content)
        return response_content
    except Exception as e:
        print(e)
        return {"error": "There was an error processing the request."}

def gpt3_dialogue(conversation):
    try:
        response = client.chat.completions.create(
            model="gpt-3.5-turbo-0125",
            messages=conversation,
        )
        response_content = response.choices[0].message.content
        print("Response Content:", response_content)      
        # print usage message
        usage_info = response.usage
        print("Usage Info:", usage_info)
        
        return response_content
    except Exception as e:
        print(e)
        return {"error": "There was an error processing the request."}



    

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/favicon.ico')
def favicon():
    return url_for('static', filename='favicon.ico')

# to extract valid message if openai doesn't include
def extract_json_content(response_content):
    match = re.search(r'\[.*\]', response_content, re.DOTALL)
    if match:
        json_content = match.group(0)
        try:       
            json_data = json.loads(json_content)
            return json_content
        except json.JSONDecodeError:
            return None
    else:
        return None


@app.route('/ask', methods=['POST'])
def get_gpt3_question():
    resetHistory()
    data = request.get_json()
    topic = data.get('topic', '')  # Provide a default empty string if no topic is found
    message = [{
    "role": "system",
    "content": (f"Generate a list of 5 questions and answers in pure JSON format related to '{topic}'. "
                "Be creative to avoid repetition. Each entry should consist of a 'question' and an 'answers' array, "
                "with each answer providing 'text' and a 'correct' boolean. Do not include any additional text or formatting outside the JSON structure. "
                "Format your response to be directly parseable as JSON, without any markdown or external characters. Example structure: "
                '{"question": "What is the fastest train in the world?", "answers": [{"text": "Shinkansen", "correct": false}, ...]}')
}]
    response_data = gpt4_dialogue(message)  
    extract_data = extract_json_content(response_data)
    return jsonify(extract_data)

#Default endpoint
@app.route('/stream', methods=['POST'])
def stream():
    user_input = request.json['message']
    print(user_input)
    conversation.append({"role": "user", "content": user_input})
    def generate():
        # Stream Prompt
        stream = client.chat.completions.create(
            model="gpt-4-1106-preview",
            messages=conversation,
            stream=True,
        )
        full_response = ""
        for chunk in stream:
            if chunk.choices[0].delta.content is not None:
                data = chunk.choices[0].delta.content
                full_response += data
                yield data
        conversation.append({"role": "assistant", "content": full_response})
    return Response(stream_with_context(generate()), mimetype='text/event-stream')

#hint endpoint(before answer question)
@app.route('/hint', methods=['POST'])
def hint():
    user_input = request.json['message']  
    current_question = request.json['currentQuestion']  
    options = request.json['options'] 
    hint_list.append({"role": "system", "content": f"Current question: {current_question}"})
    options_content = ", ".join([f"{opt['text']}" for opt in options])
    hint_list.append({"role": "system", "content": f"Options: {options_content}"})
    hint_list.append({"role": "user", "content": user_input})

    def generate():
        try:
            stream = client.chat.completions.create(
                model="gpt-4-1106-preview",
                messages=hint_list,
                stream=True,
            )
            for chunk in stream:
                if chunk.choices[0].delta.content is not None:
                    data = chunk.choices[0].delta.content
                    yield data
                    hint_list.append({"role": "assistant", "content": data})
        except Exception as e:
            print(e)
            yield "Error generating hint."

    return Response(stream_with_context(generate()), mimetype='text/event-stream')

#explain endpoint(after answer question)
@app.route('/explain', methods=['POST'])
def explain():
    current_question = request.json['currentQuestion']
    selected_option = request.json['selectedOption']
    is_correct = request.json['isCorrect']
    options = request.json['options']
    options_content = ", ".join([f"{opt['text']}" for opt in options])
    explain_list.append({"role": "system", "content": f"Question: {current_question}, Options: {options_content}, Selected: {selected_option}"})
    if is_correct:
        system_prompt = "The user has selected the correct answer. Provide encouragement and extend the topic with additional related information."
    else:
        system_prompt = "The user has selected the wrong answer. Provide a clear explanation for the correct answer and extend the topic with additional related information."
    explain_list.append({"role": "system", "content": system_prompt})
   
    def generate():
        try:
            stream = client.chat.completions.create(
                model="gpt-4-1106-preview",
                messages=explain_list,
                stream=True,
            )
            for chunk in stream:
                if chunk.choices[0].delta.content is not None:
                    data = chunk.choices[0].delta.content
                    yield data
                    explain_list.append({"role": "assistant", "content": data})
        except Exception as e:
            print(e)
            yield "Error generating explanation."

    return Response(stream_with_context(generate()), mimetype='text/event-stream')

# voice generation endpoint---currently not using
voices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]#supported type of voice
@app.route('/tts', methods=['POST'])
def text_to_speech():
    data = request.get_json()
    text = data['text']
    voice = random.choice(voices)
    try:
        response = client.audio.speech.create(
            model="tts-1",
            voice=voice,
            input=text,
            speed=1.2
        )

        audio_file_path = os.path.join(app.root_path, 'speech.mp3')
        response.stream_to_file(audio_file_path)

        return send_file(audio_file_path, mimetype='audio/mpeg')
    except Exception as e:
        print(f"An error occurred: {e}")
        return jsonify({"error": "TTS generation failed"}), 500

#image-generation endpoint---currently not using
@app.route('/generate-image', methods=['POST'])
def generate_image():
    data = request.get_json()
    prompt = data['prompt']
    image_url = create_image(prompt)
    return jsonify({'imageUrl': image_url})

def create_image(prompt):
    try:
        response = client.images.generate(
            model="dall-e-3",
            prompt=f"A photograph of {prompt}",
            size="1792x1024",
            quality="standard",
            n=1,
)
        url = response.data[0].url
        print(url)
        return url
    except Exception as e:
        print(f"An error occurred: {e}")
        return jsonify({"error": "Image generation failed"}), 500
    

GOOGLE_API_KEY = os.getenv("GOOGLE_SEARCH_KEY")
GOOGLE_CSE_ID = os.getenv("CSE_ID")   
GOOGLE_CSE_URL = "https://www.googleapis.com/customsearch/v1"
import requests
@app.route('/search-images', methods=['POST'])
def search_images():
    data = request.get_json()
    query = data['query']
    search_params = {
        "key": GOOGLE_API_KEY,
        "cx": GOOGLE_CSE_ID,
        "q": query,
        "searchType": "image",
        "num": 10,  
        "fileType": "jpg|png",  
        "imgType": "photo", 
    }
    
    response = requests.get(GOOGLE_CSE_URL, params=search_params)
    result = response.json()
    image_urls = [item['link'] for item in result.get('items', [])]
    
    return jsonify({'imageUrls': image_urls})
        
import googleapiclient.discovery
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.formatters import TextFormatter
api_key = os.getenv("YOUTUBE_API_KEY")
#google api client youtube endpoint
def search_youtube_videos(api_key, search_query):
    youtube = googleapiclient.discovery.build('youtube', 'v3', developerKey=api_key)

    search_response = youtube.search().list(
        q=search_query,
        part='snippet',
        maxResults=5,
        regionCode="us",
        type="video",
        relevanceLanguage="en",
        videoCaption="closedCaption",
        videoDuration="medium"
    ).execute()

    videos_text = []
    for video in search_response.get('items', []):
        if video['id']['kind'] == 'youtube#video':
            video_id = video['id']['videoId']
            video_title = video['snippet']['title']
            video_url = f"https://www.youtube.com/watch?v={video_id}"
            try:
                transcript_list = YouTubeTranscriptApi.get_transcript(video_id, languages=['en', 'en-US', 'en-GB'])
                formatter = TextFormatter()
                text_formatted = formatter.format_transcript(transcript_list)
                videos_text.append({"id": video_id, "title": video_title, "url": video_url, "text": text_formatted})
            except Exception as e:
                print(f"Error fetching transcript for video {video_id}: {e}")
                # if cannot transcribe
                continue

    # determine the best video
    best_video = determine_best_video(videos_text, search_query)
    return best_video

def determine_best_video(videos_text, search_query):
    conversation = [
        {"role": "system", "content": "Given the search query and the following video transcripts which is a list including 'text', 'start' and 'duration' , decide which video best answers the query. You should ingnore 'duration' and use 'start' which suggests the amount of seconds to position. Provide the video ID, the specific time point(mm:ss) in the video where it starts to explain the topic related to the search query and if the video is short(< 6 min) return 00:00, and a brief summary of the video topic. Please format your response as follows:\n\nid: [video ID]\ntimestamp: [relevant timestamp]\nreply: [brief explanation]"}
    ]
    conversation.append({"role": "user", "content": "search query: " + search_query})
    for video in videos_text:
        conversation.append({"role": "system", "content": f"Video ID: {video['id']}, Title: {video['title']}, Transcript: {video['text']}"})
   
    response_content = gpt3_dialogue(conversation)
    lines = response_content.strip().split("\n")  
    if len(lines) >= 3:
        # Get id, timestamp, reply
        best_video_info = {
            'id': lines[0].replace("id: ", ""),
            'timestamp': lines[1].replace("timestamp: ", ""),
            'reply': lines[2].replace("reply: ", "")
        }
        # Search youtube videos and append title, url
        matching_video = next((video for video in videos_text if video['id'] == best_video_info['id']), None)
        if matching_video:
            best_video_info.update({
                'title': matching_video['title'],
                'url': matching_video['url']
            })
        return best_video_info
    else:
        print("No matching video found by GPT-4 or response format is incorrect.")
        return None

#youtube video search endpoint
@app.route('/search-video', methods=['POST'])
def search_video():
    data = request.get_json()
    search_query = data.get('query', '')
    best_video_info = search_youtube_videos(api_key, search_query)
    if best_video_info:
        response_data = {
            'videoTitle': best_video_info.get('title', 'Title not found'),
            'videoUrl': best_video_info.get('url', ''),
            'timestamp': best_video_info.get('timestamp', ''),
            'explanation': best_video_info.get('reply', '')
        }
    else:
        response_data = {"error": "Unable to determine the best video or fetch its details."}

    return jsonify(response_data)


@app.route('/gpt-determine-action', methods=['POST'])
def gpt_determine_action():
    data = request.get_json()
    message = data['message']
    # Update Message Prompt
    determine_list = initial_determine_list + [{"role": "user", "content": message}]
    try:
        response = client.chat.completions.create(
            model="gpt-4-1106-preview",
            messages=determine_list,
        )
        response_content = response.choices[0].message.content
        print(response_content)
        if 'type: image' in response_content:
            keyword = response_content.split('keyword: ')[1].strip() if 'keyword: ' in response_content else ""
            return jsonify({'type': 'image', 'keyword': keyword})
        elif 'type: video' in response_content:
            search_query = response_content.split('search_query: ')[1].strip() if 'search_query: ' in response_content else ""
            print(search_query)
            return jsonify({'type': 'video', 'search_query': search_query})
        else:
            return jsonify({'type': 'text'})
    except Exception as e:
        print(e)
        return jsonify({"error": "Error processing the GPT-4 request."}), 500



if __name__ == '__main__':
    app.run(host='0.0.0.0', port=4000)
    
