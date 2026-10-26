(function () {
    "use strict";

    /*
     * =========================================
     * SETTINGS
     * =========================================
     */

    // A live card disappears if the streamer hasn't "checked in" for this long.
    const LIVE_TIMEOUT_MS = 180000;
    const HEARTBEAT_MS = 20000;
    const LIVE_REFRESH_MS = 15000;
    const MAX_VIEWERS = 8;
    const PEER_PREFIX = "clipfly-live-";

    // Each viewer gets at most this much video (helps far-away viewers).
    const MAX_VIDEO_BITRATE = 2000000;

    const MIC_KEY = "clipfly_mic_device";

    // Routes used to connect streamers and viewers. If you add your own
    // relay in the Supabase "app_settings" table, it is used too.
    const DEFAULT_ICE_SERVERS = [
        {
            urls: [
                "stun:stun.l.google.com:19302",
                "stun:stun1.l.google.com:19302"
            ]
        },
        { urls: "stun:stun.cloudflare.com:3478" },
        {
            urls: [
                "turn:eu-0.turn.peerjs.com:3478",
                "turn:us-0.turn.peerjs.com:3478"
            ],
            username: "peerjs",
            credential: "peerjsp"
        },
        {
            urls: [
                "turn:openrelay.metered.ca:80",
                "turn:openrelay.metered.ca:443",
                "turns:openrelay.metered.ca:443?transport=tcp"
            ],
            username: "openrelayproject",
            credential: "openrelayproject"
        }
    ];

    /*
     * =========================================
     * STATE
     * =========================================
     */

    // Streamer
    let liveStream = null;        // what viewers receive (video + mixed sound)
    let displayStream = null;     // the raw screen / tab capture
    let mediaRecorder = null;
    let recordedChunks = [];
    let liveRecordingBlob = null;
    let liveTitle = "";
    let liveThumbnailFile = null;
    let liveThumbnailUrl = null;
    let uploadedThumbFile = null;
    let liveMode = "screen";
    let liveVideo = null;

    let liveRowId = null;
    let heartbeatTimer = null;
    let hostPeer = null;
    let hostChat = null;
    let hostChatBox = null;
    let hostChatInput = null;
    let liveNote = "";
    const viewerLinks = new Map();

    // Microphone mixing
    let audioCtx = null;
    let mixDest = null;
    let displayGain = null;
    let displaySrc = null;
    let micGain = null;
    let micSrc = null;
    let micStream = null;
    let micOn = false;
    let micDeviceId = "";

    try {
        micDeviceId = localStorage.getItem(MIC_KEY) || "";
    } catch (error) {
        micDeviceId = "";
    }

    // Chat pop-out window
    let popout = null;

    // Home tab
    let liveNowTimer = null;
    let liveNowRefreshing = false;

    // Viewer
    let viewerSession = null;

    let lastChatAt = 0;
    let iceServersPromise = null;

    function $(id) {
        return document.getElementById(id);
    }

    function notify(title, text, icon) {
        if (typeof window.showMessage === "function") {
            window.showMessage(title, text, icon || "ℹ️");
        } else {
            alert(title + "\n\n" + text);
        }
    }

    /*
     * =========================================
     * AUTHENTICATION
     * =========================================
     */

    async function getLoggedInUser() {
        if (!window.supabaseClient || !window.supabaseClient.auth) {
            console.error("Supabase authentication is not available.");
            return null;
        }

        try {
            const result = await window.supabaseClient.auth.getUser();

            if (result.error) {
                console.error("Supabase auth error:", result.error);
                return null;
            }

            return (result.data && result.data.user) || null;

        } catch (error) {
            console.error("Could not check authenticated user:", error);
            return null;
        }
    }

    async function requireLogin() {
        const user = await getLoggedInUser();

        if (user) {
            return user;
        }

        alert("You must be logged in to use Clipfly Live.");

        if (typeof window.openAccount === "function") {
            window.openAccount();
        }

        return null;
    }

    /*
     * =========================================
     * CONNECTION ROUTES (STUN / TURN)
     * =========================================
     */

    function loadIceServers() {
        if (!iceServersPromise) {
            iceServersPromise = (async function () {
                let custom = [];

                try {
                    if (window.supabaseClient) {
                        const result = await window.supabaseClient
                            .from("app_settings")
                            .select("value")
                            .eq("key", "ice_servers")
                            .maybeSingle();

                        if (
                            !result.error &&
                            result.data &&
                            Array.isArray(result.data.value)
                        ) {
                            custom = result.data.value.filter(function (server) {
                                return server && server.urls;
                            });
                        }
                    }

                } catch (error) {
                    console.warn("Could not load relay settings:", error);
                }

                return {
                    servers: custom.concat(DEFAULT_ICE_SERVERS),
                    hasCustom: custom.length > 0
                };
            })();
        }

        return iceServersPromise;
    }

    /*
     * =========================================
     * LIVE CHAT (shared by streamer and viewers)
     * Uses Supabase Realtime broadcast.
     * =========================================
     */

    function appendChat(container, name, text, system) {
        if (!container) {
            return;
        }

        const row = document.createElement("div");
        row.style.marginBottom = "8px";
        row.style.overflowWrap = "anywhere";

        if (system) {
            row.style.opacity = "0.7";
            row.textContent = text;
        } else {
            const strong = document.createElement("strong");
            strong.textContent = name + ": ";
            row.appendChild(strong);
            row.appendChild(document.createTextNode(text));
        }

        container.appendChild(row);

        while (container.children.length > 200) {
            container.removeChild(container.firstChild);
        }

        container.scrollTop = container.scrollHeight;
    }

    // getTargets returns every chat box that should show the message
    // (the normal chat box, plus the pop-out window when it's open).
    function appendToAll(getTargets, name, text, system) {
        getTargets().forEach(function (container) {
            appendChat(container, name, text, system);
        });
    }

    function joinChat(liveId, getTargets) {
        const client = window.supabaseClient;

        if (!client || typeof client.channel !== "function") {
            return null;
        }

        try {
            const channel = client.channel(
                "clipfly-live-chat-" + liveId,
                { config: { broadcast: { self: true } } }
            );

            channel.on(
                "broadcast",
                { event: "chat" },
                function (message) {
                    const payload = (message && message.payload) || {};

                    appendToAll(
                        getTargets,
                        String(payload.name || "User").slice(0, 40),
                        String(payload.text || "").slice(0, 300),
                        false
                    );
                }
            );

            channel.subscribe();

            return channel;

        } catch (error) {
            console.warn("Could not join live chat:", error);
            return null;
        }
    }

    function leaveChat(channel) {
        if (!channel || !window.supabaseClient) {
            return;
        }

        try {
            window.supabaseClient.removeChannel(channel);
        } catch (error) {
            console.warn("Could not leave live chat:", error);
        }
    }

    async function sendChatTo(channel, getTargets, input) {
        if (!input) {
            return;
        }

        const text = input.value.trim().slice(0, 300);

        if (!text) {
            return;
        }

        if (Date.now() - lastChatAt < 800) {
            return;
        }

        const user = await getLoggedInUser();

        if (!user) {
            appendToAll(
                getTargets,
                "",
                "Log in (Account button) to chat.",
                true
            );

            return;
        }

        lastChatAt = Date.now();

        const name =
            (user.user_metadata && user.user_metadata.username) ||
            "User";

        input.value = "";

        if (channel) {
            try {
                const result = await channel.send({
                    type: "broadcast",
                    event: "chat",
                    payload: { name: name, text: text }
                });

                if (result && result !== "ok") {
                    appendToAll(getTargets, name, text, false);
                }

            } catch (error) {
                appendToAll(getTargets, name, text, false);
            }

        } else {
            appendToAll(getTargets, name, text, false);
        }

        input.focus();
    }

    function hostChatTargets() {
        const list = [];

        if (hostChatBox) {
            list.push(hostChatBox);
        }

        if (popout && popout.box) {
            list.push(popout.box);
        }

        return list;
    }

    function sendLiveChat() {
        sendChatTo(
            hostChat,
            hostChatTargets,
            hostChatInput || $("liveChatInput")
        );
    }

    /*
     * =========================================
     * OPEN LIVE SETUP
     * =========================================
     */

    async function openLiveSetup() {
        const popup = $("liveSetupPopup");

        if (!popup) {
            alert("Clipfly Live could not load. Make sure live.js is connected.");
            return;
        }

        if (liveStream) {
            showLiveWindow();
            return;
        }

        const user = await requireLogin();

        if (!user) {
            return;
        }

        popup.style.display = "flex";

        const title = $("liveTitleInput");

        if (title) {
            title.focus();
        }
    }

    function closeLiveSetup() {
        const popup = $("liveSetupPopup");

        if (popup) {
            popup.style.display = "none";
        }
    }

    /*
     * =========================================
     * LIVE MODE
     * =========================================
     */

    function setLiveMode(mode) {
        liveMode = mode;

        const screenButton = $("liveScreenButton");
        const tabButton = $("liveTabButton");

        if (screenButton) {
            screenButton.className =
                mode === "screen" ? "blue-button" : "dark-button";
        }

        if (tabButton) {
            tabButton.className =
                mode === "tab" ? "blue-button" : "dark-button";
        }

        const status = $("liveSetupStatus");

        if (status) {
            status.textContent =
                mode === "screen"
                    ? "You will share your entire screen."
                    : "You will share a browser tab.";
        }
    }

    /*
     * =========================================
     * THUMBNAILS
     * =========================================
     */

    function showThumbPreview(preview, file) {
        if (!preview) {
            return;
        }

        if (!file) {
            preview.innerHTML = "<span>🖼️ Thumbnail preview</span>";
            return;
        }

        const img = document.createElement("img");

        img.src = URL.createObjectURL(file);
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";

        preview.innerHTML = "";
        preview.appendChild(img);
    }

    function previewLiveThumbnail() {
        const input = $("liveThumbnailInput");

        if (!input) {
            return;
        }

        const file = (input.files && input.files[0]) || null;

        liveThumbnailFile = file;

        showThumbPreview($("liveThumbnailPreview"), file);
    }

    function previewChangeLiveThumbnail() {
        const input = $("changeLiveThumbnailInput");

        if (!input) {
            return;
        }

        const file = (input.files && input.files[0]) || null;

        if (file) {
            liveThumbnailFile = file;
        }

        showThumbPreview($("changeLiveThumbnailPreview"), file);
    }

    async function uploadLiveThumbnail(user, file) {
        if (!file || !user || !window.supabaseClient) {
            return null;
        }

        try {
            const extension =
                (file.name.split(".").pop() || "jpg").toLowerCase();

            const path =
                user.id +
                "/live-" +
                Date.now() +
                "-" +
                Math.random().toString(36).substring(2, 10) +
                "." +
                extension;

            const upload =
                await window.supabaseClient
                    .storage
                    .from("thumbnails")
                    .upload(path, file, {
                        cacheControl: "3600",
                        contentType: file.type || "image/jpeg",
                        upsert: false
                    });

            if (upload.error) {
                throw upload.error;
            }

            const result =
                window.supabaseClient
                    .storage
                    .from("thumbnails")
                    .getPublicUrl(path);

            return (result && result.data && result.data.publicUrl) || null;

        } catch (error) {
            console.warn("Could not upload live thumbnail:", error);
            return null;
        }
    }

    /*
     * =========================================
     * SCREEN CAPTURE
     * =========================================
     */

    async function getDisplayStream() {
        if (
            !navigator.mediaDevices ||
            !navigator.mediaDevices.getDisplayMedia
        ) {
            throw new Error("Your browser does not support screen sharing.");
        }

        // 1080p / 30 fps keeps the stream light for far-away viewers.
        return await navigator.mediaDevices.getDisplayMedia({
            video: {
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30, max: 30 }
            },
            audio: true
        });
    }

    function watchDisplayEnd(display) {
        const track = display.getVideoTracks()[0];

        if (!track) {
            return;
        }

        track.addEventListener("ended", function () {
            if (displayStream === display) {
                endLive();
            }
        });
    }

    /*
     * =========================================
     * SOUND MIXER (screen sound + microphone)
     * =========================================
     */

    // Returns the single mixed sound track that viewers (and the recording)
    // always get, or null if this browser can't mix sound.
    function setupMixer(display) {
        teardownMixer();

        const Ctx = window.AudioContext || window.webkitAudioContext;

        if (!Ctx) {
            return null;
        }

        try {
            audioCtx = new Ctx();
            mixDest = audioCtx.createMediaStreamDestination();

            displayGain = audioCtx.createGain();
            displayGain.gain.value = 1;
            displayGain.connect(mixDest);

            micGain = audioCtx.createGain();
            micGain.gain.value = 1;
            micGain.connect(mixDest);

            connectDisplayAudio(display);

            if (audioCtx.state === "suspended") {
                audioCtx.resume().catch(function () {});
            }

            return mixDest.stream.getAudioTracks()[0] || null;

        } catch (error) {
            console.warn("Could not start the sound mixer:", error);

            teardownMixer();

            return null;
        }
    }

    function connectDisplayAudio(display) {
        if (displaySrc) {
            try {
                displaySrc.disconnect();
            } catch (error) {
                console.warn(error);
            }

            displaySrc = null;
        }

        if (!audioCtx || !display) {
            return;
        }

        const tracks = display.getAudioTracks();

        if (tracks.length === 0) {
            return;
        }

        try {
            displaySrc = audioCtx.createMediaStreamSource(new MediaStream(tracks));
            displaySrc.connect(displayGain);
        } catch (error) {
            console.warn("Could not connect the shared sound:", error);
        }
    }

    function teardownMixer() {
        [displaySrc, micSrc, displayGain, micGain].forEach(function (node) {
            if (node) {
                try {
                    node.disconnect();
                } catch (error) {
                    console.warn(error);
                }
            }
        });

        displaySrc = null;
        micSrc = null;
        displayGain = null;
        micGain = null;
        mixDest = null;

        if (audioCtx) {
            try {
                audioCtx.close();
            } catch (error) {
                console.warn(error);
            }

            audioCtx = null;
        }
    }

    /*
     * =========================================
     * MICROPHONE
     * =========================================
     */

    async function listMicrophones() {
        if (
            !navigator.mediaDevices ||
            !navigator.mediaDevices.enumerateDevices
        ) {
            return [];
        }

        const devices = await navigator.mediaDevices.enumerateDevices();

        return devices.filter(function (device) {
            return device.kind === "audioinput";
        });
    }

    function setMicNote(text, isError) {
        const note = $("clipflyMicNote");

        if (!note) {
            return;
        }

        note.textContent = text || "";
        note.style.color = isError ? "#f87171" : "#9999a5";
    }

    function updateMicUI() {
        const toggle = $("clipflyMicToggle");

        if (toggle) {
            toggle.textContent = micOn
                ? "🎤 Mic is ON (click to turn off)"
                : "🔇 Mic is OFF (click to turn on)";

            toggle.className = micOn ? "blue-button" : "dark-button";
        }

        const barButton = $("clipflyBarMic");

        if (barButton) {
            barButton.textContent = micOn ? "🎤 Mic on" : "🔇 Mic off";
        }

        updateLiveStatus();
    }

    async function refreshMicDevices() {
        const select = $("clipflyMicSelect");

        if (!select) {
            return;
        }

        let devices = [];

        try {
            devices = await listMicrophones();
        } catch (error) {
            console.warn("Could not list microphones:", error);
        }

        select.innerHTML = "";

        if (devices.length === 0) {
            const option = document.createElement("option");

            option.value = "";
            option.textContent = "Default microphone";

            select.appendChild(option);

            return;
        }

        devices.forEach(function (device, index) {
            const option = document.createElement("option");

            option.value = device.deviceId;
            option.textContent = device.label || "Microphone " + (index + 1);

            select.appendChild(option);
        });

        if (
            micDeviceId &&
            devices.some(function (device) {
                return device.deviceId === micDeviceId;
            })
        ) {
            select.value = micDeviceId;
        }
    }

    function stopMicStream() {
        if (micSrc) {
            try {
                micSrc.disconnect();
            } catch (error) {
                console.warn(error);
            }

            micSrc = null;
        }

        if (micStream) {
            micStream.getTracks().forEach(function (track) {
                track.stop();
            });

            micStream = null;
        }
    }

    function handleMicError(error) {
        console.warn("Microphone problem:", error);

        stopMicStream();

        micOn = false;

        updateMicUI();

        let text =
            (error && error.message) || "Could not start the microphone.";

        if (
            error &&
            (error.name === "NotAllowedError" || error.name === "SecurityError")
        ) {
            text =
                "Your browser blocked the microphone. Click the lock icon in the address bar and allow the microphone for Clipfly.";

        } else if (error && error.name === "NotFoundError") {
            text = "No microphone was found. Plug one in and try again.";

        } else if (error && error.name === "NotReadableError") {
            text =
                "Another app is using that microphone. Close it, or pick a different microphone.";
        }

        setMicNote(text, true);
    }

    async function enableMic() {
        if (!audioCtx || !micGain || !liveStream) {
            throw new Error("Microphone can only be used while you're live.");
        }

        if (audioCtx.state === "suspended") {
            await audioCtx.resume();
        }

        stopMicStream();

        const audio = {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        };

        if (micDeviceId) {
            audio.deviceId = { exact: micDeviceId };
        }

        let stream;

        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: audio });

        } catch (error) {
            // The remembered microphone may be unplugged: use the default.
            if (
                micDeviceId &&
                error &&
                (error.name === "OverconstrainedError" ||
                    error.name === "NotFoundError")
            ) {
                micDeviceId = "";

                delete audio.deviceId;

                stream = await navigator.mediaDevices.getUserMedia({ audio: audio });

            } else {
                throw error;
            }
        }

        micStream = stream;

        micSrc = audioCtx.createMediaStreamSource(stream);
        micSrc.connect(micGain);

        micOn = true;

        const track = stream.getAudioTracks()[0];

        if (track) {
            const settings = track.getSettings ? track.getSettings() : null;

            if (settings && settings.deviceId) {
                micDeviceId = settings.deviceId;

                try {
                    localStorage.setItem(MIC_KEY, micDeviceId);
                } catch (error) {
                    console.warn(error);
                }
            }

            track.addEventListener("ended", function () {
                if (micStream === stream) {
                    stopMicStream();

                    micOn = false;

                    updateMicUI();

                    setMicNote("Your microphone was disconnected.", true);
                }
            });
        }

        updateMicUI();
    }

    function disableMic() {
        stopMicStream();

        micOn = false;

        updateMicUI();
    }

    async function toggleMic() {
        if (!liveStream) {
            return;
        }

        if (!audioCtx) {
            setMicNote("This browser can't add a microphone to a stream.", true);
            return;
        }

        try {
            if (micOn) {
                disableMic();

                setMicNote("Mic is off. Viewers can't hear you.", false);

            } else {
                await enableMic();

                await refreshMicDevices();

                setMicNote("Mic is on. Viewers can hear you.", false);
            }

        } catch (error) {
            handleMicError(error);
        }
    }

    async function onMicSelectChange() {
        const select = $("clipflyMicSelect");

        if (!select) {
            return;
        }

        micDeviceId = select.value || "";

        try {
            localStorage.setItem(MIC_KEY, micDeviceId);
        } catch (error) {
            console.warn(error);
        }

        if (micOn) {
            try {
                await enableMic();

                setMicNote("Switched microphone.", false);

            } catch (error) {
                handleMicError(error);
            }

        } else {
            setMicNote("Microphone chosen. Turn the mic on to use it.", false);
        }
    }

    // Adds the microphone controls to the "Change Live" window.
    function enhanceChangeLivePopup() {
        const popup = $("changeLivePopup");

        if (!popup || $("clipflyMicBox")) {
            return;
        }

        const saveButton = popup.querySelector(
            'button[onclick="saveLiveChanges()"]'
        );

        if (!saveButton || !saveButton.parentNode) {
            return;
        }

        const box = document.createElement("div");

        box.id = "clipflyMicBox";
        box.style.padding = "12px";
        box.style.borderRadius = "12px";
        box.style.background = "#101014";
        box.style.border = "1px solid #35353d";

        const heading = document.createElement("div");

        heading.textContent = "🎤 Microphone";
        heading.style.fontWeight = "700";
        heading.style.marginBottom = "10px";

        const row = document.createElement("div");

        row.style.display = "flex";
        row.style.flexWrap = "wrap";
        row.style.alignItems = "center";
        row.style.gap = "10px";

        const toggle = document.createElement("button");

        toggle.id = "clipflyMicToggle";
        toggle.type = "button";
        toggle.className = "dark-button";
        toggle.textContent = "🔇 Mic is OFF (click to turn on)";

        toggle.addEventListener("click", toggleMic);

        const select = document.createElement("select");

        select.id = "clipflyMicSelect";
        select.style.flex = "1";
        select.style.minWidth = "180px";
        select.style.padding = "11px 12px";
        select.style.borderRadius = "10px";
        select.style.border = "1px solid #35353d";
        select.style.background = "#18181f";
        select.style.color = "#ffffff";
        select.style.outline = "none";

        select.addEventListener("change", onMicSelectChange);

        const note = document.createElement("div");

        note.id = "clipflyMicNote";
        note.style.marginTop = "10px";
        note.style.fontSize = "13px";
        note.style.color = "#9999a5";
        note.style.lineHeight = "1.4";
        note.textContent =
            "Turn your mic on so viewers can hear you. It starts off.";

        row.appendChild(toggle);
        row.appendChild(select);

        box.appendChild(heading);
        box.appendChild(row);
        box.appendChild(note);

        saveButton.parentNode.insertBefore(box, saveButton);

        if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
            navigator.mediaDevices.addEventListener(
                "devicechange",
                refreshMicDevices
            );
        }

        updateMicUI();
    }

    /*
     * =========================================
     * MEDIA RECORDER
     * =========================================
     */

    function getRecorderType() {
        const types = [
            "video/webm;codecs=vp9,opus",
            "video/webm;codecs=vp8,opus",
            "video/webm"
        ];

        for (const type of types) {
            if (
                typeof MediaRecorder !== "undefined" &&
                MediaRecorder.isTypeSupported(type)
            ) {
                return type;
            }
        }

        return "";
    }

    function startRecorder(stream) {
        recordedChunks = [];
        liveRecordingBlob = null;

        if (typeof MediaRecorder === "undefined") {
            throw new Error("Your browser does not support video recording.");
        }

        const mimeType = getRecorderType();

        mediaRecorder = mimeType
            ? new MediaRecorder(stream, { mimeType: mimeType })
            : new MediaRecorder(stream);

        mediaRecorder.ondataavailable = function (event) {
            if (event.data && event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = function () {
            if (!recordedChunks.length) {
                return;
            }

            liveRecordingBlob = new Blob(
                recordedChunks,
                { type: mediaRecorder.mimeType || "video/webm" }
            );
        };

        mediaRecorder.onerror = function (event) {
            console.error("MediaRecorder error:", event);
        };

        mediaRecorder.start(1000);
    }

    /*
     * =========================================
     * LIVE STREAM DATABASE ROW (shows on Home)
     * =========================================
     */

    async function registerLiveStream(user) {
        if (!window.supabaseClient) {
            return "Supabase is not loaded.";
        }

        try {
            liveThumbnailUrl = null;
            uploadedThumbFile = null;

            if (liveThumbnailFile) {
                liveThumbnailUrl =
                    await uploadLiveThumbnail(user, liveThumbnailFile);

                uploadedThumbFile = liveThumbnailFile;
            }

            const username =
                (user.user_metadata && user.user_metadata.username) ||
                "User";

            const now = new Date().toISOString();

            const result =
                await window.supabaseClient
                    .from("live_streams")
                    .insert({
                        username: username,
                        title: liveTitle,
                        thumbnail_url: liveThumbnailUrl,
                        is_live: true,
                        started_at: now,
                        last_seen: now
                    })
                    .select("id")
                    .single();

            if (result.error) {
                throw result.error;
            }

            liveRowId = result.data.id;

            startHeartbeat();

            return null;

        } catch (error) {
            console.error("Could not list livestream on Home:", error);

            return error.message || "Could not list the livestream on Home.";
        }
    }

    function startHeartbeat() {
        stopHeartbeat();

        heartbeatTimer = setInterval(async function () {
            if (!liveRowId || !window.supabaseClient) {
                return;
            }

            try {
                await window.supabaseClient
                    .from("live_streams")
                    .update({
                        is_live: true,
                        last_seen: new Date().toISOString()
                    })
                    .eq("id", liveRowId);

            } catch (error) {
                console.warn("Live heartbeat failed:", error);
            }
        }, HEARTBEAT_MS);
    }

    function stopHeartbeat() {
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }
    }

    async function removeLiveStreamRow() {
        stopHeartbeat();

        const id = liveRowId;

        liveRowId = null;

        if (!id || !window.supabaseClient) {
            return;
        }

        try {
            const result =
                await window.supabaseClient
                    .from("live_streams")
                    .delete()
                    .eq("id", id);

            if (result.error) {
                throw result.error;
            }

        } catch (error) {
            console.warn("Could not remove live row:", error);
        }

        refreshLiveNow();
    }

    /*
     * =========================================
     * BROADCASTING TO VIEWERS (WebRTC via PeerJS)
     * =========================================
     */

    function updateLiveStatus() {
        const text =
            (liveNote || "🔴 You are live.") +
            "   👀 " +
            viewerLinks.size +
            " watching   " +
            (micOn ? "🎤 Mic on" : "🔇 Mic off");

        const el = $("liveStatus");

        if (el) {
            el.textContent = text;
        }

        if (popout && popout.status) {
            popout.status.textContent =
                "👀 " +
                viewerLinks.size +
                " watching   " +
                (micOn ? "🎤 Mic on" : "🔇 Mic off");
        }
    }

    function sendToViewers(message) {
        viewerLinks.forEach(function (link) {
            try {
                link.conn.send(message);
            } catch (error) {
                console.warn("Could not message viewer:", error);
            }
        });
    }

    function removeViewer(peerId) {
        const link = viewerLinks.get(peerId);

        if (!link) {
            return;
        }

        viewerLinks.delete(peerId);

        try {
            if (link.call) {
                link.call.close();
            }
        } catch (error) {
            console.warn(error);
        }

        try {
            if (link.conn) {
                link.conn.close();
            }
        } catch (error) {
            console.warn(error);
        }

        updateLiveStatus();
    }

    // Caps the video bitrate so far-away viewers can keep up.
    function tuneVideoSender(pc) {
        try {
            pc.getSenders().forEach(function (sender) {
                if (!sender.track || sender.track.kind !== "video") {
                    return;
                }

                const parameters = sender.getParameters();

                if (!parameters.encodings || parameters.encodings.length === 0) {
                    parameters.encodings = [{}];
                }

                parameters.encodings[0].maxBitrate = MAX_VIDEO_BITRATE;
                parameters.encodings[0].maxFramerate = 30;

                sender.setParameters(parameters).catch(function (error) {
                    console.warn("Could not tune the video:", error);
                });
            });

        } catch (error) {
            console.warn("Could not tune the video:", error);
        }
    }

    function watchHostCall(peerId, call) {
        const pc = call && call.peerConnection;

        if (!pc) {
            return;
        }

        let tuned = false;

        pc.addEventListener("iceconnectionstatechange", function () {
            const state = pc.iceConnectionState;

            if ((state === "connected" || state === "completed") && !tuned) {
                tuned = true;
                tuneVideoSender(pc);
            }

            if (state === "failed") {
                removeViewer(peerId);
            }
        });
    }

    function onViewerConnection(conn) {
        conn.on("open", function () {
            if (!liveStream || !hostPeer) {
                try {
                    conn.send({ type: "ended" });
                } catch (error) {
                    console.warn(error);
                }

                setTimeout(function () {
                    try {
                        conn.close();
                    } catch (error) {
                        console.warn(error);
                    }
                }, 300);

                return;
            }

            if (viewerLinks.size >= MAX_VIEWERS) {
                try {
                    conn.send({ type: "full" });
                } catch (error) {
                    console.warn(error);
                }

                setTimeout(function () {
                    try {
                        conn.close();
                    } catch (error) {
                        console.warn(error);
                    }
                }, 300);

                return;
            }

            const call = hostPeer.call(conn.peer, liveStream);

            viewerLinks.set(conn.peer, { conn: conn, call: call });

            watchHostCall(conn.peer, call);

            try {
                conn.send({ type: "info", title: liveTitle });
            } catch (error) {
                console.warn(error);
            }

            updateLiveStatus();
        });

        conn.on("close", function () {
            removeViewer(conn.peer);
        });

        conn.on("error", function () {
            removeViewer(conn.peer);
        });
    }

    async function startBroadcasting() {
        if (typeof Peer === "undefined") {
            return "the live video library (PeerJS) did not load.";
        }

        const ice = await loadIceServers();

        return new Promise(function (resolve) {
            let settled = false;

            function finish(message) {
                if (settled) {
                    return;
                }

                settled = true;
                resolve(message);
            }

            try {
                const peer = new Peer(PEER_PREFIX + liveRowId, {
                    config: {
                        iceServers: ice.servers,
                        iceCandidatePoolSize: 2
                    }
                });

                hostPeer = peer;

                peer.on("open", function () {
                    finish(null);
                });

                peer.on("connection", onViewerConnection);

                peer.on("disconnected", function () {
                    if (hostPeer === peer && !peer.destroyed) {
                        try {
                            peer.reconnect();
                        } catch (error) {
                            console.warn(error);
                        }
                    }
                });

                peer.on("error", function (error) {
                    console.warn("Host peer error:", error);

                    finish(
                        (error && (error.message || error.type)) ||
                        "connection error"
                    );
                });

                setTimeout(function () {
                    finish("timed out reaching the connection service.");
                }, 10000);

            } catch (error) {
                finish(error.message || "could not start broadcasting.");
            }
        });
    }

    function swapTracksOnViewers(newStream) {
        viewerLinks.forEach(function (link) {
            const pc = link.call && link.call.peerConnection;

            if (!pc) {
                return;
            }

            pc.getSenders().forEach(function (sender) {
                if (!sender.track) {
                    return;
                }

                const kind = sender.track.kind;

                const replacement =
                    newStream.getTracks().find(function (track) {
                        return track.kind === kind;
                    }) || null;

                try {
                    Promise.resolve(sender.replaceTrack(replacement))
                        .catch(function (error) {
                            console.warn("Could not swap track:", error);
                        });
                } catch (error) {
                    console.warn("Could not swap track:", error);
                }
            });
        });
    }

    function stopBroadcasting() {
        sendToViewers({ type: "ended" });

        const peer = hostPeer;
        const chat = hostChat;

        hostPeer = null;
        hostChat = null;

        viewerLinks.clear();

        setTimeout(function () {
            try {
                if (peer) {
                    peer.destroy();
                }
            } catch (error) {
                console.warn(error);
            }
        }, 800);

        leaveChat(chat);
    }

    /*
     * =========================================
     * STOP EVERYTHING THE STREAM USES
     * =========================================
     */

    function teardownLiveMedia() {
        stopMicStream();

        micOn = false;

        [liveStream, displayStream].forEach(function (stream) {
            if (stream) {
                try {
                    stream.getTracks().forEach(function (track) {
                        track.stop();
                    });
                } catch (error) {
                    console.warn(error);
                }
            }
        });

        liveStream = null;
        displayStream = null;

        teardownMixer();

        updateMicUI();
    }

    /*
     * =========================================
     * START LIVE
     * =========================================
     */

    async function startLive() {
        const user = await requireLogin();

        if (!user) {
            closeLiveSetup();
            return;
        }

        const titleInput = $("liveTitleInput");
        const status = $("liveSetupStatus");

        if (!titleInput) {
            console.error("liveTitleInput was not found.");
            return;
        }

        const title = titleInput.value.trim();

        if (!title) {
            if (status) {
                status.textContent = "Please enter a livestream name.";
            }

            titleInput.focus();

            return;
        }

        try {
            if (status) {
                status.textContent = "Choose your screen or browser tab...";
            }

            const display = await getDisplayStream();

            displayStream = display;
            liveTitle = title;

            // Viewers always get one video track + one mixed sound track
            // (shared sound + microphone), so the mic can be switched on
            // later without reconnecting anyone.
            const mixTrack = setupMixer(display);
            const videoTrack = display.getVideoTracks()[0];

            const out =
                mixTrack && videoTrack
                    ? new MediaStream([videoTrack, mixTrack])
                    : display;

            liveStream = out;

            const video = $("livePreviewVideo");

            if (!video) {
                throw new Error(
                    "The Clipfly Live video player could not be found."
                );
            }

            liveVideo = video;

            video.srcObject = out;
            video.muted = true;

            await video.play();

            startRecorder(out);

            watchDisplayEnd(display);

            closeLiveSetup();

            const livePopup = $("livePopup");

            if (livePopup) {
                livePopup.style.display = "flex";
            }

            const titleDisplay = $("liveTitleDisplay");

            if (titleDisplay) {
                titleDisplay.textContent = "🔴 " + liveTitle;
            }

            const liveBar = $("clipflyLiveBar");

            if (liveBar) {
                liveBar.style.display = "flex";
            }

            if (hostChatBox) {
                hostChatBox.innerHTML = "";
                appendChat(hostChatBox, "", "Live chat started!", true);
            }

            micOn = false;

            setMicNote(
                "Turn your mic on so viewers can hear you. It starts off.",
                false
            );

            /*
             * Put the livestream on Home, then open it to viewers.
             */

            liveNote = "";
            viewerLinks.clear();

            const listError = await registerLiveStream(user);

            if (listError) {
                liveNote =
                    "🔴 You are live, but the stream could not be listed on Home: " +
                    listError;

            } else {
                const castError = await startBroadcasting();

                if (castError) {
                    liveNote =
                        "🔴 You are live, but viewers may not be able to connect: " +
                        castError;
                }

                hostChat = joinChat(liveRowId, hostChatTargets);
            }

            updateMicUI();
            refreshLiveNow();

        } catch (error) {
            console.error("Clipfly Live error:", error);

            if (mediaRecorder && mediaRecorder.state !== "inactive") {
                try {
                    mediaRecorder.stop();
                } catch (stopError) {
                    console.warn(stopError);
                }
            }

            teardownLiveMedia();

            if (status) {
                status.textContent =
                    error.message || "Could not start livestream.";
            }
        }
    }

    /*
     * =========================================
     * LIVE WINDOW
     * =========================================
     */

    function showLiveWindow() {
        if (!liveStream) {
            return;
        }

        const popup = $("livePopup");

        if (popup) {
            popup.style.display = "flex";
        }
    }

    function closeLiveWindow() {
        const popup = $("livePopup");

        if (popup) {
            popup.style.display = "none";
        }
    }

    /*
     * =========================================
     * CHANGE LIVE
     * =========================================
     */

    function changeLive() {
        if (!liveStream) {
            return;
        }

        const popup = $("changeLivePopup");

        if (!popup) {
            alert("Change Live window could not be found.");
            return;
        }

        const titleInput = $("changeLiveTitleInput");

        if (titleInput) {
            titleInput.value = liveTitle;
        }

        refreshMicDevices();
        updateMicUI();

        popup.style.display = "flex";
    }

    function closeChangeLive() {
        const popup = $("changeLivePopup");

        if (popup) {
            popup.style.display = "none";
        }
    }

    async function changeLiveSource(mode) {
        if (!liveStream) {
            return;
        }

        try {
            const user = await requireLogin();

            if (!user) {
                return;
            }

            const newDisplay = await getDisplayStream();
            const oldDisplay = displayStream;

            displayStream = newDisplay;

            // New shared sound goes into the same mixer, so the mic and the
            // viewers' sound connection keep working.
            connectDisplayAudio(newDisplay);

            const newVideo = newDisplay.getVideoTracks()[0];

            const mixTrack =
                mixDest && mixDest.stream
                    ? mixDest.stream.getAudioTracks()[0]
                    : null;

            const newOut =
                mixTrack && newVideo
                    ? new MediaStream([newVideo, mixTrack])
                    : newDisplay;

            if (mediaRecorder && mediaRecorder.state !== "inactive") {
                mediaRecorder.stop();

                await new Promise(function (resolve) {
                    setTimeout(resolve, 300);
                });
            }

            liveStream = newOut;

            // Stop the old capture (the mixed sound track is NOT part of it).
            if (oldDisplay) {
                oldDisplay.getTracks().forEach(function (track) {
                    track.stop();
                });
            }

            if (liveVideo) {
                liveVideo.srcObject = newOut;
                await liveVideo.play();
            }

            // Viewers keep watching, now with the new screen.
            swapTracksOnViewers(newOut);

            startRecorder(newOut);

            watchDisplayEnd(newDisplay);

        } catch (error) {
            console.error("Could not change live source:", error);

            alert(error.message || "Could not change your screen.");
        }
    }

    async function saveLiveChanges() {
        const titleInput = $("changeLiveTitleInput");

        if (titleInput) {
            const newTitle = titleInput.value.trim();

            if (newTitle) {
                liveTitle = newTitle;
            }
        }

        const titleDisplay = $("liveTitleDisplay");

        if (titleDisplay) {
            titleDisplay.textContent = "🔴 " + liveTitle;
        }

        closeChangeLive();

        sendToViewers({ type: "info", title: liveTitle });

        /*
         * Update the card on the Home tab too.
         */

        if (liveRowId && window.supabaseClient) {
            try {
                const changes = {
                    title: liveTitle,
                    last_seen: new Date().toISOString()
                };

                if (
                    liveThumbnailFile &&
                    liveThumbnailFile !== uploadedThumbFile
                ) {
                    const user = await getLoggedInUser();

                    const newUrl =
                        await uploadLiveThumbnail(user, liveThumbnailFile);

                    if (newUrl) {
                        liveThumbnailUrl = newUrl;
                        uploadedThumbFile = liveThumbnailFile;
                        changes.thumbnail_url = newUrl;
                    }
                }

                const result =
                    await window.supabaseClient
                        .from("live_streams")
                        .update(changes)
                        .eq("id", liveRowId);

                if (result.error) {
                    throw result.error;
                }

                refreshLiveNow();

            } catch (error) {
                console.warn("Could not update live card:", error);
            }
        }
    }

    /*
     * =========================================
     * END LIVE
     * =========================================
     */

    function endLive() {
        if (!liveStream) {
            return;
        }

        const popup = $("endLivePopup");

        if (popup) {
            popup.style.display = "flex";
        }
    }

    function closeEndLive() {
        const popup = $("endLivePopup");

        if (popup) {
            popup.style.display = "none";
        }
    }

    async function confirmEndLive() {
        closeEndLive();

        if (!liveStream) {
            return;
        }

        try {
            if (mediaRecorder && mediaRecorder.state !== "inactive") {
                mediaRecorder.stop();

                await new Promise(function (resolve) {
                    setTimeout(resolve, 700);
                });
            }

            teardownLiveMedia();

            if (liveVideo) {
                liveVideo.srcObject = null;
            }

            const liveBar = $("clipflyLiveBar");

            if (liveBar) {
                liveBar.style.display = "none";
            }

            closeChatPopout();

            closeLiveWindow();
            closeChangeLive();

            // Tell viewers it's over, then take the stream off Home.
            stopBroadcasting();

            await removeLiveStreamRow();

            liveThumbnailFile = null;
            uploadedThumbFile = null;
            liveNote = "";

            const keepPopup = $("keepLivePopup");

            if (keepPopup) {
                keepPopup.style.display = "flex";
            }

        } catch (error) {
            console.error("Error ending livestream:", error);
        }
    }

    /*
     * =========================================
     * DELETE / KEEP ENDED LIVE
     * =========================================
     */

    function deleteEndedLive() {
        liveRecordingBlob = null;
        recordedChunks = [];
        mediaRecorder = null;
        liveThumbnailUrl = null;

        const popup = $("keepLivePopup");

        if (popup) {
            popup.style.display = "none";
        }

        alert("🗑️ Livestream deleted.");
    }

    async function keepEndedLive() {
        const popup = $("keepLivePopup");

        if (popup) {
            popup.style.display = "none";
        }

        await saveLiveAsVideo();
    }

    async function saveLiveAsVideo() {
        if (!liveRecordingBlob) {
            alert("The livestream recording was not available.");
            return;
        }

        try {
            if (!window.supabaseClient) {
                throw new Error("Supabase is not loaded.");
            }

            const user = await getLoggedInUser();

            if (!user) {
                throw new Error(
                    "You must be logged in to keep the livestream."
                );
            }

            const safeTitle =
                liveTitle
                    .replace(/[^a-z0-9-_ ]/gi, "")
                    .trim()
                    .replace(/\s+/g, "-")
                    .slice(0, 80) ||
                "livestream";

            const storagePath =
                user.id +
                "/live/" +
                Date.now() +
                "-" +
                safeTitle +
                ".webm";

            const uploadResult =
                await window.supabaseClient
                    .storage
                    .from("videos")
                    .upload(storagePath, liveRecordingBlob, {
                        contentType: liveRecordingBlob.type || "video/webm",
                        upsert: false
                    });

            if (uploadResult.error) {
                throw uploadResult.error;
            }

            const publicResult =
                window.supabaseClient
                    .storage
                    .from("videos")
                    .getPublicUrl(storagePath);

            if (
                !publicResult ||
                !publicResult.data ||
                !publicResult.data.publicUrl
            ) {
                throw new Error("Could not create the video URL.");
            }

            const username =
                (user.user_metadata && user.user_metadata.username) ||
                "User";

            const insertResult =
                await window.supabaseClient
                    .from("videos")
                    .insert({
                        title: liveTitle,
                        username: username,
                        video_url: publicResult.data.publicUrl,
                        thumbnail_url: liveThumbnailUrl
                    });

            if (insertResult.error) {
                throw insertResult.error;
            }

            alert("📺 Your livestream is now a video on your channel!");

            if (typeof window.loadVideos === "function") {
                try {
                    await window.loadVideos();
                } catch (error) {
                    console.warn("Could not refresh videos:", error);
                }
            }

        } catch (error) {
            console.error("Could not save livestream:", error);

            alert(
                "The livestream ended, but the recording could not be saved.\n\n" +
                (error.message || "Unknown error")
            );

        } finally {
            liveRecordingBlob = null;
            recordedChunks = [];
            mediaRecorder = null;
            liveThumbnailUrl = null;
        }
    }

    /*
     * =========================================
     * CHAT POP-OUT (floating chat window)
     * =========================================
     */

    function updatePopoutButton() {
        const button = $("clipflyChatPopoutButton");

        if (button) {
            button.textContent = popout ? "↙ Pop in" : "↗ Pop out";
        }
    }

    function closeChatPopout() {
        const current = popout;

        popout = null;

        updatePopoutButton();

        if (current && current.win) {
            try {
                current.win.close();
            } catch (error) {
                console.warn(error);
            }
        }
    }

    function buildPopoutUI(win) {
        const doc = win.document;

        doc.title = "Clipfly live chat";

        const style = doc.createElement("style");

        style.textContent = `
            html, body {
                margin: 0;
                height: 100%;
            }

            body {
                background: #101014;
                color: #ffffff;
                font-family: Arial, Helvetica, sans-serif;
                display: flex;
                flex-direction: column;
            }

            .head {
                padding: 10px 12px;
                background: #18181f;
                border-bottom: 1px solid #30303a;
            }

            .head strong {
                display: block;
                font-size: 15px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .head span {
                font-size: 12px;
                color: #9999a5;
            }

            .msgs {
                flex: 1;
                overflow-y: auto;
                padding: 12px;
                font-size: 14px;
                line-height: 1.4;
            }

            .row {
                display: flex;
                gap: 8px;
                padding: 10px;
                background: #18181f;
                border-top: 1px solid #30303a;
            }

            .row input {
                flex: 1;
                min-width: 0;
                padding: 10px 12px;
                border-radius: 10px;
                border: 1px solid #35353d;
                background: #101014;
                color: #ffffff;
                outline: none;
                font-size: 14px;
            }

            .row input:focus {
                border-color: #3478ff;
            }

            .row button {
                border: none;
                border-radius: 10px;
                padding: 0 16px;
                background: #3478ff;
                color: #ffffff;
                font-weight: 700;
                cursor: pointer;
            }
        `;

        doc.head.appendChild(style);

        doc.body.innerHTML = "";

        const head = doc.createElement("div");

        head.className = "head";

        const title = doc.createElement("strong");

        title.textContent = "💬 " + (liveTitle || "Live chat");

        const status = doc.createElement("span");

        head.appendChild(title);
        head.appendChild(status);

        const box = doc.createElement("div");

        box.className = "msgs";

        const row = doc.createElement("div");

        row.className = "row";

        const input = doc.createElement("input");

        input.type = "text";
        input.maxLength = 300;
        input.placeholder = "Say something...";

        const send = doc.createElement("button");

        send.type = "button";
        send.textContent = "Send";

        row.appendChild(input);
        row.appendChild(send);

        doc.body.appendChild(head);
        doc.body.appendChild(box);
        doc.body.appendChild(row);

        // Copy the messages so far.
        if (hostChatBox) {
            Array.from(hostChatBox.children).forEach(function (node) {
                box.appendChild(node.cloneNode(true));
            });

            box.scrollTop = box.scrollHeight;
        }

        function submit() {
            sendChatTo(hostChat, hostChatTargets, input);
        }

        send.addEventListener("click", submit);

        input.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                submit();
            }
        });

        win.addEventListener("pagehide", function () {
            if (popout && popout.win === win) {
                popout = null;

                updatePopoutButton();
            }
        });

        popout = { win: win, box: box, input: input, status: status };

        updatePopoutButton();
        updateLiveStatus();

        try {
            input.focus();
        } catch (error) {
            console.warn(error);
        }
    }

    async function openChatPopout() {
        if (!liveStream) {
            return;
        }

        if (popout && popout.win && !popout.win.closed) {
            try {
                popout.win.focus();
            } catch (error) {
                console.warn(error);
            }

            return;
        }

        let win = null;

        // Chrome / Edge: a small always-on-top window, like Edge pop-outs.
        if (
            window.documentPictureInPicture &&
            typeof window.documentPictureInPicture.requestWindow === "function"
        ) {
            try {
                win = await window.documentPictureInPicture.requestWindow({
                    width: 380,
                    height: 560
                });

            } catch (error) {
                console.warn("Pop-out window failed, using a normal window:", error);

                win = null;
            }
        }

        // Other browsers: a normal small window.
        if (!win) {
            win = window.open(
                "",
                "clipflyLiveChat",
                "popup=yes,width=380,height=560"
            );

            if (!win) {
                notify(
                    "Pop-out blocked",
                    "Your browser blocked the pop-out window. Allow pop-ups for Clipfly and try again.",
                    "⚠️"
                );

                return;
            }

            win.document.open();

            win.document.write(
                "<!doctype html><html><head><meta charset='utf-8'><title>Clipfly live chat</title></head><body></body></html>"
            );

            win.document.close();
        }

        buildPopoutUI(win);
    }

    function togglePopout() {
        if (popout) {
            closeChatPopout();
        } else {
            openChatPopout();
        }
    }

    // Adds the "Pop out" bar above the streamer's chat.
    function enhanceHostChatPanel() {
        const messages = $("liveChatMessages");

        if (!messages) {
            return;
        }

        hostChatBox = messages;
        hostChatInput = $("liveChatInput");

        const panel = messages.parentNode;

        if (!panel || $("clipflyChatHeader")) {
            return;
        }

        const header = document.createElement("div");

        header.id = "clipflyChatHeader";
        header.style.display = "flex";
        header.style.alignItems = "center";
        header.style.justifyContent = "space-between";
        header.style.gap = "10px";
        header.style.padding = "8px 12px";
        header.style.background = "#18181f";
        header.style.borderBottom = "1px solid #30303a";

        const title = document.createElement("strong");

        title.textContent = "💬 Live chat";

        const button = document.createElement("button");

        button.id = "clipflyChatPopoutButton";
        button.type = "button";
        button.className = "dark-button";
        button.textContent = "↗ Pop out";
        button.title = "Float your chat over other windows";
        button.style.padding = "6px 12px";
        button.style.fontSize = "13px";

        button.addEventListener("click", togglePopout);

        header.appendChild(title);
        header.appendChild(button);

        panel.insertBefore(header, panel.firstChild);
    }

    /*
     * =========================================
     * LIVE BAR
     * =========================================
     */

    function createLiveBar() {
        if ($("clipflyLiveBar")) {
            return;
        }

        const bar = document.createElement("div");

        bar.id = "clipflyLiveBar";

        bar.innerHTML = `
            <span style="
                width:9px;
                height:9px;
                background:#ff3030;
                border-radius:50%;
                display:inline-block;
            "></span>

            <strong>LIVE</strong>

            <button
                id="clipflyBarMic"
                type="button"
                class="dark-button"
                onclick="window.clipflyToggleMic()"
            >
                🔇 Mic off
            </button>

            <button
                type="button"
                class="dark-button"
                onclick="window.clipflyChangeLive()"
            >
                🔄 Change Live
            </button>

            <button
                type="button"
                class="dark-button"
                onclick="window.clipflyEndLive()"
                style="background:#e53935;"
            >
                🛑 End Live
            </button>
        `;

        bar.style.position = "fixed";
        bar.style.top = "0";
        bar.style.left = "0";
        bar.style.right = "0";
        bar.style.zIndex = "99999";
        bar.style.background = "#18181f";
        bar.style.padding = "9px";
        bar.style.display = "none";
        bar.style.alignItems = "center";
        bar.style.justifyContent = "center";
        bar.style.gap = "10px";

        document.body.appendChild(bar);
    }

    /*
     * =========================================
     * VIEWER: WATCH SOMEONE ELSE'S LIVESTREAM
     * =========================================
     */

    function setViewerStatus(text) {
        const el = $("clipflyViewerStatus");

        if (el) {
            el.textContent = text;
        }
    }

    function showViewerRetry(show) {
        const button = $("clipflyViewerRetry");

        if (button) {
            button.style.display = show ? "inline-block" : "none";
        }
    }

    function ensureViewerUI() {
        let popup = $("clipflyLiveViewerPopup");

        if (popup) {
            return popup;
        }

        popup = document.createElement("div");

        popup.id = "clipflyLiveViewerPopup";
        popup.className = "popup";
        popup.style.display = "none";

        popup.innerHTML = `
            <div class="popup-box" style="width:min(1100px,96vw);max-height:92vh;overflow-y:auto;">

                <button class="close-button" type="button" id="clipflyViewerClose">✕</button>

                <h2 id="clipflyViewerTitle" style="margin-bottom:4px;padding-right:40px;">🔴 Live</h2>

                <div id="clipflyViewerHost" style="color:#9999a5;margin-bottom:12px;"></div>

                <video
                    id="clipflyViewerVideo"
                    autoplay
                    playsinline
                    controls
                    style="width:100%;max-height:60vh;background:#000;border-radius:14px;object-fit:contain;display:block;"
                ></video>

                <div
                    id="clipflyViewerStatus"
                    style="margin-top:12px;padding:12px;border-radius:10px;background:#101014;color:#aaa;"
                >Connecting...</div>

                <button
                    class="dark-button"
                    type="button"
                    id="clipflyViewerRetry"
                    style="display:none;margin-top:10px;"
                >🔁 Try again</button>

                <div style="margin-top:18px;border:1px solid #30303a;border-radius:12px;overflow:hidden;">

                    <div
                        id="clipflyViewerChat"
                        style="height:190px;overflow-y:auto;padding:12px;background:#101014;"
                    ></div>

                    <div style="display:flex;gap:8px;padding:10px;background:#18181f;">

                        <input
                            id="clipflyViewerChatInput"
                            type="text"
                            maxlength="300"
                            placeholder="Say something..."
                            style="flex:1;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #35353d;background:#101014;color:white;outline:none;"
                        >

                        <button class="blue-button" type="button" id="clipflyViewerChatSend">Send</button>

                    </div>

                </div>

            </div>
        `;

        document.body.appendChild(popup);

        function viewerChatTargets() {
            const box = $("clipflyViewerChat");

            return box ? [box] : [];
        }

        function sendViewerChat() {
            const session = viewerSession;

            if (!session) {
                return;
            }

            sendChatTo(
                session.chat,
                viewerChatTargets,
                $("clipflyViewerChatInput")
            );
        }

        $("clipflyViewerClose").addEventListener("click", closeViewer);
        $("clipflyViewerChatSend").addEventListener("click", sendViewerChat);

        $("clipflyViewerRetry").addEventListener("click", function () {
            if (viewerSession && viewerSession.stream) {
                watchLive(viewerSession.stream);
            }
        });

        $("clipflyViewerChatInput").addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                sendViewerChat();
            }
        });

        popup.addEventListener("click", function (event) {
            if (event.target === popup) {
                closeViewer();
            }
        });

        return popup;
    }

    function cleanupViewerTransport(session) {
        if (session.timer) {
            clearTimeout(session.timer);
            session.timer = null;
        }

        [
            ["call", "close"],
            ["conn", "close"],
            ["peer", "destroy"]
        ].forEach(function (pair) {
            const item = session[pair[0]];

            if (item) {
                try {
                    item[pair[1]]();
                } catch (error) {
                    console.warn(error);
                }
            }

            session[pair[0]] = null;
        });
    }

    function closeViewer() {
        const session = viewerSession;

        viewerSession = null;

        if (session) {
            cleanupViewerTransport(session);

            leaveChat(session.chat);
        }

        showViewerRetry(false);

        const video = $("clipflyViewerVideo");

        if (video) {
            video.pause();
            video.srcObject = null;
        }

        const popup = $("clipflyLiveViewerPopup");

        if (popup) {
            popup.style.display = "none";
        }
    }

    function attachViewerStream(session, remote) {
        const video = $("clipflyViewerVideo");

        if (!video) {
            return;
        }

        session.gotVideo = true;

        if (session.timer) {
            clearTimeout(session.timer);
            session.timer = null;
        }

        showViewerRetry(false);

        if (video.srcObject !== remote) {
            video.srcObject = remote;
        }

        setViewerStatus("🔴 Watching live");

        const playing = video.play();

        if (playing && playing.catch) {
            playing.catch(function () {
                video.muted = true;

                video.play().catch(function () {});

                setViewerStatus(
                    "🔴 Watching live (muted, use the video controls to unmute)"
                );
            });
        }
    }

    function viewerEnded(session, message) {
        if (session.ended) {
            return;
        }

        session.ended = true;

        if (session.timer) {
            clearTimeout(session.timer);
            session.timer = null;
        }

        setViewerStatus(message || "This livestream has ended.");

        const video = $("clipflyViewerVideo");

        if (video) {
            video.pause();
        }
    }

    function onViewerTimeout(session, ice) {
        if (viewerSession !== session || session.gotVideo || session.ended) {
            return;
        }

        if (session.attempt === 0) {
            // First try failed: connect again on a different route.
            session.attempt = 1;
            session.relayOnly = !!(ice && ice.hasCustom);

            setViewerStatus(
                session.relayOnly
                    ? "Still connecting... trying a relay route."
                    : "Still connecting... trying again."
            );

            connectViewer(session);

            return;
        }

        setViewerStatus(
            "Couldn't connect to this stream. The streamer's network or yours may be blocking live video."
        );

        showViewerRetry(true);
    }

    async function connectViewer(session) {
        cleanupViewerTransport(session);

        const ice = await loadIceServers();

        if (viewerSession !== session) {
            return;
        }

        let peer;

        try {
            const config = {
                iceServers: ice.servers,
                iceCandidatePoolSize: 2
            };

            if (session.relayOnly) {
                config.iceTransportPolicy = "relay";
            }

            peer = new Peer({ config: config });

        } catch (error) {
            setViewerStatus("Could not start the video connection.");
            showViewerRetry(true);
            return;
        }

        session.peer = peer;

        peer.on("open", function () {
            if (viewerSession !== session || session.peer !== peer) {
                return;
            }

            const conn = peer.connect(
                PEER_PREFIX + session.id,
                { reliable: true }
            );

            session.conn = conn;

            conn.on("open", function () {
                if (viewerSession === session && !session.gotVideo) {
                    setViewerStatus("Connected. Waiting for video...");
                }
            });

            conn.on("data", function (data) {
                if (viewerSession !== session || !data) {
                    return;
                }

                if (data.type === "ended") {
                    viewerEnded(session, "This livestream has ended.");

                } else if (data.type === "full") {
                    viewerEnded(
                        session,
                        "This stream is full right now. Try again in a bit."
                    );

                    showViewerRetry(true);

                } else if (data.type === "info" && data.title) {
                    $("clipflyViewerTitle").textContent =
                        "🔴 " + String(data.title).slice(0, 120);
                }
            });

            conn.on("close", function () {
                if (
                    viewerSession === session &&
                    session.conn === conn &&
                    session.gotVideo
                ) {
                    viewerEnded(session, "This livestream has ended.");
                }
            });

            conn.on("error", function (error) {
                console.warn("Viewer connection error:", error);
            });
        });

        peer.on("call", function (call) {
            if (viewerSession !== session || session.peer !== peer) {
                try {
                    call.close();
                } catch (error) {
                    console.warn(error);
                }

                return;
            }

            session.call = call;

            call.answer();

            call.on("stream", function (remote) {
                if (viewerSession === session) {
                    attachViewerStream(session, remote);
                }
            });

            call.on("close", function () {
                if (
                    viewerSession === session &&
                    session.call === call &&
                    session.gotVideo
                ) {
                    viewerEnded(session, "This livestream has ended.");
                }
            });
        });

        peer.on("error", function (error) {
            if (viewerSession !== session || session.peer !== peer) {
                return;
            }

            const type = error && error.type;

            if (type === "peer-unavailable") {
                setViewerStatus(
                    "This stream isn't reachable. The streamer may have just ended it."
                );

                showViewerRetry(true);

            } else if (
                type === "network" ||
                type === "server-error" ||
                type === "socket-error" ||
                type === "socket-closed"
            ) {
                setViewerStatus(
                    "Couldn't reach the connection service. Check your internet, or try a different network."
                );

                showViewerRetry(true);

            } else {
                setViewerStatus(
                    "Connection problem: " +
                    ((error && (error.message || error.type)) || "unknown")
                );
            }
        });

        session.timer = setTimeout(function () {
            onViewerTimeout(session, ice);
        }, 15000);
    }

    async function watchLive(stream) {
        if (!stream || !stream.id) {
            return;
        }

        if (typeof Peer === "undefined") {
            notify(
                "Can't watch yet",
                "The live video library did not load. Check your internet connection and refresh the page.",
                "⚠️"
            );

            return;
        }

        closeViewer();

        const popup = ensureViewerUI();

        $("clipflyViewerTitle").textContent =
            "🔴 " + (stream.title || "Livestream");

        $("clipflyViewerHost").textContent =
            "@" + (stream.username || "User");

        const chatBox = $("clipflyViewerChat");

        chatBox.innerHTML = "";

        appendChat(chatBox, "", "Welcome to the live chat!", true);

        const video = $("clipflyViewerVideo");

        video.muted = false;
        video.srcObject = null;

        showViewerRetry(false);

        setViewerStatus("Connecting to the stream...");

        popup.style.display = "flex";

        const session = {
            id: stream.id,
            stream: stream,
            peer: null,
            conn: null,
            call: null,
            chat: null,
            timer: null,
            gotVideo: false,
            ended: false,
            attempt: 0,
            relayOnly: false
        };

        viewerSession = session;

        session.chat = joinChat(stream.id, function () {
            const box = $("clipflyViewerChat");

            return box ? [box] : [];
        });

        await connectViewer(session);
    }

    /*
     * =========================================
     * HOME TAB: "LIVE NOW" SECTION
     * =========================================
     */

    function ensureLiveStrip() {
        let strip = $("clipflyLiveNowStrip");

        if (strip) {
            return strip;
        }

        const grid = $("videoGrid");

        if (!grid || !grid.parentNode) {
            return null;
        }

        strip = document.createElement("div");

        strip.id = "clipflyLiveNowStrip";
        strip.style.display = "none";
        strip.style.marginBottom = "26px";

        grid.parentNode.insertBefore(strip, grid);

        return strip;
    }

    function hideLiveStrip() {
        const strip = $("clipflyLiveNowStrip");

        if (strip) {
            strip.style.display = "none";
        }
    }

    function isHomeVisible() {
        const section = window.currentClipflySection || "home";

        if (section !== "home") {
            return false;
        }

        const search = $("searchInput");

        if (search && search.value.trim()) {
            return false;
        }

        return true;
    }

    function onLiveCardClick(stream) {
        const me = window.currentUser;

        if (liveStream && me && stream.owner_id === me.id) {
            showLiveWindow();
            return;
        }

        watchLive(stream);
    }

    async function refreshLiveNow() {
        if (liveNowRefreshing) {
            return;
        }

        if (!isHomeVisible()) {
            hideLiveStrip();
            return;
        }

        if (!window.supabaseClient) {
            return;
        }

        const strip = ensureLiveStrip();

        if (!strip) {
            return;
        }

        liveNowRefreshing = true;

        try {
            const cutoff =
                new Date(Date.now() - LIVE_TIMEOUT_MS).toISOString();

            const result =
                await window.supabaseClient
                    .from("live_streams")
                    .select("*")
                    .eq("is_live", true)
                    .gt("last_seen", cutoff)
                    .order("started_at", { ascending: false });

            if (result.error) {
                throw result.error;
            }

            // The user may have switched tabs while we were loading.
            if (!isHomeVisible()) {
                hideLiveStrip();
                return;
            }

            const streams = result.data || [];

            if (streams.length === 0) {
                strip.innerHTML = "";
                strip.style.display = "none";
                return;
            }

            let profileMap = {};

            if (typeof window.getProfilesByIds === "function") {
                try {
                    profileMap = await window.getProfilesByIds(
                        streams.map(function (s) {
                            return s.owner_id;
                        })
                    );
                } catch (error) {
                    profileMap = {};
                }
            }

            strip.innerHTML = "";

            const heading = document.createElement("div");

            heading.textContent = "🔴 Live now";
            heading.style.fontSize = "20px";
            heading.style.fontWeight = "700";
            heading.style.margin = "0 0 12px";

            strip.appendChild(heading);

            const liveGrid = document.createElement("div");

            liveGrid.className = "video-grid";

            streams.forEach(function (stream) {
                const card = document.createElement("div");

                card.className = "clipfly-video-card";
                card.style.position = "relative";
                card.style.cursor = "pointer";

                card.addEventListener("click", function () {
                    onLiveCardClick(stream);
                });

                const thumbnail = document.createElement("div");

                thumbnail.className = "clipfly-thumbnail";
                thumbnail.style.position = "relative";

                if (stream.thumbnail_url) {
                    const image = document.createElement("img");

                    image.src = stream.thumbnail_url;
                    image.alt = stream.title || "Livestream thumbnail";
                    image.loading = "lazy";

                    thumbnail.appendChild(image);

                } else {
                    thumbnail.innerHTML = "<span>🔴</span>";
                }

                const badge = document.createElement("div");

                badge.textContent = "🔴 LIVE";
                badge.style.position = "absolute";
                badge.style.left = "8px";
                badge.style.bottom = "8px";
                badge.style.padding = "3px 8px";
                badge.style.borderRadius = "6px";
                badge.style.background = "#e53935";
                badge.style.color = "#ffffff";
                badge.style.fontSize = "12px";
                badge.style.fontWeight = "800";

                thumbnail.appendChild(badge);

                const info = document.createElement("div");

                info.className = "clipfly-video-info";

                const title = document.createElement("div");

                title.className = "clipfly-video-title";
                title.textContent = stream.title || "Untitled Livestream";

                const user = document.createElement("div");

                user.className = "clipfly-video-user";
                user.textContent = "@" + (stream.username || "User");

                const profile = profileMap[stream.owner_id];

                if (
                    profile &&
                    profile.verified &&
                    typeof window.addVerifiedBadge === "function"
                ) {
                    window.addVerifiedBadge(user, true);
                }

                info.appendChild(title);
                info.appendChild(user);

                card.appendChild(thumbnail);
                card.appendChild(info);

                liveGrid.appendChild(card);
            });

            strip.appendChild(liveGrid);

            strip.style.display = "block";

        } catch (error) {
            console.warn("Could not load live streams:", error);

        } finally {
            liveNowRefreshing = false;
        }
    }

    /*
     * Wrap the Home functions from script.js so the
     * "Live now" section always updates with them.
     */

    function wrapGlobal(name, afterRun) {
        const original = window[name];

        if (
            typeof original !== "function" ||
            original.__clipflyLiveWrapped
        ) {
            return;
        }

        const wrapped = async function () {
            const result = await original.apply(this, arguments);

            try {
                afterRun();
            } catch (error) {
                console.warn(error);
            }

            return result;
        };

        wrapped.__clipflyLiveWrapped = true;

        window[name] = wrapped;
    }

    function installHomeHooks() {
        wrapGlobal("loadVideos", refreshLiveNow);
        wrapGlobal("openClipflySection", refreshLiveNow);
        wrapGlobal("searchVideos", refreshLiveNow);

        if (!liveNowTimer) {
            liveNowTimer = setInterval(function () {
                if (!document.hidden) {
                    refreshLiveNow();
                }
            }, LIVE_REFRESH_MS);
        }

        refreshLiveNow();
    }

    /*
     * =========================================
     * INITIALIZE
     * =========================================
     */

    function initialize() {
        createLiveBar();

        enhanceHostChatPanel();
        enhanceChangeLivePopup();

        const chatInput = $("liveChatInput");

        if (chatInput) {
            chatInput.addEventListener("keydown", function (event) {
                if (event.key === "Enter") {
                    event.preventDefault();
                    sendLiveChat();
                }
            });
        }

        window.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && viewerSession) {
                closeViewer();
            }
        });

        setLiveMode("screen");

        installHomeHooks();
    }

    /*
     * =========================================
     * GLOBAL FUNCTIONS (used by HTML onclick)
     * =========================================
     */

    window.openLiveSetup = openLiveSetup;
    window.closeLiveSetup = closeLiveSetup;
    window.setLiveMode = setLiveMode;
    window.previewLiveThumbnail = previewLiveThumbnail;
    window.previewChangeLiveThumbnail = previewChangeLiveThumbnail;
    window.startLive = startLive;
    window.closeLiveWindow = closeLiveWindow;
    window.clipflyChangeLive = changeLive;
    window.closeChangeLive = closeChangeLive;
    window.clipflyChangeLiveSource = changeLiveSource;
    window.changeLiveSource = changeLiveSource;
    window.saveLiveChanges = saveLiveChanges;
    window.clipflyEndLive = endLive;
    window.closeEndLive = closeEndLive;
    window.confirmEndLive = confirmEndLive;
    window.clipflyConfirmEndLive = confirmEndLive;
    window.deleteEndedLive = deleteEndedLive;
    window.clipflyDeleteEndedLive = deleteEndedLive;
    window.keepEndedLive = keepEndedLive;
    window.clipflyKeepEndedLive = keepEndedLive;
    window.saveLiveAsVideo = saveLiveAsVideo;
    window.sendLiveChat = sendLiveChat;
    window.refreshLiveNow = refreshLiveNow;
    window.watchLive = watchLive;
    window.closeLiveViewer = closeViewer;
    window.clipflyToggleMic = toggleMic;
    window.clipflyPopOutChat = openChatPopout;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize);
    } else {
        initialize();
    }

})();
