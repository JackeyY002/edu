let questions = [];
document.addEventListener("DOMContentLoaded", () => {
  const chatContainer = document.querySelector(".chat-container");
  const startButton = document.getElementById("start-btn");
  const startScreen = document.getElementById("start-screen");
  const quizApp = document.getElementById("quiz-app");
  const modal = document.getElementById("imageModal");
  const modalImg = document.getElementById("modalImg");
  const captionText = document.getElementById("caption");
  const closeSpan = document.querySelector(".close");
  const prevButton = document.querySelector(".prev");
  const nextButton = document.querySelector(".next");

  // Event handler for clicking the start button
  startButton.addEventListener("click", () => {
    const topic =
      document.querySelector("input.topic-input").value.trim() ||
      "rail and transportation";
    startScreen.style.display = "none"; // Hide the start screen
    quizApp.style.display = "flex"; // Show the quiz interface
    fetchQuizQuestions(topic); // Fetch questions
  });
  let confirmButton = document.getElementById("confirm-btn");
  if (confirmButton) {
    confirmButton.addEventListener("click", confirmAnswer);
  }

  const textarea = document.querySelector(".typing-textarea textarea");
  textarea.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  closeSpan.onclick = () => (modal.style.display = "none");

  let currentGallery = [];
  let currentIndex = 0;

  function updateModalImage(index) {
    modalImg.src = currentGallery[index].src;
    captionText.innerHTML = currentGallery[index].alt || "No caption available";
    currentIndex = index;
  }

  prevButton.onclick = () => {
    if (currentIndex > 0) updateModalImage(currentIndex - 1);
  };

  nextButton.onclick = () => {
    if (currentIndex < currentGallery.length - 1)
      updateModalImage(currentIndex + 1);
  };

  chatContainer.addEventListener("click", (event) => {
    if (event.target && event.target.matches("img.chat-image")) {
      const gallery = Array.from(
        event.target
          .closest(".image-gallery")
          .querySelectorAll("img.chat-image")
      );
      currentGallery = gallery;
      currentIndex = gallery.indexOf(event.target);
      updateModalImage(currentIndex);
      modal.style.display = "block";
    }
  });
});

function fetchQuizQuestions(topic) {
  showTypingAnimation();
  fetch("/ask", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ topic: topic }), // Send the topic as JSON
  })
    .then((response) => response.json())
    .then((data) => {
      removeTypingAnimation();
      if (typeof data === "string") {
        try {
          questions = JSON.parse(data);
        } catch (error) {
          console.error("Error parsing questions:", error);
          return;
        }
      } else {
        questions = data;
      }
      startQuiz(); // Start the quiz
    })
    .catch((error) => {
      removeTypingAnimation();
      console.error("Error:", error);
      questionElement.innerHTML = "Failed to load quiz.";
    });
}

const questionElement = document.getElementById("question");
const answerButtons = document.getElementById("answer-buttons");
const nextButton = document.getElementById("next-btn");
document
  .querySelector(".material-symbols-rounded")
  .addEventListener("click", sendMessage);
let currentQuestion = null;
let currentOptions = null;
let selectedAnswer = null;
let answerConfirmed = false;

function fetchQuestionData() {
  currentQuestion = questions[currentQuestionIndex].question;
  currentOptions = questions[currentQuestionIndex].answers;
}

function sendMessage() {
  const textarea = document.querySelector(".typing-textarea textarea");
  const message = textarea.value.trim();
  textarea.value = "";

  if (message) {
    displayMessage("user", message);
    // 首先调用 /gpt-determine-action 端点
    fetch("/gpt-determine-action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: message }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.type === "image") {
          handleImageSearchCommand(data.keyword);
        } else if (data.type === "video") {
          handleVideoSearchCommand(data.search_query);
        } else {
          let endpoint = answerConfirmed ? "/stream" : "/hint";
          fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: message,
              currentQuestion: currentQuestion,
              options: currentOptions,
            }),
          })
            .then((response) => response.body.getReader())
            .then((reader) => readStream(reader));
        }
      })
      .catch((error) => console.error("Error:", error));
  }
}

function handleImageSearchCommand(query) {
  showImageLoader();
  fetch("/search-images", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: query }),
  })
    .then((response) => response.json())
    .then((data) => {
      removeImageLoader();
      if (data.imageUrls && data.imageUrls.length > 0) {
        displayGeneratedImage(data.imageUrls, query);
      } else {
        updateOrDisplayAssistantMessage("Sorry, no images were found.");
      }
    })
    .catch((error) => {
      console.error("Error:", error);
      removeImageLoader();
      updateOrDisplayAssistantMessage(
        "An error occurred while searching for images."
      );
    });
}

function handleVideoSearchCommand(searchQuery) {
  updateOrDisplayAssistantMessage(
    `Searching for videos related to: ${searchQuery}`
  );
  showImageLoader();
  fetch("/search-video", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: searchQuery }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.videoUrl) {
        removeImageLoader();
        displayYouTubeVideo(
          data.videoTitle,
          data.videoUrl,
          data.timestamp,
          data.explanation
        );
      } else {
        updateOrDisplayAssistantMessage(
          "Sorry, I couldn't find any videos related to your search."
        );
      }
    })
    .catch((error) => {
      console.error("Error:", error);
      updateOrDisplayAssistantMessage("Failed to search for videos.");
    });
}

function displayGeneratedImage(imageUrls, query) {
  updateOrDisplayAssistantMessage(
    "Here is a set of images related to " +
      query +
      ". You can click the image to zoom in."
  );
  const chatContainer = document.querySelector(".chat-container");
  const galleryDiv = document.createElement("div");
  galleryDiv.classList.add("image-gallery");

  imageUrls.forEach((imageUrl) => {
    const imgElement = document.createElement("img");
    imgElement.src = imageUrl;
    imgElement.alt = "Generated content";
    imgElement.classList.add("chat-image");
    galleryDiv.appendChild(imgElement);
  });

  chatContainer.appendChild(galleryDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

let accumulatedText = "";

async function readStream(reader, source) {
  const decoder = new TextDecoder();
  let isFirstChunk = true;
  let completeMessage = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break; // 当读取完毕时退出循环
      }
      let chunk = decoder.decode(value, { stream: true });
      completeMessage += chunk;
      updateOrDisplayAssistantMessage(chunk);
    }
  } catch (error) {
    console.error("Error reading the stream:", error);
  }
  //await playTextAsSpeech(completeMessage);
  completeMessage = ""; // 重置累积的消息
  // 流结束后，重置 isFirstChunk 以便下一个新的回答块
  isFirstChunk = true;
  if (source === "explain") {
    //searchAndDisplayVideo(currentQuestion);
    nextButton.style.display = "block";
  }
}

function searchAndDisplayVideo(query) {
  fetch("/search-video", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: query }),
  })
    .then((response) => response.json())
    .then((data) => {
      displayYouTubeVideo(
        data.videoTitle,
        data.videoUrl,
        data.timestamp,
        data.explanation
      );
    })
    .catch((error) => console.error("Error:", error));
}
function updateOrDisplayAssistantMessage(chunk) {
  const chatContainer = document.querySelector(".chat-container");
  let lastMessage = chatContainer.querySelector(
    ".assistant-message:last-child .message-content"
  );

  if (lastMessage) {
    lastMessage.textContent += chunk; // Append new text chunk to the last assistant message
  } else {
    displayMessage("assistant", chunk); // There is no last assistant message, display a new one
  }

  // Scroll to the bottom of the chat container
  chatContainer.scrollTop = chatContainer.scrollHeight;
}
function displayMessage(sender, message) {
  const chatContainer = document.querySelector(".chat-container");
  const messageDiv = document.createElement("div");
  messageDiv.classList.add("message", sender + "-message");
  const avatarLabelContainer = document.createElement("div");
  avatarLabelContainer.classList.add("avatar-label-container");
  const avatarDiv = document.createElement("div");
  avatarDiv.classList.add("avatar");
  const avatarImg = document.createElement("img");
  avatarImg.src =
    sender === "user"
      ? "/static/images/user.png"
      : "/static/images/assistant.png";
  avatarDiv.appendChild(avatarImg);


  const labelDiv = document.createElement("div");
  labelDiv.classList.add("label");
  labelDiv.textContent = sender === "user" ? "You" : "RailEdu-GPT";

 
  avatarLabelContainer.appendChild(avatarDiv);
  avatarLabelContainer.appendChild(labelDiv);

  // create message div
  const messageContentDiv = document.createElement("div");
  messageContentDiv.classList.add("message-content");
  messageContentDiv.textContent = message;
  messageDiv.appendChild(avatarLabelContainer);
  messageDiv.appendChild(messageContentDiv);
  chatContainer.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}
function displayYouTubeVideo(title, url, timestamp, explanation) {
  if (!url) return;

  const chatContainer = document.querySelector(".chat-container");
  const videoDiv = document.createElement("div");
  videoDiv.classList.add("youtube-video");

  const timestampInSeconds = timestamp
    .split(":")
    .reduce((acc, time) => 60 * acc + +time, 0);

  const description = `Here's a video titled "${title}" that might help you understand the topic better.${explanation} I suggest starting at ${timestamp} which you can directly dive into the most relevant information without needing to watch the entire video.`;

  const videoId = url.split("watch?v=")[1];

  const embedUrl = `https://www.youtube.com/embed/${videoId}?start=${timestampInSeconds}`;

  const videoIframe = document.createElement("iframe");
  videoIframe.src = embedUrl;
  videoIframe.title = `YouTube video: ${title}`;
  videoIframe.frameBorder = "0";
  videoIframe.allow =
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
  videoIframe.allowFullscreen = true;
  videoIframe.style.width = "560px";
  videoIframe.style.height = "315px";

  videoDiv.appendChild(videoIframe);
  chatContainer.appendChild(videoDiv);
  updateOrDisplayAssistantMessage(description);

  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function playTextAsSpeech(text) {
  return new Promise((resolve, reject) => {
    fetch("/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: text }),
    })
      .then((response) => response.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.addEventListener("ended", () => {
          URL.revokeObjectURL(url); // Clean up the URL
          resolve(); // Resolve the promise when audio playback ends
        });
        audio.play();
      })
      .catch((error) => {
        console.error("Error:", error);
        reject(error); // Reject the promise on error
      });
  });
}
let currentQuestionIndex = 0;
let score = 0;

function startQuiz() {
  currentQuestionIndex = 0;
  score = 0;
  nextButton.innerHTML = "Next";
  showQuestion();
}

function showQuestion() {
  resetState();
  answerConfirmed = false;
  fetchQuestionData();
  let currentQuestion = questions[currentQuestionIndex];

  let questionNo = currentQuestionIndex + 1;
  questionElement.innerHTML = questionNo + ". " + currentQuestion.question;

  currentQuestion.answers.forEach((answer) => {
    const button = document.createElement("button");
    button.innerHTML = answer.text;
    button.classList.add("btn");
    answerButtons.appendChild(button);
    if (answer.correct) {
      button.dataset.correct = answer.correct;
    }
    button.addEventListener("click", selectAnswer);
  });
}

function showTypingAnimation() {
  const typingAnimationHtml = `<div class="typing-animation">
                                    <div class="loader"></div>
                                 </div>`;
  const animationContainer = document.getElementById("animation-container");
  animationContainer.innerHTML = typingAnimationHtml;
}

function removeTypingAnimation() {
  const animationContainer = document.getElementById("animation-container");
  animationContainer.innerHTML = "";
}
function showImageLoader() {
  const chatContainer = document.querySelector(".chat-container");
  const loaderHtml = `<div class="image-loader"></div>`;
  chatContainer.insertAdjacentHTML("beforeend", loaderHtml);
}

function removeImageLoader() {
  const imageLoader = document.querySelector(".image-loader");
  if (imageLoader) {
    imageLoader.remove();
  }
}

function resetState() {
  showConfirmButton();
  nextButton.style.display = "none";
  while (answerButtons.firstChild) {
    answerButtons.removeChild(answerButtons.firstChild);
  }
}

let selectedAnswerButton = null;

function selectAnswer(e) {
  console.log("Clicked button:", e.target);
  if (selectedAnswerButton) {
    selectedAnswerButton.classList.remove("selected");
  }
  selectedAnswerButton = e.target;
  selectedAnswerButton.classList.add("selected");

  const confirmButton = document.getElementById("confirm-btn");
  confirmButton.removeAttribute("disabled");
  confirmButton.classList.add("green-btn");
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.className = "toast-message";
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => document.body.removeChild(toast), 500);
    }, 3000);
  }, 100);
}

function confirmAnswer() {
  answerConfirmed = true;

  if (!selectedAnswerButton) {
    console.error("No answer selected");
    showToast("Please select an answer before confirming.");
    return;
  }
  selectedAnswerButton.classList.remove("selected");
  const isCorrect = selectedAnswerButton.dataset.correct === "true";
  if (isCorrect) {
    console.log("correct");
    const correctSound = document.getElementById("correct-sound");
    correctSound.play();
    selectedAnswerButton.classList.add("correct");
    score++;
  } else {
    const incorrectSound = document.getElementById("incorrect-sound");
    incorrectSound.play();
    selectedAnswerButton.classList.add("incorrect");
  }

  Array.from(answerButtons.children).forEach((button) => {
    button.disabled = true;
    if (button.dataset.correct === "true") {
      button.classList.add("correct");
    }
  });

  document.getElementById("confirm-btn").style.display = "none";
  displayMessage("user", selectedAnswerButton.textContent);

  let postData = {
    currentQuestion: currentQuestion,
    selectedOption: selectedAnswerButton.textContent,
    isCorrect: isCorrect,
    options: currentOptions,
  };
  showToast("Feedback generating ...");

  fetch("/explain", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(postData),
  })
    .then((response) => {
      const reader = response.body.getReader();
      readStream(reader, "explain");
    })
    .catch((error) => console.error("Error:", error));
}

function showConfirmButton() {
  let confirmButton = document.getElementById("confirm-btn");
  if (!confirmButton) {
    confirmButton = document.createElement("button");
    confirmButton.id = "confirm-btn";
    confirmButton.textContent = "Confirm";
    confirmButton.classList.add("btn");
    document.querySelector(".quiz-container").appendChild(confirmButton);
  }
  confirmButton.style.display = "block";
  confirmButton.disabled = true;
  console.log("Confirm button should be visible now");
  confirmButton.addEventListener("click", confirmAnswer);
}

function showScore() {
  resetState();
  questionElement.innerHTML = `You scored ${score} out of ${questions.length}!`;

  // Create a button to return to the main menu
  const quizApp = document.getElementById("quiz-app");
  const startScreen = document.getElementById("start-screen");
  const backButton = document.createElement("button");
  backButton.innerHTML = "Try Again";
  backButton.classList.add("btn");
  backButton.addEventListener("click", () => {
    questionElement.innerHTML = "Generating new quiz";
    location.reload();
    // Switch views
    quizApp.style.display = "none";
    startScreen.style.display = "block";

    // Reset state
    currentQuestionIndex = 0;
    score = 0;
    resetState();
  });

  // Add the back button to the interface
  answerButtons.appendChild(backButton);
  //nextButton.innerHTML = "Play Again";
  //nextButton.style.display = "block";
}

function handleNextButton() {
  currentQuestionIndex++;
  if (currentQuestionIndex < questions.length) {
    showQuestion();
  } else {
    showScore();
  }
}

nextButton.addEventListener("click", () => {
  if (currentQuestionIndex < questions.length) {
    handleNextButton();
  } else {
    startQuiz();
  }
});

startQuiz();
