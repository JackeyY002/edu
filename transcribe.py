# this file is used to test youtube transcribe function
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.formatters import TextFormatter


def main():
    # v = search_youtube_videos(api_key,'coffee')
    transcript_list = YouTubeTranscriptApi.get_transcript("GGnzB9BqtIc", languages=['en', 'en-US', 'en-GB'],)
    print(transcript_list)


if __name__ == "__main__":
    main()