// Tab functionality
function showTab(tabName) {
    document.querySelectorAll(".panel-section").forEach(panel => {
        panel.style.display = "none";
    });
    document.querySelectorAll(".tab-button").forEach(button => {
        button.classList.remove("active");
    });
    document.getElementById(tabName).style.display = "block";
    document.querySelector(`.tab-button[data-tab="${tabName}"]`).classList.add("active");
}

// Task and Reminder functions
function addTask() {
    const taskInput = document.getElementById("task-input");
    const taskList = document.getElementById("task-list");

    if (taskInput.value.trim()) {
        const li = document.createElement("li");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        const span = document.createElement("span");
        span.textContent = taskInput.value.trim();
        const deleteButton = document.createElement("button");
        deleteButton.textContent = "🗑️";
        deleteButton.onclick = () => taskList.removeChild(li);

        li.appendChild(checkbox);
        li.appendChild(span);
        li.appendChild(deleteButton);
        taskList.appendChild(li);

        taskInput.value = "";
        
        // If user is signed in, save task to their account
        if (window.Clerk && window.Clerk.user) {
            saveUserTask(span.textContent);
        }
    }
}

function addReminder() {
    const reminderInput = document.getElementById("reminder-input");
    const reminderList = document.getElementById("reminder-list");

    if (reminderInput.value.trim()) {
        const li = document.createElement("li");
        li.textContent = reminderInput.value.trim();
        reminderList.appendChild(li);
        reminderInput.value = "";
        
        // If user is signed in, save reminder to their account
        if (window.Clerk && window.Clerk.user) {
            saveUserReminder(li.textContent);
        }
    }
}

// Clerk Authentication Functions
async function initializeClerk() {
    try {
        // Initialize Clerk with your publishable key
        await window.Clerk.load({
            // The key is now loaded from the script tag in index.html
        });
        
        // Set up auth state change listener
        window.Clerk.addListener(({ user }) => {
            updateUIForAuthState(!!user);
            if (user) {
                loadUserData();
            }
        });
        
        // Check initial auth state
        if (window.Clerk.user) {
            updateUIForAuthState(true);
            loadUserData();
        } else {
            updateUIForAuthState(false);
        }
        
    } catch (error) {
        console.error("Error initializing Clerk:", error);
        addMessage("Nova X", "⚠️ Authentication service initialization failed.", "ai-message");
    }
}

function updateUIForAuthState(isSignedIn) {
    const authButton = document.getElementById("auth-button");
    const userProfileButton = document.getElementById("user-profile-button");
    const welcomeMessage = document.getElementById("welcome-message");
    
    if (isSignedIn && window.Clerk.user) {
        // User is signed in
        authButton.textContent = "Sign Out";
        authButton.onclick = () => window.Clerk.signOut();
        
        userProfileButton.style.display = "block";
        userProfileButton.innerHTML = `<img src="${window.Clerk.user.imageUrl}" alt="Profile" />`;
        
        // Set welcome message
        const firstName = window.Clerk.user.firstName || "User";
        welcomeMessage.textContent = `Welcome, ${firstName}!`;
        welcomeMessage.style.display = "block";
        
    } else {
        // User is signed out
        authButton.textContent = "Sign In";
        authButton.onclick = showSignInModal;
        
        userProfileButton.style.display = "none";
        welcomeMessage.style.display = "none";
    }
}

function showSignInModal() {
    // Open Clerk's sign-in modal
    window.Clerk.openSignIn({
        appearance: {
            elements: {
                rootBox: "rounded-lg border border-gray-400 shadow-lg",
                card: "bg-black text-white",
                formButtonPrimary: "bg-white text-black hover:bg-gray-200"
            }
        }
    });
}

async function loadUserData() {
    if (!window.Clerk.user) return;
    
    try {
        // Get user session token for API calls
        const token = await window.Clerk.session.getToken();
        
        // Load user tasks and reminders
        await Promise.all([
            fetchUserTasks(token),
            fetchUserReminders(token)
        ]);
        
        // Note: In a real app, we'd call the backend to get user data
        // For this demo, we'll simulate with a welcome message
        addMessage("Nova X", `Welcome back, ${window.Clerk.user.firstName || "friend"}! Your personal settings and history have been loaded.`, "ai-message");
    } catch (error) {
        console.error("Error loading user data:", error);
    }
}

async function fetchUserTasks(token) {
    // In a real app, this would be an API call to your backend
    // For this demo, we'll simulate with localStorage
    const userId = window.Clerk.user.id;
    const tasks = JSON.parse(localStorage.getItem(`tasks_${userId}`) || '[]');
    
    const taskList = document.getElementById("task-list");
    taskList.innerHTML = ''; // Clear existing tasks
    
    tasks.forEach(task => {
        const li = document.createElement("li");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        const span = document.createElement("span");
        span.textContent = task;
        const deleteButton = document.createElement("button");
        deleteButton.textContent = "🗑️";
        deleteButton.onclick = () => {
            taskList.removeChild(li);
            removeUserTask(task);
        };

        li.appendChild(checkbox);
        li.appendChild(span);
        li.appendChild(deleteButton);
        taskList.appendChild(li);
    });
}

async function fetchUserReminders(token) {
    // In a real app, this would be an API call to your backend
    // For this demo, we'll simulate with localStorage
    const userId = window.Clerk.user.id;
    const reminders = JSON.parse(localStorage.getItem(`reminders_${userId}`) || '[]');
    
    const reminderList = document.getElementById("reminder-list");
    reminderList.innerHTML = ''; // Clear existing reminders
    
    reminders.forEach(reminder => {
        const li = document.createElement("li");
        li.textContent = reminder;
        reminderList.appendChild(li);
    });
}

function saveUserTask(task) {
    if (!window.Clerk.user) return;
    
    const userId = window.Clerk.user.id;
    const tasks = JSON.parse(localStorage.getItem(`tasks_${userId}`) || '[]');
    tasks.push(task);
    localStorage.setItem(`tasks_${userId}`, JSON.stringify(tasks));
    
    // In a real app, you would send this to your backend API
    // Example: saveTaskToBackend(task, token);
}

function removeUserTask(task) {
    if (!window.Clerk.user) return;
    
    const userId = window.Clerk.user.id;
    let tasks = JSON.parse(localStorage.getItem(`tasks_${userId}`) || '[]');
    tasks = tasks.filter(t => t !== task);
    localStorage.setItem(`tasks_${userId}`, JSON.stringify(tasks));
    
    // In a real app, you would send this to your backend API
    // Example: deleteTaskFromBackend(task, token);
}

function saveUserReminder(reminder) {
    if (!window.Clerk.user) return;
    
    const userId = window.Clerk.user.id;
    const reminders = JSON.parse(localStorage.getItem(`reminders_${userId}`) || '[]');
    reminders.push(reminder);
    localStorage.setItem(`reminders_${userId}`, JSON.stringify(reminders));
    
    // In a real app, you would send this to your backend API
    // Example: saveReminderToBackend(reminder, token);
}

// Add authentication header to fetch requests
async function authenticatedFetch(url, options = {}) {
    if (!window.Clerk || !window.Clerk.session) {
        return fetch(url, options);
    }
    
    try {
        const token = await window.Clerk.session.getToken();
        const headers = {
            ...options.headers,
            Authorization: `Bearer ${token}`
        };
        
        return fetch(url, { ...options, headers });
    } catch (error) {
        console.error("Error getting authentication token:", error);
        return fetch(url, options);
    }
}

// Chat functionality
document.addEventListener("DOMContentLoaded", () => {
    const userInput = document.getElementById("user-input");
    const chatBox = document.getElementById("chat-box");
    const sendButton = document.getElementById("send-button");
    const micButton = document.getElementById("mic-button");
    const waveform = document.getElementById("waveform");

    // Initialize Clerk if the script is loaded
    if (window.Clerk) {
        initializeClerk();
    } else {
        // If script is loaded asynchronously, wait for it
        document.addEventListener('clerkReady', initializeClerk);
    }

    // Speech recognition setup
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.warn("Speech recognition not supported in this browser");
        micButton.style.display = "none";
    } else {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = "en-US";
        let isRecording = false;

        micButton.addEventListener("click", () => {
            if (isRecording) {
                recognition.stop();
            } else {
                try {
                    recognition.start();
                } catch (e) {
                    addMessage("Nova X", "⚠️ Couldn't start microphone. Please check permissions.", "ai-message");
                }
            }
            isRecording = !isRecording;
            micButton.classList.toggle("active", isRecording);
            waveform.style.display = isRecording ? "flex" : "none";
        });

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            userInput.value = transcript;
            stopRecordingUI();
            sendMessage();
        };

        recognition.onspeechend = stopRecordingUI;
        recognition.onerror = (event) => {
            addMessage("Nova X", `⚠️ Speech recognition error: ${event.error}`, "ai-message");
            stopRecordingUI();
        };

        function stopRecordingUI() {
            isRecording = false;
            micButton.classList.remove("active");
            waveform.style.display = "none";
        }
    }

    // Message sending
    sendButton.addEventListener("click", sendMessage);
    userInput.addEventListener("keypress", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            sendMessage();
        }
    });

    async function sendMessage() {
        const message = userInput.value.trim();
        if (!message) return;

        addMessage("You", message, "user-message");
        userInput.value = "";

        const loader = document.createElement("div");
        loader.classList.add("typing-indicator");
        loader.innerHTML = "<span></span><span></span><span></span>";
        chatBox.appendChild(loader);
        chatBox.scrollTop = chatBox.scrollHeight;

        const lowerCaseMessage = message.toLowerCase();

        // Command handling
        if (lowerCaseMessage.startsWith("search ")) {
            const searchQuery = lowerCaseMessage.replace(/^search /i, '');
            await handleSearch(searchQuery);
            chatBox.removeChild(loader);
            return;
        }

        if (lowerCaseMessage.includes("news in")) {
            const country = lowerCaseMessage.replace("news in", "").trim();
            await fetchNewsByCountry(country);
            chatBox.removeChild(loader);
            return;
        }

        if (lowerCaseMessage.includes("news about")) {
            const topic = lowerCaseMessage.replace("news about", "").trim();
            await fetchNewsByTopic(topic);
            chatBox.removeChild(loader);
            return;
        }

        if (lowerCaseMessage.includes("weather in")) {
            const city = lowerCaseMessage.replace("weather in", "").trim();
            await getWeatherByCity(city);
            chatBox.removeChild(loader);
            return;
        }

        if (lowerCaseMessage.includes("weather") || lowerCaseMessage.includes("temperature")) {
            getLocation();
            chatBox.removeChild(loader);
            return;
        }

        // Default chat handling
        try {
            // Use authenticatedFetch to include auth token if available
            const response = await authenticatedFetch("/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: message }),
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            chatBox.removeChild(loader);
            addMessage("Nova X", data.response, "ai-message");
        } catch (error) {
            chatBox.removeChild(loader);
            addMessage("Nova X", `⚠️ Error getting response: ${error.message}`, "ai-message");
        }
    }

    // Helper functions
    function addMessage(sender, text, className = "ai-message") {
        const msg = document.createElement("div");
        msg.classList.add("message", className);
        msg.innerHTML = `<strong>${sender}:</strong> ${text.replace(/\n/g, "<br>")}`;
        chatBox.appendChild(msg);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // API functions - now using authenticatedFetch
    async function handleSearch(query) {
        try {
            const response = await authenticatedFetch('/search-web', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.error) {
                addMessage("Nova X", `⚠️ ${data.error}`, "ai-message");
                return;
            }

            addMessage("Nova X", "🔎 Search Results:", "ai-message");
            
            if (Array.isArray(data.results)) {
                data.results.forEach(result => {
                    if (typeof result === 'string') {
                        addMessage("Nova X", result, "ai-message");
                    } else {
                        const url = unwrapDuckDuckGoURL(result.url);
                        addMessage("Nova X", 
                            `<a href="${url}" target="_blank"><strong>${result.title}</strong></a>`, 
                            "ai-message");
                    }
                });
            } else {
                addMessage("Nova X", "No results found", "ai-message");
            }
        } catch (error) {
            addMessage("Nova X", `⚠️ Search failed: ${error.message}`, "ai-message");
        }
    }

    function unwrapDuckDuckGoURL(wrappedUrl) {
        const match = wrappedUrl.match(/uddg=([^&]+)/);
        return match ? decodeURIComponent(match[1]) : wrappedUrl;
    }

    async function fetchNewsByCountry(country) {
        try {
            const response = await authenticatedFetch(`/news/country?country=${encodeURIComponent(country)}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.error) {
                addMessage("Nova X", `⚠️ ${data.error}`, "ai-message");
            } else {
                addMessage("Nova X", `📰 News in ${country}:\n${data.response}`, "ai-message");
            }
        } catch (error) {
            addMessage("Nova X", `⚠️ Error getting news: ${error.message}`, "ai-message");
        }
    }

    async function fetchNewsByTopic(topic) {
        try {
            const response = await authenticatedFetch(`/news/topic?topic=${encodeURIComponent(topic)}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.error) {
                addMessage("Nova X", `⚠️ ${data.error}`, "ai-message");
            } else {
                addMessage("Nova X", `🗞️ News about ${topic}:\n${data.response}`, "ai-message");
            }
        } catch (error) {
            addMessage("Nova X", `⚠️ Error getting news: ${error.message}`, "ai-message");
        }
    }

    function getLocation() {
        if (!navigator.geolocation) {
            addMessage("Nova X", "⚠️ Geolocation is not supported by your browser", "ai-message");
            return;
        }
        
        navigator.geolocation.getCurrentPosition(
            pos => getWeather(pos.coords.latitude, pos.coords.longitude),
            () => addMessage("Nova X", "⚠️ Location access denied or failed", "ai-message")
        );
    }

    async function getWeather(lat, lon) {
        try {
            const response = await authenticatedFetch(`/weather?city=${lat},${lon}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.error) {
                addMessage("Nova X", `⚠️ ${data.error}`, "ai-message");
            } else {
                addMessage("Nova X", 
                    `🌤️ Weather in ${data.location}: ${data.condition}, ${data.temp_c}°C (${data.temp_f}°F)`, 
                    "ai-message");
            }
        } catch (error) {
            addMessage("Nova X", `⚠️ Error getting weather: ${error.message}`, "ai-message");
        }
    }

    async function getWeatherByCity(city) {
        try {
            const response = await authenticatedFetch(`/weather?city=${encodeURIComponent(city)}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.error) {
                addMessage("Nova X", `⚠️ ${data.error}`, "ai-message");
            } else {
                addMessage("Nova X", 
                    `🌤️ Weather in ${data.location}: ${data.condition}, ${data.temp_c}°C (${data.temp_f}°F)`, 
                    "ai-message");
            }
        } catch (error) {
            addMessage("Nova X", `⚠️ Error getting weather: ${error.message}`, "ai-message");
        }
    }

    // File upload handling
    const attachmentBtn = document.getElementById('attachment-btn');
    const modal = document.getElementById('upload-modal');
    const pdfOption = document.getElementById('pdf-option');
    const imageOption = document.getElementById('image-option');

    attachmentBtn.addEventListener('click', () => {
        modal.style.display = 'block';
    });

    pdfOption.addEventListener('click', () => {
        modal.style.display = 'none';
        document.getElementById('pdf-input').click();
    });

    imageOption.addEventListener('click', () => {
        modal.style.display = 'none';
        document.getElementById('image-input').click();
    });

    document.getElementById('pdf-input').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        addMessage('You', `Uploaded PDF: ${file.name}`, 'user-message');
        
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await authenticatedFetch('/analyze-pdf', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result.error) {
                addMessage('Nova X', `❌ Error: ${result.error}`, 'ai-message');
            } else {
                const summary = result.text.length > 500 
                    ? `${result.text.substring(0, 500)}... [truncated]` 
                    : result.text;
                addMessage('Nova X', `📄 PDF Analysis (${result.page_count || '?'} pages):\n${summary}`, 'ai-message');
            }
        } catch (error) {
            addMessage('Nova X', `❌ Failed to process PDF: ${error.message}`, 'ai-message');
        }
    });

    document.getElementById('image-input').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        addMessage('You', `Uploaded image: ${file.name}`, 'user-message');
        
        const formData = new FormData();
        formData.append('image', file);

        try {
            const response = await authenticatedFetch('/analyze-image', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result.error) {
                addMessage('Nova X', `Error: ${result.error}`, 'ai-message');
            } else {
                const summary = result.text || "No text could be extracted from the image";
                addMessage('Nova X', `Image Analysis:\n${summary}`, 'ai-message');
            }
        } catch (error) {
            addMessage('Nova X', `Failed to process image: ${error.message}`, 'ai-message');
        }
    });

    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    // Panel controls
    document.getElementById("help-button").addEventListener("click", () => {
        const panel = document.getElementById("help-panel");
        panel.style.display = panel.style.display === "block" ? "none" : "block";
    });

    document.getElementById("todo-panel-toggle").addEventListener("click", () => {
        document.getElementById("assistant-panel").style.display = "block";
    });

    document.getElementById("close-assistant").addEventListener("click", () => {
        document.getElementById("assistant-panel").style.display = "none";
    });

    document.querySelectorAll(".tab-button").forEach(button => {
        button.addEventListener("click", () => {
            showTab(button.dataset.tab);
        });
    });

    document.getElementById("add-task").addEventListener("click", addTask);
    document.getElementById("add-reminder").addEventListener("click", addReminder);
});