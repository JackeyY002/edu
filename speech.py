from openai import OpenAI
import openai
import os
openai_api_key = os.getenv("OPENAI_API_KEY")
print(openai_api_key)
client = OpenAI(api_key = openai_api_key)
audio_file = open("speech.mp3", "rb")
transcript = client.audio.transcriptions.create(
  model="whisper-1",
  file=audio_file,
  response_format = "text"
)
print(transcript)

# this file is used to test openai whisper tts function