// =====================================================
// CLIPFLY SCRIPT.JS
// =====================================================

var currentUser = null;
var selectedProfilePicture = null;
var currentWatchingVideo = null;
var currentChannelUser = null;

// =====================================================
// VERIFIED BADGE
// =====================================================

function ensureVerifiedBadgeStyles() {
    if (document.getElementById("clipflyVerifiedBadgeStyles")) return;

    var style = document.createElement("style");
    style.id = "clipflyVerifiedBadgeStyles";
    style.textContent = `
        .clipfly-verified-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 18px;
            height: 18px;
            margin-left: 5px;
            vertical-align: -3px;
            flex: 0 0 auto;
            cursor: help;
            border-radius: 50%;
            background: #2196f3;
            color: #ffffff;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 13px;
            font-weight: 900;
            line-height: 18px;
            text-align: center;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.22);
            box-sizing: border-box;
        }
    `;

    (document.head || document.documentElement).appendChild(style);
}

// Start this immediately so every visible ✓ is converted as soon as it enters the page.
ensureVerifiedBadgeStyles();

function createVerifiedBadge() {
    ensureVerifiedBadgeStyles();

    var badge = document.createElement("span");
    badge.className = "clipfly-verified-badge";
    badge.title = "Verified Clipfly account";
    badge.setAttribute("aria-label", "Verified Clipfly account");
    badge.setAttribute("data-clipfly-verified-badge", "true");
    badge.textContent = "✓";
    return badge;
}

// Converts normal checkmarks (✓) anywhere on Clipfly into the Clipfly verified badge.
function convertCheckmarksToVerified(root) {
    if (!root) return;

    var walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                if (!node.nodeValue || node.nodeValue.indexOf("✓") === -1) {
                    return NodeFilter.FILTER_REJECT;
                }

                var parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;

                if (
                    parent.closest("[data-clipfly-verified-badge='true']") ||
                    parent.tagName === "SCRIPT" ||
                    parent.tagName === "STYLE" ||
                    parent.tagName === "TEXTAREA"
                ) {
                    return NodeFilter.FILTER_REJECT;
                }

                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    var nodes = [];
    var node;
    while ((node = walker.nextNode())) {
        nodes.push(node);
    }

    nodes.forEach(function(textNode) {
        var text = textNode.nodeValue;
        var parent = textNode.parentNode;
        if (!parent) return;

        var parts = text.split("✓");
        var fragment = document.createDocumentFragment();

        parts.forEach(function(part, index) {
            if (part) {
                fragment.appendChild(document.createTextNode(part));
            }

            if (index < parts.length - 1) {
                fragment.appendChild(createVerifiedBadge());
            }
        });

        parent.replaceChild(fragment, textNode);
    });
}

function startCheckmarkConverter() {
    ensureVerifiedBadgeStyles();
    convertCheckmarksToVerified(document.body);

    var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(addedNode) {
                if (addedNode.nodeType === Node.TEXT_NODE) {
                    if (addedNode.nodeValue && addedNode.nodeValue.indexOf("✓") !== -1) {
                        var parent = addedNode.parentElement;
                        if (parent && !parent.closest("[data-clipfly-verified-badge='true']")) {
                            convertCheckmarksToVerified(parent);
                        }
                    }
                } else if (addedNode.nodeType === Node.ELEMENT_NODE) {
                    if (!addedNode.matches("[data-clipfly-verified-badge='true']")) {
                        convertCheckmarksToVerified(addedNode);
                    }
                }
            });
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

function addVerifiedBadge(parent, verified) {
    if (!parent || !verified) return;
    parent.appendChild(createVerifiedBadge());
}

async function getProfileById(userId) {
    if (!userId) return null;
    try {
        var result = await window.supabaseClient
            .from("profiles")
            .select("id, username, avatar_url, verified")
            .eq("id", userId)
            .maybeSingle();
        if (result.error) {
            console.error("Could not load profile:", result.error);
            return null;
        }
        return result.data || null;
    } catch (error) {
        console.error("Could not load profile:", error);
        return null;
    }
}

async function getProfilesByIds(userIds) {
    var ids = Array.from(new Set((userIds || []).filter(Boolean)));
    var profileMap = {};
    if (ids.length === 0) return profileMap;
    try {
        var result = await window.supabaseClient
            .from("profiles")
            .select("id, username, avatar_url, verified")
            .in("id", ids);
        if (result.error) {
            console.error("Could not load profiles:", result.error);
            return profileMap;
        }
        (result.data || []).forEach(function(profile) {
            profileMap[profile.id] = profile;
        });
    } catch (error) {
        console.error("Could not load profiles:", error);
    }
    return profileMap;
}


var ffmpegInstance = null;
var ffmpegLoaded = false;
var ffmpegLoading = false;


// =====================================================
// MESSAGE POPUP
// =====================================================

function showMessage(title, text, icon) {
    var popup = document.getElementById("messagePopup");
    var titleElement = document.getElementById("messageTitle");
    var textElement = document.getElementById("messageText");
    var iconElement = document.getElementById("messageIcon");

    if (titleElement) titleElement.textContent = title || "Message";
    if (textElement) textElement.textContent = text || "";
    if (iconElement) iconElement.textContent = icon || "✨";

    if (popup) popup.style.display = "flex";
}


function closeMessage() {
    var popup = document.getElementById("messagePopup");

    if (popup) {
        popup.style.display = "none";
    }
}


// =====================================================
// ACCOUNT
// =====================================================

function openAccount() {
    var popup = document.getElementById("accountPopup");

    if (!popup) return;

    popup.style.display = "flex";

    checkLoggedInUser();
}


function closeAccount() {
    var popup = document.getElementById("accountPopup");

    if (popup) {
        popup.style.display = "none";
    }
}


function showLoginScreen() {
    var createScreen =
        document.getElementById("createAccountScreen");

    var loginScreen =
        document.getElementById("loginScreen");

    var profileScreen =
        document.getElementById("profileScreen");

    if (createScreen) {
        createScreen.style.display = "none";
    }

    if (loginScreen) {
        loginScreen.style.display = "block";
    }

    if (profileScreen) {
        profileScreen.style.display = "none";
    }
}


function showCreateAccountScreen() {
    var createScreen =
        document.getElementById("createAccountScreen");

    var loginScreen =
        document.getElementById("loginScreen");

    var profileScreen =
        document.getElementById("profileScreen");

    if (createScreen) {
        createScreen.style.display = "block";
    }

    if (loginScreen) {
        loginScreen.style.display = "none";
    }

    if (profileScreen) {
        profileScreen.style.display = "none";
    }
}


function showProfileScreen() {
    var createScreen =
        document.getElementById("createAccountScreen");

    var loginScreen =
        document.getElementById("loginScreen");

    var profileScreen =
        document.getElementById("profileScreen");

    if (createScreen) {
        createScreen.style.display = "none";
    }

    if (loginScreen) {
        loginScreen.style.display = "none";
    }

    if (profileScreen) {
        profileScreen.style.display = "block";
    }

    loadProfile();
}


// =====================================================
// SIGN UP
// =====================================================

async function signUp() {
    var emailElement =
        document.getElementById("emailInput");

    var usernameElement =
        document.getElementById("usernameInput");

    var passwordElement =
        document.getElementById("passwordInput");

    if (!emailElement || !usernameElement || !passwordElement) {
        return;
    }

    var email =
        emailElement.value.trim();

    var username =
        usernameElement.value.trim();

    var password =
        passwordElement.value;

    if (!email || !username || !password) {
        showMessage(
            "Missing information",
            "Please fill in your email, username, and password.",
            "⚠️"
        );

        return;
    }

    if (username.length < 3) {
        showMessage(
            "Username too short",
            "Your username needs to be at least 3 characters.",
            "⚠️"
        );

        return;
    }

    if (password.length < 6) {
        showMessage(
            "Password too short",
            "Your password needs to be at least 6 characters.",
            "⚠️"
        );

        return;
    }

    try {
        var result =
            await window.supabaseClient.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        username: username
                    }
                }
            });

        if (result.error) {
            throw result.error;
        }

        currentUser =
            result.data.user;

        if (result.data.session) {
            showMessage(
                "Account created! 🎉",
                "Welcome to Clipfly, @" + username + "!",
                "🎉"
            );

            showProfileScreen();

        } else {
            showMessage(
                "Check your email 📧",
                "Your account was created. Check your email if Clipfly asks you to confirm your account.",
                "📧"
            );

            showLoginScreen();
        }

    } catch (error) {
        console.error(error);

        showMessage(
            "Couldn't create account",
            error.message || "Something went wrong.",
            "❌"
        );
    }
}


// =====================================================
// LOGIN
// =====================================================

async function logIn() {
    var emailElement =
        document.getElementById("loginEmailInput");

    var passwordElement =
        document.getElementById("loginPasswordInput");

    if (!emailElement || !passwordElement) {
        return;
    }

    var email =
        emailElement.value.trim();

    var password =
        passwordElement.value;

    if (!email || !password) {
        showMessage(
            "Missing information",
            "Enter your email and password.",
            "⚠️"
        );

        return;
    }

    try {
        var result =
            await window.supabaseClient.auth.signInWithPassword({
                email: email,
                password: password
            });

        if (result.error) {
            throw result.error;
        }

        currentUser =
            result.data.user;

        showMessage(
            "Welcome back! 👋",
            "You are now logged into Clipfly.",
            "👋"
        );

        showProfileScreen();

    } catch (error) {
        console.error(error);

        showMessage(
            "Login failed",
            error.message || "Incorrect email or password.",
            "❌"
        );
    }
}


// =====================================================
// LOG OUT
// =====================================================

async function logOut() {
    try {
        var result =
            await window.supabaseClient.auth.signOut();

        if (result.error) {
            throw result.error;
        }

        currentUser = null;

        showCreateAccountScreen();

        showMessage(
            "Logged out",
            "You have been logged out of Clipfly.",
            "👋"
        );

    } catch (error) {
        console.error(error);

        showMessage(
            "Logout failed",
            error.message || "Something went wrong.",
            "❌"
        );
    }
}


// =====================================================
// AUTHENTICATION
// =====================================================

var authReadyPromise = null;
var authStateSubscription = null;

function initializeAuth() {
    if (authReadyPromise) return authReadyPromise;

    authReadyPromise = (async function() {
        if (!window.supabaseClient) return null;

        if (!authStateSubscription) {
            var authListener = window.supabaseClient.auth.onAuthStateChange(
                function(event, session) {
                    currentUser = session && session.user ? session.user : null;
                    console.log(
                        "Clipfly auth state:",
                        event,
                        currentUser ? "logged in" : "logged out"
                    );
                }
            );

            if (authListener && authListener.data) {
                authStateSubscription = authListener.data.subscription;
            }
        }

        var sessionResult = await window.supabaseClient.auth.getSession();

        if (sessionResult.error) {
            console.error("Could not restore Clipfly login:", sessionResult.error);
            currentUser = null;
            return null;
        }

        if (
            sessionResult.data &&
            sessionResult.data.session &&
            sessionResult.data.session.user
        ) {
            currentUser = sessionResult.data.session.user;
            return currentUser;
        }

        currentUser = null;
        return null;
    })().catch(function(error) {
        console.error("Clipfly auth initialization failed:", error);
        currentUser = null;
        return null;
    });

    return authReadyPromise;
}

async function refreshCurrentUser() {
    await initializeAuth();

    if (!window.supabaseClient) {
        currentUser = null;
        return null;
    }

    try {
        var result = await window.supabaseClient.auth.getUser();

        if (result && result.data && result.data.user) {
            currentUser = result.data.user;
            return currentUser;
        }
    } catch (error) {
        console.error("Could not refresh Clipfly user:", error);
    }

    currentUser = null;
    return null;
}

async function checkLoggedInUser() {
    var user = await refreshCurrentUser();

    if (user) {
        showProfileScreen();
    } else {
        showCreateAccountScreen();
    }
}


// =====================================================
// PROFILE
// =====================================================

async function loadProfile() {
    if (!currentUser) {
        return;
    }

    var displayNameInput =
        document.getElementById("displayNameInput");

    var profileUsernameInput =
        document.getElementById("profileUsernameInput");

    var bioInput =
        document.getElementById("bioInput");

    var currentUsernameText =
        document.getElementById("currentUsernameText");

    var profilePicturePreview =
        document.getElementById("profilePicturePreview");

    var metadata =
        currentUser.user_metadata || {};

    var username =
        metadata.username || "";

    if (displayNameInput) {
        displayNameInput.value =
            metadata.display_name ||
            username ||
            "";
    }

    if (profileUsernameInput) {
        profileUsernameInput.value =
            username;
    }

    if (currentUsernameText) {
        currentUsernameText.textContent = "";

        if (username) {
            currentUsernameText.appendChild(
                document.createTextNode("Current username: @" + username)
            );

            var ownProfile = await getProfileById(currentUser.id);
            addVerifiedBadge(
                currentUsernameText,
                !!(ownProfile && ownProfile.verified)
            );
        }
    }

    if (bioInput) {
        bioInput.value =
            metadata.bio || "";
    }

    if (profilePicturePreview) {

        if (metadata.avatar_url) {

            profilePicturePreview.innerHTML =
                '<img src="' +
                metadata.avatar_url +
                '" alt="Profile picture">';

        } else {

            profilePicturePreview.textContent =
                "👤";
        }
    }
}


function previewProfilePicture() {
    var input =
        document.getElementById("profilePictureInput");

    var preview =
        document.getElementById("profilePicturePreview");

    if (
        !input ||
        !input.files ||
        !input.files[0] ||
        !preview
    ) {
        return;
    }

    selectedProfilePicture =
        input.files[0];

    var reader =
        new FileReader();

    reader.onload =
        function(event) {

            preview.innerHTML =
                '<img src="' +
                event.target.result +
                '" alt="Profile picture">';
        };

    reader.readAsDataURL(
        selectedProfilePicture
    );
}


async function saveProfile() {
    if (!currentUser) {

        showMessage(
            "Not logged in",
            "Please log in first.",
            "⚠️"
        );

        return;
    }

    var displayNameElement =
        document.getElementById("displayNameInput");

    var usernameElement =
        document.getElementById("profileUsernameInput");

    var bioElement =
        document.getElementById("bioInput");

    var displayName =
        displayNameElement
            ? displayNameElement.value.trim()
            : "";

    var username =
        usernameElement
            ? usernameElement.value.trim()
            : "";

    var bio =
        bioElement
            ? bioElement.value.trim()
            : "";

    try {

        var metadata =
            currentUser.user_metadata || {};

        var avatarURL =
            metadata.avatar_url || "";

        if (selectedProfilePicture) {

            var extension =
                selectedProfilePicture.name
                    .split(".")
                    .pop()
                    .toLowerCase();

            var avatarPath =
                currentUser.id +
                "/avatar." +
                extension;

            var avatarUpload =
                await window.supabaseClient
                    .storage
                    .from("avatars")
                    .upload(
                        avatarPath,
                        selectedProfilePicture,
                        {
                            cacheControl: "3600",
                            contentType:
                                selectedProfilePicture.type,
                            upsert: true
                        }
                    );

            if (avatarUpload.error) {
                throw avatarUpload.error;
            }

            var avatarResult =
                window.supabaseClient
                    .storage
                    .from("avatars")
                    .getPublicUrl(
                        avatarPath
                    );

            avatarURL =
                avatarResult.data.publicUrl +
                "?t=" +
                Date.now();
        }

        var updateResult =
            await window.supabaseClient.auth.updateUser({
                data: {
                    display_name: displayName,
                    username: username,
                    bio: bio,
                    avatar_url: avatarURL
                }
            });

        if (updateResult.error) {
            throw updateResult.error;
        }

        // Keep the public profiles table in sync so other users
        // can see this account's username and profile picture.
        var profileUpsertResult = await window.supabaseClient
            .from("profiles")
            .upsert({
                id: updateResult.data.user.id,
                username: username || displayName || "User",
                avatar_url: avatarURL || null
            }, {
                onConflict: "id"
            });

        if (profileUpsertResult.error) {
            console.warn(
                "Profile settings saved to Auth, but public profile sync failed:",
                profileUpsertResult.error
            );
        }

        currentUser =
            updateResult.data.user;

        selectedProfilePicture = null;

        loadProfile();

        showMessage(
            "Profile saved! 🎉",
            "Your Clipfly profile has been updated.",
            "✅"
        );

    } catch (error) {
        console.error(error);

        showMessage(
            "Couldn't save profile",
            error.message || "Something went wrong.",
            "❌"
        );
    }
}


// =====================================================
// UPLOAD POPUP
// =====================================================

(function lockUploadPopupUntilLogin() {
    var popup = document.getElementById("uploadPopup");
    if (popup) popup.style.display = "none";
})();

async function openUpload() {
    // Check the real Supabase session every time Upload is clicked.
    var authenticatedUser = await refreshCurrentUser();

    if (!authenticatedUser) {
        closeUpload();
        showMessage(
            "Log in required",
            "You need to be logged in to upload videos.",
            "🔒"
        );
        return;
    }

    currentUser = authenticatedUser;

    var popup =
        document.getElementById("uploadPopup");

    if (!popup) {
        return;
    }

    popup.style.display =
        "flex";

    var progressContainer =
        document.getElementById(
            "uploadProgressContainer"
        );

    if (progressContainer) {
        progressContainer.style.display =
            "none";
    }
}


function closeUpload() {
    var popup =
        document.getElementById("uploadPopup");

    if (popup) {
        popup.style.display =
            "none";
    }
}


function previewThumbnail() {
    var input =
        document.getElementById(
            "thumbnailFileInput"
        );

    var preview =
        document.getElementById(
            "thumbnailPreview"
        );

    if (
        !input ||
        !input.files ||
        !input.files[0] ||
        !preview
    ) {
        return;
    }

    var reader =
        new FileReader();

    reader.onload =
        function(event) {

            preview.innerHTML =
                '<img src="' +
                event.target.result +
                '" alt="Thumbnail preview">';
        };

    reader.readAsDataURL(
        input.files[0]
    );
}


// =====================================================
// FFMPEG - LOAD
// =====================================================

async function loadFFmpeg() {

    if (ffmpegLoaded && ffmpegInstance) {
        return ffmpegInstance;
    }

    if (ffmpegLoading) {

        while (ffmpegLoading) {
            await new Promise(function(resolve) {
                setTimeout(resolve, 200);
            });
        }

        return ffmpegInstance;
    }

    ffmpegLoading = true;

    try {

        console.log(
            "Loading FFmpeg..."
        );

        var ffmpegModule =
            await import(
                "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/+esm"
            );

        var utilModule =
            await import(
                "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.2/+esm"
            );

        var FFmpeg =
            ffmpegModule.FFmpeg;

        var toBlobURL =
            utilModule.toBlobURL;

        ffmpegInstance =
            new FFmpeg();

        var baseURL =
            "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd"; 
 
        var coreURL = 
            await toBlobURL( 
                baseURL + "/ffmpeg-core.js", 
                "text/javascript" 
            ); 
 
        var wasmURL = 
            await toBlobURL( 
                baseURL + "/ffmpeg-core.wasm", 
                "application/wasm" 
            ); 
 
        await ffmpegInstance.load({ 
            coreURL: coreURL, 
            wasmURL: wasmURL 
        }); 
 
        ffmpegLoaded = true; 
 
        console.log( 
            "FFmpeg loaded!" 
        ); 
 
        return ffmpegInstance; 
 
    } catch (error) { 
 
        console.error( 
            "FFmpeg failed to load:", 
            error 
        ); 
 
        ffmpegInstance = null; 
        ffmpegLoaded = false; 
 
        throw error; 
 
    } finally { 
 
        ffmpegLoading = false; 
    } 
} 
 
 
// ===================================================== 
// CHECK IF FILE NEEDS CONVERSION 
// ===================================================== 
 
function needsVideoConversion(file) { 
 
    if (!file) { 
        return false; 
    } 
 
    var name = 
        file.name 
            .toLowerCase(); 
 
    var type = 
        file.type 
            ? file.type.toLowerCase() 
            : ""; 
 
    return ( 
        name.endsWith(".mov") || 
        name.endsWith(".m4v") || 
        type === "video/quicktime" || 
        type === "video/x-m4v" 
    ); 
} 
 
 
// ===================================================== 
// CONVERT MOV/M4V TO MP4 
// ===================================================== 
 
async function convertVideoToMP4(file, progressText) { 
 
    console.log( 
        "Converting video to MP4..." 
    ); 
 
    if (progressText) { 
        progressText.textContent = 
            "Loading video converter..."; 
    } 
 
    var ffmpeg = 
        await loadFFmpeg(); 
 
    var inputExtension = 
        file.name 
            .split(".") 
            .pop() 
            .toLowerCase(); 
 
    var inputName = 
        "input." + 
        inputExtension; 
 
    var outputName = 
        "output.mp4"; 
 
 
    // Read original video. 
 
    var fileData = 
        new Uint8Array( 
            await file.arrayBuffer() 
        ); 
 
 
    if (progressText) { 
        progressText.textContent = 
            "Converting MOV to MP4..."; 
    } 
 
 
    // Write input file. 
 
    await ffmpeg.writeFile( 
        inputName, 
        fileData 
    ); 
 
 
    // Convert to H.264 + AAC MP4. 
    // This is widely supported by browsers. 
 
    await ffmpeg.exec([ 
        "-i", 
        inputName, 
 
        "-c:v", 
        "libx264", 
 
        "-preset", 
        "veryfast", 
 
        "-crf", 
        "23", 
 
        "-pix_fmt", 
        "yuv420p", 
 
        "-c:a", 
        "aac", 
 
        "-b:a", 
        "128k", 
 
        "-movflags", 
        "+faststart", 
 
        outputName 
    ]); 
 
 
    if (progressText) { 
        progressText.textContent = 
            "Finishing video conversion..."; 
    } 
 
 
    var outputData = 
        await ffmpeg.readFile( 
            outputName 
        ); 
 
 
    var convertedFile = 
        new File( 
            [ 
                outputData.buffer 
            ], 
            file.name 
                .replace(/\.[^/.]+$/, "") 
                + ".mp4", 
            { 
                type: "video/mp4", 
                lastModified: Date.now() 
            } 
        ); 
 
 
    // Clean FFmpeg files. 
 
    try { 
        await ffmpeg.deleteFile( 
            inputName 
        ); 
    } catch (e) { 
        console.log(e); 
    } 
 
    try { 
        await ffmpeg.deleteFile( 
            outputName 
        ); 
    } catch (e) { 
        console.log(e); 
    } 
 
 
    console.log( 
        "Video converted successfully!" 
    ); 
 
 
    return convertedFile; 
} 
 
 
// ===================================================== 
// UPLOAD VIDEO 
// ===================================================== 
 
async function uploadVideo() { 
 
    var titleElement = 
        document.getElementById( 
            "videoTitleInput" 
        ); 
 
    var videoInput = 
        document.getElementById( 
            "videoFileInput" 
        ); 
 
    var thumbnailInput = 
        document.getElementById( 
            "thumbnailFileInput" 
        ); 
 
    var uploadButton = 
        document.getElementById( 
            "uploadVideoButton" 
        ); 
 
    var progressContainer = 
        document.getElementById( 
            "uploadProgressContainer" 
        ); 
 
    var progressFill = 
        document.getElementById( 
            "uploadProgressFill" 
        ); 
 
    var progressText = 
        document.getElementById( 
            "uploadProgressText" 
        ); 
 
 
    if (!titleElement || !videoInput) { 
        return; 
    } 
 
 
    var title = 
        titleElement.value.trim(); 
 
    var file = 
        videoInput.files && 
        videoInput.files[0]; 
 
 
    var thumbnailFile = 
        thumbnailInput && 
        thumbnailInput.files && 
        thumbnailInput.files[0] 
            ? thumbnailInput.files[0] 
            : null; 
 
 
    if (!title) { 
 
        showMessage( 
            "Missing title", 
            "Give your video a title first.", 
            "⚠️" 
        ); 
 
        return; 
    } 
 
 
    if (!file) { 
 
        showMessage( 
            "No video selected", 
            "Choose a video file first.", 
            "⚠️" 
        ); 
 
        return; 
    } 
 
 
    // Supabase may still be restoring the saved browser session. 
    // Refresh the authenticated user immediately before uploading. 
    var authenticatedUser = await refreshCurrentUser(); 
 
    if (!authenticatedUser) { 
        showMessage( 
            "Log in required", 
            "You need to be logged in to upload videos.", 
            "🔒" 
        ); 
 
        return; 
    } 
 
    currentUser = authenticatedUser; 
 
 
    try { 
 
        if (uploadButton) { 
            uploadButton.disabled = true; 
            uploadButton.textContent = 
                "Preparing..."; 
        } 
 
 
        if (progressContainer) { 
            progressContainer.style.display = 
                "block"; 
        } 
 
 
        if (progressFill) { 
            progressFill.style.width = 
                "5%"; 
        } 
 
 
        // ================================================= 
        // CONVERT MOV/M4V 
        // ================================================= 
 
        var uploadFile = 
            file; 
 
 
        if (needsVideoConversion(file)) { 
 
            if (progressFill) { 
                progressFill.style.width = 
                    "10%"; 
            } 
 
            uploadFile = 
                await convertVideoToMP4( 
                    file, 
                    progressText 
                ); 
 
        } 
 
 
        // ================================================= 
        // PREPARE UPLOAD 
        // ================================================= 
 
        if (progressFill) { 
            progressFill.style.width = 
                "35%"; 
        } 
 
        if (progressText) { 
            progressText.textContent = 
                "Uploading video..."; 
        } 
 
        if (uploadButton) { 
            uploadButton.textContent = 
                "Uploading..."; 
        } 
 
 
        var username = 
            currentUser.user_metadata && 
            currentUser.user_metadata.username 
                ? currentUser.user_metadata.username 
                : "User"; 
 
 
        // ALWAYS UPLOAD AS MP4 AFTER CONVERSION. 
 
        var videoPath = 
            currentUser.id + 
            "/" + 
            Date.now() + 
            "-" + 
            Math.random() 
                .toString(36) 
                .substring(2, 10) + 
            ".mp4"; 
 
 
        // ================================================= 
        // UPLOAD VIDEO 
        // ================================================= 
 
        var videoUpload = 
            await window.supabaseClient 
                .storage 
                .from("videos") 
                .upload( 
                    videoPath, 
                    uploadFile, 
                    { 
                        cacheControl: "3600", 
                        contentType: 
                            "video/mp4", 
                        upsert: false 
                    } 
                ); 
 
 
        if (videoUpload.error) { 
            throw videoUpload.error; 
        } 
 
 
        if (progressFill) { 
            progressFill.style.width = 
                "70%"; 
        } 
 
 
        if (progressText) { 
            progressText.textContent = 
                "Getting video link..."; 
        } 
 
 
        var videoURLResult = 
            window.supabaseClient 
                .storage 
                .from("videos") 
                .getPublicUrl( 
                    videoPath 
                ); 
 
 
        var videoURL = 
            videoURLResult.data.publicUrl; 
 
 
        // ================================================= 
        // THUMBNAIL 
        // ================================================= 
 
        var thumbnailURL = 
            null; 
 
 
        if (thumbnailFile) { 
 
            if (progressText) { 
                progressText.textContent = 
                    "Uploading thumbnail..."; 
            } 
 
 
            var thumbnailExtension = 
                thumbnailFile.name 
                    .split(".") 
                    .pop() 
                    .toLowerCase(); 
 
 
            var thumbnailPath = 
                currentUser.id + 
                "/" + 
                Date.now() + 
                "-" + 
                Math.random() 
                    .toString(36) 
                    .substring(2, 10) + 
                "." + 
                thumbnailExtension; 
 
 
            var thumbnailUpload = 
                await window.supabaseClient 
                    .storage 
                    .from("thumbnails") 
                    .upload( 
                        thumbnailPath, 
                        thumbnailFile, 
                        { 
                            cacheControl: "3600", 
                            contentType: 
                                thumbnailFile.type || 
                                "image/jpeg", 
                            upsert: false 
                        } 
                    ); 
 
 
            if (thumbnailUpload.error) { 
                throw thumbnailUpload.error; 
            } 
 
 
            var thumbnailURLResult = 
                window.supabaseClient 
                    .storage 
                    .from("thumbnails") 
                    .getPublicUrl( 
                        thumbnailPath 
                    ); 
 
 
            thumbnailURL = 
                thumbnailURLResult.data.publicUrl; 
        } 
 
 
        // ================================================= 
        // PUBLISH 
        // ================================================= 
 
        if (progressFill) { 
            progressFill.style.width = 
                "90%"; 
        } 
 
 
        if (progressText) { 
            progressText.textContent = 
                "Publishing video..."; 
        } 
 
 
        var insertResult = 
            await window.supabaseClient 
                .from("videos") 
                .insert({ 
                    title: title, 
                    username: username, 
                    video_url: videoURL, 
                    thumbnail_url: thumbnailURL 
                }); 
 
 
        if (insertResult.error) { 
            throw insertResult.error; 
        } 
 
 
        // ================================================= 
        // COMPLETE 
        // ================================================= 
 
        if (progressFill) { 
            progressFill.style.width = 
                "100%"; 
        } 
 
 
        if (progressText) { 
            progressText.textContent = 
                "Upload complete! 🎉"; 
        } 
 
 
        titleElement.value = ""; 
 
        videoInput.value = ""; 
 
 
        if (thumbnailInput) { 
            thumbnailInput.value = ""; 
        } 
 
 
        var thumbnailPreview = 
            document.getElementById( 
                "thumbnailPreview" 
            ); 
 
 
        if (thumbnailPreview) { 
            thumbnailPreview.innerHTML = 
                "<span>🖼️ Thumbnail preview</span>"; 
        } 
 
 
        setTimeout( 
            function() { 
 
                closeUpload(); 
 
                showMessage( 
                    "Video uploaded! 🎉", 
                    "Your video is now on Clipfly.", 
                    "🎬" 
                ); 
 
                loadVideos(); 
 
            }, 
            700 
        ); 
 
 
    } catch (error) { 
 
        console.error( 
            "UPLOAD ERROR:", 
            error 
        ); 
 
 
        if (progressText) { 
            progressText.textContent = 
                "Upload failed."; 
        } 
 
 
        showMessage( 
            "Upload failed", 
            error.message || 
            "Something went wrong while uploading.", 
            "❌" 
        ); 
 
 
    } finally { 
 
        if (uploadButton) { 
 
            uploadButton.disabled = 
                false; 
 
            uploadButton.textContent = 
                "⬆ Upload Video"; 
        } 
    } 
} 
 
 
// ===================================================== 
// DELETE VIDEO 
// ===================================================== 
 
function getStoragePathFromPublicUrl(publicUrl, bucketName) { 
    if (!publicUrl || !bucketName) return null; 
 
    var marker = "/storage/v1/object/public/" + bucketName + "/"; 
    var index = publicUrl.indexOf(marker); 
 
    if (index === -1) return null; 
 
    var path = publicUrl.substring(index + marker.length).split("?")[0]; 
 
    try { 
        return decodeURIComponent(path); 
    } catch (error) { 
        return path; 
    } 
} 
 
async function deleteVideo(video) { 
    if (!video || !video.id) return; 
 
    var user = await refreshCurrentUser(); 
 
    if (!user) { 
        showMessage( 
            "Log in required", 
            "You need to be logged in to delete a video.", 
            "🔒" 
        ); 
        return; 
    } 
 
    if (!video.owner_id || video.owner_id !== user.id) { 
        showMessage( 
            "Not your video", 
            "You can only delete videos that you own.", 
            "🚫" 
        ); 
        return; 
    } 
 
    var confirmed = window.confirm( 
        'Delete "' + 
        (video.title || "this video") + 
        '"? This cannot be undone.' 
    ); 
 
    if (!confirmed) return; 
 
    try { 
        // Remove the actual video file from Storage. 
        var videoPath = getStoragePathFromPublicUrl( 
            video.video_url, 
            "videos" 
        ); 
 
        if (videoPath) { 
            var videoRemove = await window.supabaseClient 
                .storage 
                .from("videos") 
                .remove([videoPath]); 
 
            if (videoRemove.error) throw videoRemove.error; 
        } 
 
        // Remove the thumbnail if this video has one. 
        var thumbnailPath = getStoragePathFromPublicUrl( 
            video.thumbnail_url, 
            "thumbnails" 
        ); 
 
        if (thumbnailPath) { 
            var thumbnailRemove = await window.supabaseClient 
                .storage 
                .from("thumbnails") 
                .remove([thumbnailPath]); 
 
            if (thumbnailRemove.error) throw thumbnailRemove.error; 
        } 
 
        // Remove the database record. RLS makes sure only the owner can do this. 
        var databaseDelete = await window.supabaseClient 
            .from("videos") 
            .delete() 
            .eq("id", video.id); 
 
        if (databaseDelete.error) throw databaseDelete.error; 
 
        if (currentWatchingVideo && currentWatchingVideo.id === video.id) { 
            closeWatch(); 
        } 
 
        showMessage( 
            "Video deleted", 
            "Your video has been deleted from Clipfly.", 
            "🗑️" 
        ); 
 
        await loadVideos(); 
    } catch (error) { 
        console.error("DELETE VIDEO ERROR:", error); 
 
        showMessage( 
            "Delete failed", 
            error.message || "Something went wrong while deleting the video.", 
            "❌" 
        ); 
    } 
} 
 
function createVideoDeleteMenu(video) { 
    if (!video || !currentUser) return null; 
    if (!video.owner_id || video.owner_id !== currentUser.id) return null; 
 
    var wrapper = document.createElement("div"); 
    wrapper.style.position = "absolute"; 
    wrapper.style.top = "8px"; 
    wrapper.style.right = "8px"; 
    wrapper.style.zIndex = "20"; 
 
    var menuButton = document.createElement("button"); 
    menuButton.type = "button"; 
    menuButton.textContent = "⋯"; 
    menuButton.title = "Video options"; 
    menuButton.setAttribute("aria-label", "Video options"); 
    menuButton.style.width = "38px"; 
    menuButton.style.height = "38px"; 
    menuButton.style.border = "0"; 
    menuButton.style.borderRadius = "50%"; 
    menuButton.style.background = "rgba(0,0,0,0.78)"; 
    menuButton.style.color = "white"; 
    menuButton.style.fontSize = "25px"; 
    menuButton.style.lineHeight = "30px"; 
    menuButton.style.cursor = "pointer"; 
    menuButton.style.display = "flex"; 
    menuButton.style.alignItems = "center"; 
    menuButton.style.justifyContent = "center"; 
    menuButton.style.padding = "0 0 7px 0"; 
 
    var menu = document.createElement("div"); 
    menu.style.display = "none"; 
    menu.style.position = "absolute"; 
    menu.style.top = "44px"; 
    menu.style.right = "0"; 
    menu.style.minWidth = "155px"; 
    menu.style.background = "#181818"; 
    menu.style.border = "1px solid rgba(255,255,255,0.12)"; 
    menu.style.borderRadius = "10px"; 
    menu.style.padding = "6px"; 
    menu.style.boxShadow = "0 8px 25px rgba(0,0,0,0.45)"; 
 
    var deleteButton = document.createElement("button"); 
    deleteButton.type = "button"; 
    deleteButton.textContent = "🗑️  Delete video"; 
    deleteButton.style.width = "100%"; 
    deleteButton.style.border = "0"; 
    deleteButton.style.borderRadius = "7px"; 
    deleteButton.style.background = "transparent"; 
    deleteButton.style.color = "#ff6b6b"; 
    deleteButton.style.fontSize = "14px"; 
    deleteButton.style.textAlign = "left"; 
    deleteButton.style.padding = "10px 11px"; 
    deleteButton.style.cursor = "pointer"; 
 
    deleteButton.addEventListener("mouseenter", function() { 
        deleteButton.style.background = "rgba(255,70,70,0.12)"; 
    }); 
 
    deleteButton.addEventListener("mouseleave", function() { 
        deleteButton.style.background = "transparent"; 
    }); 
 
    menuButton.addEventListener("click", function(event) { 
        event.preventDefault(); 
        event.stopPropagation(); 
        menu.style.display = menu.style.display === "block" ? "none" : "block"; 
    }); 
 
    menu.addEventListener("click", function(event) { 
        event.stopPropagation(); 
    }); 
 
    deleteButton.addEventListener("click", async function(event) { 
        event.preventDefault(); 
        event.stopPropagation(); 
        menu.style.display = "none"; 
        await deleteVideo(video); 
    }); 
 
    menu.appendChild(deleteButton); 
    wrapper.appendChild(menuButton); 
    wrapper.appendChild(menu); 
 
    return wrapper; 
} 
 
 
// ===================================================== 
// LOAD VIDEOS 
// ===================================================== 
 
async function loadVideos() { 
 
    var grid = 
        document.getElementById( 
            "videoGrid" 
        ); 
 
    if (!grid) { 
        return; 
    } 
 
 
    try { 
 
        var result = 
            await window.supabaseClient 
                .from("videos") 
                .select("*") 
                .order("id", { 
                    ascending: false 
                }); 
 
 
        if (result.error) { 
            throw result.error; 
        } 
 
 
        displayVideos( 
            result.data || [] 
        ); 
 
 
    } catch (error) { 
 
        console.error(error); 
 
 
        grid.innerHTML = 
            '<div class="empty-videos">' + 
            '<h2>Could not load videos 😭</h2>' + 
            '<p>' + 
            (error.message || 
                "Something went wrong.") + 
            "</p>" + 
            "</div>"; 
    } 
} 
 
 
// ===================================================== 
// DISPLAY HOME VIDEOS 
// ===================================================== 
 
async function displayVideos(videos) { 
 
    var grid = 
        document.getElementById( 
            "videoGrid" 
        ); 
 
    if (!grid) { 
        return; 
    } 
 
 
    grid.innerHTML = ""; 
 
    var videoProfileMap = await getProfilesByIds( 
        (videos || []).map(function(video) { 
            return video.owner_id; 
        }) 
    ); 
 
 
    if (!videos || videos.length === 0) { 
 
        grid.innerHTML = 
            '<div class="empty-videos">' + 
            '<h2>No videos yet 🎬</h2>' + 
            '<p>Be the first person to upload a video!</p>' + 
            "</div>"; 
 
        return; 
    } 
 
 
    videos.forEach( 
        function(video) { 
 
            var card = 
                document.createElement( 
                    "div" 
                ); 
 
            card.className = 
                "clipfly-video-card"; 
 
            card.style.position = "relative"; 
 
            var deleteMenu = createVideoDeleteMenu(video); 
            if (deleteMenu) { 
                card.appendChild(deleteMenu); 
            } 
 
 
            card.onclick = 
                function() { 
                    watchVideo(video); 
                }; 
 
 
            // ================================================= 
            // THUMBNAIL 
            // ================================================= 
 
            var thumbnail = 
                document.createElement( 
                    "div" 
                ); 
 
            thumbnail.className = 
                "clipfly-thumbnail"; 
 
 
            if (video.thumbnail_url) { 
 
                var image = 
                    document.createElement( 
                        "img" 
                    ); 
 
                image.src = 
                    video.thumbnail_url; 
 
                image.alt = 
                    video.title || 
                    "Video thumbnail"; 
 
                image.loading = 
                    "lazy"; 
 
                thumbnail.appendChild( 
                    image 
                ); 
 
            } else { 
 
                thumbnail.innerHTML = 
                    "<span>🎬</span>"; 
            } 
 
 
            // ================================================= 
            // INFO 
            // ================================================= 
 
            var info = 
                document.createElement( 
                    "div" 
                ); 
 
            info.className = 
                "clipfly-video-info"; 
 
 
            var title = 
                document.createElement( 
                    "div" 
                ); 
 
            title.className = 
                "clipfly-video-title"; 
 
            title.textContent = 
                video.title || 
                "Untitled Video"; 
 
 
            var username = 
                document.createElement( 
                    "div" 
                ); 
 
            username.className = 
                "clipfly-video-user"; 
 
            username.textContent = 
                "@" + 
                (video.username || 
                    "User"); 
 
            var videoProfile = videoProfileMap[video.owner_id]; 
            addVerifiedBadge( 
                username, 
                !!(videoProfile && videoProfile.verified) 
            ); 
 
 
            info.appendChild(title); 
 
            info.appendChild(username); 
 
 
            card.appendChild( 
                thumbnail 
            ); 
 
            card.appendChild( 
                info 
            ); 
 
 
            grid.appendChild( 
                card 
            ); 
        } 
    ); 
} 
 
 
// ===================================================== 
// WATCH VIDEO 
// ===================================================== 
 
async function watchVideo(video) { 
 
    var popup = 
        document.getElementById( 
            "watchPopup" 
        ); 
 
    var player = 
        document.getElementById( 
            "watchVideo" 
        ); 
 
    var title = 
        document.getElementById( 
            "watchTitle" 
        ); 
 
    var username = 
        document.getElementById( 
            "watchUsername" 
        ); 
 
 
    if (!popup || !player || !video) { 
        return; 
    } 
 
 
    // Stop previous video. 
 
    player.pause(); 
 
    player.removeAttribute( 
        "src" 
    ); 
 
    player.removeAttribute( 
        "poster" 
    ); 
 
 
    // ================================================= 
    // ACTUAL VIDEO 
    // ================================================= 
 
    player.src = 
        video.video_url; 
 
    player.preload = 
        "auto"; 
 
 
    if (title) { 
        title.textContent = 
            video.title || 
            "Untitled Video"; 
    } 
 
 
    if (username) { 
        username.textContent = 
            "@" + 
            (video.username || 
                "User"); 
 
        var watchProfile = await getProfileById(video.owner_id); 
        addVerifiedBadge( 
            username, 
            !!(watchProfile && watchProfile.verified) 
        ); 
    } 
 
 
    popup.style.display = 
        "flex"; 
 
 
    // Load actual video. 
 
    player.load(); 
 
    currentWatchingVideo = video; 
    saveWatchHistory(video); 
 
    createWatchFeatures(); 
    loadSubscriptionButton(video.owner_id); 
    loadReactions(video.id); 
    loadComments(video.id); 
} 
 
 
// ===================================================== 
// CLICK VIDEO TO PLAY / PAUSE 
// ===================================================== 
 
function setupVideoClick() { 
 
    var player = 
        document.getElementById( 
            "watchVideo" 
        ); 
 
    if (!player) { 
        return; 
    } 
 
 
    player.addEventListener( 
        "click", 
        function(event) { 
 
            var rect = 
                player.getBoundingClientRect(); 
 
            var clickY = 
                event.clientY - 
                rect.top; 
 
            var videoHeight = 
                rect.height; 
 
 
            // Don't interfere with browser controls. 
 
            if ( 
                player.controls && 
                clickY > 
                videoHeight - 55 
            ) { 
                return; 
            } 
 
 
            if (player.paused) { 
 
                player.play() 
                    .catch( 
                        function(error) { 
                            console.log( 
                                "Video could not play:", 
                                error 
                            ); 
                        } 
                    ); 
 
            } else { 
 
                player.pause(); 
            } 
        } 
    ); 
} 
 
 
 
// ===================================================== 
// WATCH LIKES / DISLIKES / COMMENTS 
// ===================================================== 
 
function ensureChannelStyles() { 
    if (document.getElementById("clipflyChannelStyles")) return; 
 
    var style = document.createElement("style"); 
    style.id = "clipflyChannelStyles"; 
    style.textContent = ` 
        #clipflyChannelPopup { 
            position: fixed; 
            inset: 0; 
            z-index: 99999; 
            display: none; 
            align-items: center; 
            justify-content: center; 
            padding: 20px; 
            box-sizing: border-box; 
            background: rgba(0,0,0,0.78); 
        } 
        #clipflyChannelWindow { 
            width: min(950px, 100%); 
            max-height: 90vh; 
            overflow-y: auto; 
            box-sizing: border-box; 
            border-radius: 18px; 
            padding: 24px; 
            background: var(--bg, #151515); 
            color: inherit; 
            box-shadow: 0 20px 70px rgba(0,0,0,0.45); 
        } 
        #clipflyChannelHeader { 
            display: flex; 
            align-items: center; 
            gap: 16px; 
            margin-bottom: 24px; 
        } 
        #clipflyChannelAvatar { 
            width: 82px; 
            height: 82px; 
            min-width: 82px; 
            border-radius: 50%; 
            object-fit: cover; 
            background: rgba(255,255,255,0.08); 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            overflow: hidden; 
            font-size: 34px; 
        } 
        #clipflyChannelName { 
            margin: 0; 
            font-size: 28px; 
            font-weight: 800; 
        } 
        #clipflyChannelHandle { 
            margin-top: 5px; 
            opacity: 0.65; 
        } 
        #clipflyChannelClose { 
            margin-left: auto; 
            align-self: flex-start; 
            border: 0; 
            background: rgba(255,255,255,0.08); 
            color: inherit; 
            border-radius: 10px; 
            padding: 9px 12px; 
            cursor: pointer; 
            font-size: 18px; 
        } 
        #clipflyChannelVideosTitle { 
            font-size: 20px; 
            font-weight: 700; 
            margin: 0 0 14px; 
        } 
        #clipflyChannelVideoGrid { 
            display: grid; 
            grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); 
            gap: 16px; 
        } 
        .clipfly-channel-video { 
            border-radius: 14px; 
            overflow: hidden; 
            background: rgba(255,255,255,0.06); 
            cursor: pointer; 
            transition: transform 0.15s ease; 
        } 
        .clipfly-channel-video:hover { 
            transform: translateY(-2px); 
        } 
        .clipfly-channel-video-thumb { 
            width: 100%; 
            aspect-ratio: 16 / 9; 
            background: rgba(255,255,255,0.08); 
            overflow: hidden; 
        } 
        .clipfly-channel-video-thumb img { 
            width: 100%; 
            height: 100%; 
            object-fit: cover; 
            display: block; 
        } 
        .clipfly-channel-video-info { 
            padding: 10px 12px 12px; 
        } 
        .clipfly-verified-badge { 
            display: inline-flex; 
            align-items: center; 
            justify-content: center; 
            width: 18px; 
            height: 18px; 
            margin-left: 5px; 
            vertical-align: -3px; 
            flex: 0 0 auto; 
            cursor: help; 
            border-radius: 50%; 
            background: #2196f3; 
            color: #ffffff; 
            font-family: Arial, Helvetica, sans-serif; 
            font-size: 13px; 
            font-weight: 900; 
            line-height: 18px; 
            text-align: center; 
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.22); 
            box-sizing: border-box; 
        } 
 
        .clipfly-channel-video-title { 
            font-weight: 700; 
            overflow: hidden; 
            text-overflow: ellipsis; 
            white-space: nowrap; 
        } 
        .clipfly-channel-empty { 
            opacity: 0.65; 
            padding: 20px 0; 
        } 
        @media (max-width: 600px) { 
            #clipflyChannelWindow { 
                padding: 17px; 
            } 
            #clipflyChannelAvatar { 
                width: 65px; 
                height: 65px; 
                min-width: 65px; 
            } 
            #clipflyChannelName { 
                font-size: 22px; 
            } 
        } 
    `; 
    document.head.appendChild(style); 
} 
 
function ensureChannelPopup() { 
    ensureChannelStyles(); 
 
    if (document.getElementById("clipflyChannelPopup")) return; 
 
    var popup = document.createElement("div"); 
    popup.id = "clipflyChannelPopup"; 
 
    var windowElement = document.createElement("div"); 
    windowElement.id = "clipflyChannelWindow"; 
 
    var header = document.createElement("div"); 
    header.id = "clipflyChannelHeader"; 
 
    var avatar = document.createElement("div"); 
    avatar.id = "clipflyChannelAvatar"; 
 
    var nameArea = document.createElement("div"); 
    nameArea.style.minWidth = "0"; 
 
    var name = document.createElement("h2"); 
    name.id = "clipflyChannelName"; 
 
    var handle = document.createElement("div"); 
    handle.id = "clipflyChannelHandle"; 
 
    var closeButton = document.createElement("button"); 
    closeButton.id = "clipflyChannelClose"; 
    closeButton.type = "button"; 
    closeButton.textContent = "✕"; 
    closeButton.title = "Close channel"; 
    closeButton.addEventListener("click", function(event) { 
        event.stopPropagation(); 
        closeUserChannel(); 
    }); 
 
    nameArea.appendChild(name); 
    nameArea.appendChild(handle); 
 
    header.appendChild(avatar); 
    header.appendChild(nameArea); 
    header.appendChild(closeButton); 
 
    var videosTitle = document.createElement("div"); 
    videosTitle.id = "clipflyChannelVideosTitle"; 
    videosTitle.textContent = "Videos"; 
 
    var videoGrid = document.createElement("div"); 
    videoGrid.id = "clipflyChannelVideoGrid"; 
 
    windowElement.appendChild(header); 
    windowElement.appendChild(videosTitle); 
    windowElement.appendChild(videoGrid); 
    popup.appendChild(windowElement); 
 
    popup.addEventListener("click", function(event) { 
        if (event.target === popup) { 
            closeUserChannel(); 
        } 
    }); 
 
    document.body.appendChild(popup); 
} 
 
async function openUserChannel(username, avatarURL, userId) { 
    var cleanUsername = (username || "").trim(); 
 
    if (!cleanUsername) return; 
 
    ensureChannelPopup(); 
 
    currentChannelUser = { 
        username: cleanUsername, 
        avatar_url: avatarURL || null, 
        user_id: userId || null, 
        verified: false 
    }; 
 
    var popup = document.getElementById("clipflyChannelPopup"); 
    var avatar = document.getElementById("clipflyChannelAvatar"); 
    var name = document.getElementById("clipflyChannelName"); 
    var handle = document.getElementById("clipflyChannelHandle"); 
    var grid = document.getElementById("clipflyChannelVideoGrid"); 
 
    if (!popup || !avatar || !name || !handle || !grid) return; 
 
    var channelProfile = await getProfileById(userId); 
    var channelVerified = !!(channelProfile && channelProfile.verified); 
    currentChannelUser.verified = channelVerified; 
 
    name.textContent = ""; 
    name.appendChild(document.createTextNode(cleanUsername)); 
    addVerifiedBadge(name, channelVerified); 
    handle.textContent = "@" + cleanUsername; 
 
    avatar.innerHTML = ""; 
 
    if (avatarURL) { 
        var image = document.createElement("img"); 
        image.src = avatarURL; 
        image.alt = "Profile picture"; 
        image.style.width = "100%"; 
        image.style.height = "100%"; 
        image.style.objectFit = "cover"; 
        avatar.appendChild(image); 
    } else { 
        avatar.textContent = "👤"; 
    } 
 
    grid.innerHTML = 
        '<div class="clipfly-channel-empty">Loading videos...</div>'; 
 
    popup.style.display = "flex"; 
 
    try { 
        var channelQuery = window.supabaseClient 
            .from("videos") 
            .select("*") 
            .order("id", { ascending: false }); 
 
        var result; 
 
        if (userId) { 
            result = await channelQuery.eq("owner_id", userId); 
            if (!result.error && (!result.data || result.data.length === 0)) { 
                result = await window.supabaseClient 
                    .from("videos") 
                    .select("*") 
                    .eq("username", cleanUsername) 
                    .order("id", { ascending: false }); 
            } 
        } else { 
            result = await channelQuery.eq("username", cleanUsername); 
        } 
 
        if (result.error) throw result.error; 
 
        var videos = result.data || []; 
        grid.innerHTML = ""; 
 
        if (videos.length === 0) { 
            grid.innerHTML = 
                '<div class="clipfly-channel-empty">This channel has no videos yet.</div>'; 
            return; 
        } 
 
        videos.forEach(function(video) { 
            var card = document.createElement("div"); 
            card.className = "clipfly-channel-video"; 
 
            card.addEventListener("click", function(event) { 
                event.stopPropagation(); 
                closeUserChannel(); 
                watchVideo(video); 
            }); 
 
            var thumb = document.createElement("div"); 
            thumb.className = "clipfly-channel-video-thumb"; 
 
            if (video.thumbnail_url) { 
                var image = document.createElement("img"); 
                image.src = video.thumbnail_url; 
                image.alt = video.title || "Video thumbnail"; 
                image.loading = "lazy"; 
                thumb.appendChild(image); 
            } else { 
                thumb.textContent = "🎬"; 
                thumb.style.display = "flex"; 
                thumb.style.alignItems = "center"; 
                thumb.style.justifyContent = "center"; 
                thumb.style.fontSize = "30px"; 
            } 
 
            var info = document.createElement("div"); 
            info.className = "clipfly-channel-video-info"; 
 
            var title = document.createElement("div"); 
            title.className = "clipfly-channel-video-title"; 
            title.textContent = video.title || "Untitled Video"; 
 
            info.appendChild(title); 
            card.appendChild(thumb); 
            card.appendChild(info); 
            grid.appendChild(card); 
        }); 
    } catch (error) { 
        console.error("Could not load channel:", error); 
        grid.innerHTML = 
            '<div class="clipfly-channel-empty">Could not load this channel.</div>'; 
    } 
} 
 
function closeUserChannel() { 
    var popup = document.getElementById("clipflyChannelPopup"); 
 
    if (popup) { 
        popup.style.display = "none"; 
    } 
 
    currentChannelUser = null; 
} 
 
function ensureWatchFeatureStyles() { 
    if (document.getElementById("clipflyWatchFeatureStyles")) return; 
 
    var style = document.createElement("style"); 
    style.id = "clipflyWatchFeatureStyles"; 
    style.textContent = ` 
        #clipflyWatchExtra { 
            display: block !important; 
            width: min(900px, calc(100vw - 32px)) !important; 
            max-width: min(900px, calc(100vw - 32px)) !important; 
            box-sizing: border-box !important; 
            margin: 18px auto 30px !important; 
            padding: 0 !important; 
            color: inherit; 
            background: transparent !important; 
            min-height: 0 !important; 
            height: auto !important; 
            max-height: none !important; 
            flex: 0 0 auto !important; 
            overflow: visible !important; 
            align-self: center !important; 
        } 
        #clipflyReactionRow { 
            display: flex; 
            gap: 10px; 
            flex-wrap: wrap; 
            margin-bottom: 22px; 
        } 
        .clipfly-reaction-button { 
            border: 1px solid rgba(255,255,255,0.14); 
            background: rgba(255,255,255,0.07); 
            color: inherit; 
            border-radius: 12px; 
            padding: 10px 15px; 
            cursor: pointer; 
            font-size: 15px; 
        } 
        .clipfly-reaction-button:hover, 
        .clipfly-reaction-button.active { 
            background: rgba(80,140,255,0.22); 
        } 
        #clipflyCommentsTitle { 
            font-size: 20px; 
            font-weight: 700; 
            margin: 0 0 12px; 
        } 
        #clipflyCommentForm { 
            display: flex; 
            gap: 10px; 
            margin-bottom: 18px; 
        } 
        #clipflyCommentInput { 
            flex: 1; 
            min-width: 0; 
            box-sizing: border-box; 
            border: 1px solid rgba(255,255,255,0.14); 
            background: rgba(255,255,255,0.06); 
            color: inherit; 
            border-radius: 12px; 
            padding: 12px 14px; 
            outline: none; 
        } 
        #clipflyCommentSubmit { 
            border: 0; 
            border-radius: 12px; 
            padding: 0 17px; 
            cursor: pointer; 
            font-weight: 700; 
        } 
        .clipfly-comment { 
            display: flex; 
            gap: 12px; 
            padding: 13px 0; 
            border-top: 1px solid rgba(255,255,255,0.09); 
        } 
        .clipfly-comment-avatar { 
            width: 42px; 
            height: 42px; 
            min-width: 42px; 
            border-radius: 50%; 
            object-fit: cover; 
            background: rgba(255,255,255,0.08); 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            overflow: hidden; 
            font-size: 20px; 
        } 
        .clipfly-comment-body { 
            flex: 1; 
            min-width: 0; 
        } 
        .clipfly-comment-top { 
            display: flex; 
            align-items: center; 
            gap: 8px; 
            flex-wrap: wrap; 
            margin-bottom: 4px; 
        } 
        .clipfly-comment-username { 
            font-weight: 700; 
        } 
        .clipfly-comment-date { 
            opacity: 0.6; 
            font-size: 12px; 
        } 
        .clipfly-comment-text { 
            white-space: pre-wrap; 
            overflow-wrap: anywhere; 
        } 
        .clipfly-comment-delete { 
            margin-left: auto; 
            border: 0; 
            background: transparent; 
            color: inherit; 
            opacity: 0.6; 
            cursor: pointer; 
            padding: 5px 7px; 
            border-radius: 8px; 
        } 
        .clipfly-comment-delete:hover { 
            opacity: 1; 
            background: rgba(255,255,255,0.08); 
        } 
        #clipflyCommentsList { 
            width: 100%; 
            max-height: 420px; 
            overflow-y: auto; 
            overflow-x: hidden; 
            box-sizing: border-box; 
        } 
        .clipfly-comments-empty { 
            opacity: 0.65; 
            padding: 10px 0 18px; 
        } 
        @media (max-width: 600px) { 
            #clipflyCommentForm { flex-direction: column; } 
            #clipflyCommentSubmit { min-height: 42px; } 
        } 
    `; 
    document.head.appendChild(style); 
} 
 
function createWatchFeatures() { 
    ensureWatchFeatureStyles(); 
 
    var player = document.getElementById("watchVideo"); 
    var username = document.getElementById("watchUsername"); 
 
    if (!player || !document.getElementById("watchPopup")) { 
        return; 
    } 
 
    // Prevent duplicate controls when opening another video. 
    var oldExtra = document.getElementById("clipflyWatchExtra"); 
    if (oldExtra) { 
        oldExtra.remove(); 
    } 
 
    var container = document.createElement("div"); 
    container.id = "clipflyWatchExtra"; 
 
    var reactionRow = document.createElement("div"); 
    reactionRow.id = "clipflyReactionRow"; 
 
    var likeButton = document.createElement("button"); 
    likeButton.id = "clipflyLikeButton"; 
    likeButton.className = "clipfly-reaction-button"; 
    likeButton.type = "button"; 
    likeButton.textContent = "👍 Like 0"; 
    likeButton.addEventListener("click", function(event) { 
        event.stopPropagation(); 
        handleReaction("like"); 
    }); 
 
    var dislikeButton = document.createElement("button"); 
    dislikeButton.id = "clipflyDislikeButton"; 
    dislikeButton.className = "clipfly-reaction-button"; 
    dislikeButton.type = "button"; 
    dislikeButton.textContent = "👎 Dislike 0"; 
    dislikeButton.addEventListener("click", function(event) { 
        event.stopPropagation(); 
        handleReaction("dislike"); 
    }); 
 
    reactionRow.appendChild(likeButton); 
    reactionRow.appendChild(dislikeButton); 
 
    var subscribeButton = document.createElement("button"); 
    subscribeButton.id = "clipflySubscribeButton"; 
    subscribeButton.className = "clipfly-subscribe-button"; 
    subscribeButton.type = "button"; 
    subscribeButton.textContent = "Subscribe"; 
    subscribeButton.addEventListener("click", function(event) { 
        event.stopPropagation(); 
        toggleSubscription(currentWatchingVideo && currentWatchingVideo.owner_id); 
    }); 
 
    reactionRow.appendChild(subscribeButton); 
 
    if (currentWatchingVideo && 
        currentUser && 
        currentWatchingVideo.owner_id === currentUser.id) { 
 
        var deleteWatchButton = document.createElement("button"); 
        deleteWatchButton.id = "clipflyDeleteVideoButton"; 
        deleteWatchButton.className = "clipfly-reaction-button"; 
        deleteWatchButton.type = "button"; 
        deleteWatchButton.textContent = "🗑️ Delete video"; 
        deleteWatchButton.style.color = "#ff6b6b"; 
        deleteWatchButton.addEventListener("click", function(event) { 
            event.stopPropagation(); 
            deleteVideo(currentWatchingVideo); 
        }); 
 
        reactionRow.appendChild(deleteWatchButton); 
    } 
 
    var commentsTitle = document.createElement("div"); 
    commentsTitle.id = "clipflyCommentsTitle"; 
    commentsTitle.textContent = "Comments"; 
 
    var commentForm = document.createElement("div"); 
    commentForm.id = "clipflyCommentForm"; 
 
    var commentInput = document.createElement("input"); 
    commentInput.id = "clipflyCommentInput"; 
    commentInput.type = "text"; 
    commentInput.maxLength = 1000; 
    commentInput.placeholder = "Write a comment..."; 
    commentInput.autocomplete = "off"; 
    commentInput.addEventListener("keydown", function(event) { 
        if (event.key === "Enter" && !event.shiftKey) { 
            event.preventDefault(); 
            submitComment(); 
        } 
    }); 
 
    var commentSubmit = document.createElement("button"); 
    commentSubmit.id = "clipflyCommentSubmit"; 
    commentSubmit.type = "button"; 
    commentSubmit.textContent = "Comment"; 
    commentSubmit.addEventListener("click", function(event) { 
        event.stopPropagation(); 
        submitComment(); 
    }); 
 
    commentForm.appendChild(commentInput); 
    commentForm.appendChild(commentSubmit); 
 
    var commentsList = document.createElement("div"); 
    commentsList.id = "clipflyCommentsList"; 
 
    container.appendChild(reactionRow); 
    container.appendChild(commentsTitle); 
    container.appendChild(commentForm); 
    container.appendChild(commentsList); 
 
    // Put the feature section OUTSIDE the element that contains the video. 
    // Some Clipfly watch layouts give that element a large black/flex height. 
    // If comments are inserted inside it, the whole area expands into a huge 
    // black rectangle. We instead make the features a sibling of the watch box. 
    var watchPopup = document.getElementById("watchPopup"); 
    var watchBox = username && username.parentElement ? username.parentElement : null; 
 
    if (watchBox && watchBox.parentElement) { 
        watchBox.parentElement.insertBefore(container, watchBox.nextSibling); 
    } else if (watchPopup) { 
        watchPopup.appendChild(container); 
    } else { 
        return; 
    } 
 
    // Keep the feature section from inheriting any full-height/flex behavior 
    // from the watch layout. 
    container.style.flex = "0 0 auto"; 
    container.style.height = "auto"; 
    container.style.minHeight = "0"; 
    container.style.maxHeight = "none"; 
} 
 
async function loadSubscriptionButton(channelId) { 
    var button = document.getElementById("clipflySubscribeButton"); 
    if (!button || !channelId) return; 
 
    if (!currentUser || currentUser.id === channelId) { 
        button.style.display = currentUser && currentUser.id === channelId ? "none" : "inline-block"; 
        return; 
    } 
 
    button.style.display = "inline-block"; 
    try { 
        var result = await window.supabaseClient 
            .from("subscriptions") 
            .select("id") 
            .eq("subscriber_id", currentUser.id) 
            .eq("channel_id", channelId) 
            .maybeSingle(); 
        if (result.error) throw result.error; 
 
        var subscribed = !!result.data; 
        button.textContent = subscribed ? "Subscribed" : "Subscribe"; 
        button.classList.toggle("subscribed", subscribed); 
    } catch (error) { 
        console.error("Could not load subscription:", error); 
    } 
} 
 
async function toggleSubscription(channelId) { 
    if (!channelId) return; 
 
    if (!currentUser) { 
        showMessage("Log in required", "You need to be logged in to subscribe to creators.", "🔒"); 
        return; 
    } 
 
    if (currentUser.id === channelId) return; 
 
    try { 
        var existing = await window.supabaseClient 
            .from("subscriptions") 
            .select("id") 
            .eq("subscriber_id", currentUser.id) 
            .eq("channel_id", channelId) 
            .maybeSingle(); 
        if (existing.error) throw existing.error; 
 
        if (existing.data) { 
            var deleteResult = await window.supabaseClient 
                .from("subscriptions") 
                .delete() 
                .eq("id", existing.data.id) 
                .eq("subscriber_id", currentUser.id); 
            if (deleteResult.error) throw deleteResult.error; 
        } else { 
            var insertResult = await window.supabaseClient 
                .from("subscriptions") 
                .insert({ 
                    subscriber_id: currentUser.id, 
                    channel_id: channelId 
                }); 
            if (insertResult.error) throw insertResult.error; 
        } 
 
        await loadSubscriptionButton(channelId); 
    } catch (error) { 
        console.error("Subscription failed:", error); 
        showMessage("Subscription failed", error.message || "Could not update your subscription.", "❌"); 
    } 
} 
 
async function loadReactions(videoId) { 
    var likeButton = document.getElementById("clipflyLikeButton"); 
    var dislikeButton = document.getElementById("clipflyDislikeButton"); 
    if (!likeButton || !dislikeButton || !videoId) return; 
 
    try { 
        var result = await window.supabaseClient 
            .from("video_reactions") 
            .select("user_id, reaction") 
            .eq("video_id", videoId); 
 
        if (result.error) throw result.error; 
 
        var rows = result.data || []; 
        var likes = rows.filter(function(row) { 
            return row.reaction === "like"; 
        }).length; 
        var dislikes = rows.filter(function(row) { 
            return row.reaction === "dislike"; 
        }).length; 
 
        var myReaction = currentUser 
            ? rows.find(function(row) { 
                return row.user_id === currentUser.id; 
            }) 
            : null; 
 
        likeButton.textContent = "👍 Like " + likes; 
        dislikeButton.textContent = "👎 Dislike " + dislikes; 
        likeButton.classList.toggle( 
            "active", 
            !!myReaction && myReaction.reaction === "like" 
        ); 
        dislikeButton.classList.toggle( 
            "active", 
            !!myReaction && myReaction.reaction === "dislike" 
        ); 
    } catch (error) { 
        console.error("Could not load reactions:", error); 
    } 
} 
 
async function handleReaction(reaction) { 
    if (!currentUser) { 
        showMessage( 
            "Log in required", 
            "You need to be logged in to like or dislike videos.", 
            "🔒" 
        ); 
        return; 
    } 
 
    if (!currentWatchingVideo || !currentWatchingVideo.id) return; 
 
    try { 
        var existingResult = await window.supabaseClient 
            .from("video_reactions") 
            .select("id, reaction") 
            .eq("video_id", currentWatchingVideo.id) 
            .eq("user_id", currentUser.id) 
            .maybeSingle(); 
 
        if (existingResult.error) throw existingResult.error; 
 
        var existing = existingResult.data; 
 
        if (existing && existing.reaction === reaction) { 
            var deleteResult = await window.supabaseClient 
                .from("video_reactions") 
                .delete() 
                .eq("id", existing.id) 
                .eq("user_id", currentUser.id); 
            if (deleteResult.error) throw deleteResult.error; 
        } else if (existing) { 
            var updateResult = await window.supabaseClient 
                .from("video_reactions") 
                .update({ reaction: reaction }) 
                .eq("id", existing.id) 
                .eq("user_id", currentUser.id); 
            if (updateResult.error) throw updateResult.error; 
        } else { 
            var insertResult = await window.supabaseClient 
                .from("video_reactions") 
                .insert({ 
                    video_id: currentWatchingVideo.id, 
                    user_id: currentUser.id, 
                    reaction: reaction 
                }); 
            if (insertResult.error) throw insertResult.error; 
        } 
 
        await loadReactions(currentWatchingVideo.id); 
    } catch (error) { 
        console.error("Reaction failed:", error); 
        showMessage( 
            "Reaction failed", 
            error.message || "Could not save your reaction.", 
            "❌" 
        ); 
    } 
} 
 
async function loadComments(videoId) { 
    var list = document.getElementById("clipflyCommentsList"); 
    if (!list || !videoId) return; 
 
    list.innerHTML = 
        '<div class="clipfly-comments-empty">Loading comments...</div>'; 
 
    try { 
        var result = await window.supabaseClient 
            .from("video_comments") 
            .select( 
                "id, video_id, user_id, username, avatar_url, comment, created_at" 
            ) 
            .eq("video_id", videoId) 
            .order("created_at", { ascending: false }); 
 
        if (result.error) throw result.error; 
 
        var comments = result.data || []; 
        var commentProfileMap = await getProfilesByIds( 
            comments.map(function(comment) { 
                return comment.user_id; 
            }) 
        ); 
        list.innerHTML = ""; 
 
        if (comments.length === 0) { 
            list.innerHTML = 
                '<div class="clipfly-comments-empty">No comments yet. Be the first! 💬</div>'; 
            return; 
        } 
 
        comments.forEach(function(comment) { 
            var item = document.createElement("div"); 
            item.className = "clipfly-comment"; 
 
            var avatar = document.createElement("div"); 
            avatar.className = "clipfly-comment-avatar"; 
 
            // Clicking a commenter's profile picture opens their channel. 
            avatar.style.cursor = "pointer"; 
            avatar.title = "Open @" + (comment.username || "User") + "'s channel"; 
 
            avatar.addEventListener("click", function(event) { 
                event.stopPropagation(); 
                openUserChannel( 
                    comment.username || "User", 
                    comment.avatar_url || null, 
                    comment.user_id || null 
                ); 
            }); 
 
            if (comment.avatar_url) { 
                var image = document.createElement("img"); 
                image.src = comment.avatar_url; 
                image.alt = "Profile picture"; 
                image.className = "clipfly-comment-avatar"; 
                image.style.cursor = "pointer"; 
                avatar.appendChild(image); 
            } else { 
                avatar.textContent = "👤"; 
            } 
 
            var body = document.createElement("div"); 
            body.className = "clipfly-comment-body"; 
 
            var top = document.createElement("div"); 
            top.className = "clipfly-comment-top"; 
 
            var username = document.createElement("span"); 
            username.className = "clipfly-comment-username"; 
            username.textContent = "@" + (comment.username || "User"); 
 
            var commentProfile = commentProfileMap[comment.user_id]; 
            addVerifiedBadge( 
                username, 
                !!(commentProfile && commentProfile.verified) 
            ); 
 
            var date = document.createElement("span"); 
            date.className = "clipfly-comment-date"; 
 
            var dateValue = new Date(comment.created_at); 
            date.textContent = dateValue.toLocaleDateString( 
                undefined, 
                { 
                    year: "numeric", 
                    month: "short", 
                    day: "numeric" 
                } 
            ); 
 
            top.appendChild(username); 
            top.appendChild(date); 
 
            // Only the owner of this comment gets the delete button. 
            if (currentUser && comment.user_id === currentUser.id) { 
                var deleteButton = document.createElement("button"); 
                deleteButton.className = "clipfly-comment-delete"; 
                deleteButton.type = "button"; 
                deleteButton.title = "Delete comment"; 
                deleteButton.textContent = "🗑️"; 
 
                deleteButton.addEventListener("click", function(event) { 
                    event.stopPropagation(); 
                    deleteComment(comment.id); 
                }); 
 
                top.appendChild(deleteButton); 
            } 
 
            var commentText = document.createElement("div"); 
            commentText.className = "clipfly-comment-text"; 
            commentText.textContent = comment.comment; 
 
            body.appendChild(top); 
            body.appendChild(commentText); 
 
            item.appendChild(avatar); 
            item.appendChild(body); 
            list.appendChild(item); 
        }); 
    } catch (error) { 
        console.error("Could not load comments:", error); 
        list.innerHTML = 
            '<div class="clipfly-comments-empty">Could not load comments.</div>'; 
    } 
} 
 
async function submitComment() { 
    if (!currentUser) { 
        showMessage( 
            "Log in required", 
            "You need to be logged in to comment on videos.", 
            "🔒" 
        ); 
        return; 
    } 
 
    if (!currentWatchingVideo || !currentWatchingVideo.id) return; 
 
    var input = document.getElementById("clipflyCommentInput"); 
    if (!input) return; 
 
    var commentText = input.value.trim(); 
    if (!commentText) return; 
 
    var metadata = currentUser.user_metadata || {}; 
    var username = metadata.username || "User"; 
    var avatarURL = metadata.avatar_url || null; 
 
    try { 
        var submitButton = document.getElementById( 
            "clipflyCommentSubmit" 
        ); 
 
        if (submitButton) { 
            submitButton.disabled = true; 
            submitButton.textContent = "Posting..."; 
        } 
 
        var result = await window.supabaseClient 
            .from("video_comments") 
            .insert({ 
                video_id: currentWatchingVideo.id, 
                user_id: currentUser.id, 
                username: username, 
                avatar_url: avatarURL, 
                comment: commentText 
            }); 
 
        if (result.error) throw result.error; 
 
        input.value = ""; 
        await loadComments(currentWatchingVideo.id); 
    } catch (error) { 
        console.error("Comment failed:", error); 
        showMessage( 
            "Comment failed", 
            error.message || "Could not post your comment.", 
            "❌" 
        ); 
    } finally { 
        var button = document.getElementById("clipflyCommentSubmit"); 
        if (button) { 
            button.disabled = false; 
            button.textContent = "Comment"; 
        } 
    } 
} 
 
async function deleteComment(commentId) { 
    if (!currentUser || !commentId) return; 
 
    if (!window.confirm("Delete your comment?")) return; 
 
    try { 
        var result = await window.supabaseClient 
            .from("video_comments") 
            .delete() 
            .eq("id", commentId) 
            .eq("user_id", currentUser.id); 
 
        if (result.error) throw result.error; 
 
        if (currentWatchingVideo && currentWatchingVideo.id) { 
            await loadComments(currentWatchingVideo.id); 
        } 
    } catch (error) { 
        console.error("Delete comment failed:", error); 
        showMessage( 
            "Delete failed", 
            error.message || "Could not delete your comment.", 
            "❌" 
        ); 
    } 
} 
 
 
// ===================================================== 
// CLIPFLY SIDEBAR NAVIGATION 
// ===================================================== 
 
var currentClipflySection = "home"; 
 
function ensureNavigationStyles() { 
    if (document.getElementById("clipflyNavigationStyles")) return; 
 
    var style = document.createElement("style"); 
    style.id = "clipflyNavigationStyles"; 
    style.textContent = ` 
        .clipfly-section-loading, 
        .clipfly-section-empty { 
            width: 100%; 
            padding: 50px 20px; 
            box-sizing: border-box; 
            text-align: center; 
            opacity: 0.72; 
        } 
        .clipfly-section-empty h2 { 
            margin: 0 0 8px; 
            opacity: 1; 
        } 
        .clipfly-section-empty p { 
            margin: 0; 
        } 
        .clipfly-sidebar-active { 
            background: rgba(75, 140, 255, 0.18) !important; 
            color: #ffffff !important; 
        } 
        .clipfly-subscribe-button { 
            border: 0; 
            border-radius: 10px; 
            padding: 9px 15px; 
            background: #3478ff; 
            color: white; 
            cursor: pointer; 
            font-weight: 700; 
            margin-left: 10px; 
        } 
        .clipfly-subscribe-button.subscribed { 
            background: rgba(255,255,255,0.12); 
        } 
    `; 
    document.head.appendChild(style); 
} 
 
function setSidebarActive(section) { 
    var buttons = document.querySelectorAll(".sidebar button"); 
    buttons.forEach(function(button) { 
        button.classList.remove("clipfly-sidebar-active"); 
    }); 
 
    var map = { 
        home: 0, 
        trending: 1, 
        shorts: 2, 
        subscriptions: 3, 
        history: 4, 
        liked: 5, 
        library: 6 
    }; 
 
    var index = map[section]; 
    if (index === undefined || !buttons[index]) return; 
    buttons[index].classList.add("clipfly-sidebar-active"); 
} 
 
function setSectionTitle(title) { 
    var main = document.querySelector(".main-content"); 
    if (!main) return; 
 
    var heading = main.querySelector("h1"); 
    if (heading) heading.textContent = title; 
} 
 
function showSectionMessage(title, text) { 
    var grid = document.getElementById("videoGrid"); 
    if (!grid) return; 
 
    grid.innerHTML = 
        '<div class="clipfly-section-empty">' + 
        '<h2>' + escapeHTML(title) + '</h2>' + 
        '<p>' + escapeHTML(text) + '</p>' + 
        '</div>'; 
} 
 
function escapeHTML(value) { 
    return String(value || "") 
        .replace(/&/g, "&amp;") 
        .replace(/</g, "&lt;") 
        .replace(/>/g, "&gt;") 
        .replace(/"/g, "&quot;") 
        .replace(/'/g, "&#039;"); 
} 
 
function saveWatchHistory(video) { 
    if (!video || !video.id) return; 
 
    try { 
        var history = JSON.parse(localStorage.getItem("clipfly_watch_history") || "[]"); 
        history = history.filter(function(id) { 
            return id !== video.id; 
        }); 
        history.unshift(video.id); 
        history = history.slice(0, 100); 
        localStorage.setItem("clipfly_watch_history", JSON.stringify(history)); 
    } catch (error) { 
        console.error("Could not save watch history:", error); 
    } 
} 
 
function getWatchHistoryIds() { 
    try { 
        var history = JSON.parse(localStorage.getItem("clipfly_watch_history") || "[]"); 
        return Array.isArray(history) ? history : []; 
    } catch (error) { 
        return []; 
    } 
} 
 
async function openClipflySection(section) { 
    closeWatch(); 
    closeUserChannel(); 
    ensureNavigationStyles(); 
 
    currentClipflySection = section; 
    setSidebarActive(section); 
 
    var grid = document.getElementById("videoGrid"); 
    if (!grid) return; 
 
    var titles = { 
        home: "Recommended", 
        trending: "Trending", 
        shorts: "Shorts", 
        subscriptions: "Subscriptions", 
        history: "History", 
        liked: "Liked Videos", 
        library: "Library" 
    }; 
 
    setSectionTitle(titles[section] || "Clipfly"); 
    grid.innerHTML = '<div class="clipfly-section-loading">Loading...</div>'; 
 
    if (section === "home") { 
        await loadVideos(); 
        return; 
    } 
 
    if (section === "trending") { 
        await loadTrendingVideos(); 
        return; 
    } 
 
    if (section === "shorts") { 
        await loadShortVideos(); 
        return; 
    } 
 
    if (section === "subscriptions") { 
        await loadSubscriptionVideos(); 
        return; 
    } 
 
    if (section === "history") { 
        await loadHistoryVideos(); 
        return; 
    } 
 
    if (section === "liked") { 
        await loadLikedVideos(); 
        return; 
    } 
 
    if (section === "library") { 
        await loadLibraryVideos(); 
    } 
} 
 
async function loadTrendingVideos() { 
    try { 
        var videosResult = await window.supabaseClient 
            .from("videos") 
            .select("*"); 
        if (videosResult.error) throw videosResult.error; 
 
        var reactionsResult = await window.supabaseClient 
            .from("video_reactions") 
            .select("video_id, reaction"); 
        if (reactionsResult.error) throw reactionsResult.error; 
 
        var scores = {}; 
        (reactionsResult.data || []).forEach(function(row) { 
            if (!scores[row.video_id]) scores[row.video_id] = 0; 
            scores[row.video_id] += row.reaction === "like" ? 2 : -1; 
        }); 
 
        var videos = videosResult.data || []; 
        videos.sort(function(a, b) { 
            var scoreA = scores[a.id] || 0; 
            var scoreB = scores[b.id] || 0; 
            if (scoreA !== scoreB) return scoreB - scoreA; 
            return String(b.id).localeCompare(String(a.id)); 
        }); 
 
        displayVideos(videos); 
    } catch (error) { 
        console.error("Could not load trending videos:", error); 
        showSectionMessage("Couldn't load Trending", error.message || "Something went wrong."); 
    } 
} 
 
async function loadShortVideos() { 
    try { 
        var result = await window.supabaseClient 
            .from("videos") 
            .select("*") 
            .order("id", { ascending: false }); 
        if (result.error) throw result.error; 
 
        var videos = (result.data || []).filter(function(video) { 
            var title = String(video.title || "").toLowerCase(); 
            return title.includes("#shorts") || title.includes("#short"); 
        }); 
 
        if (videos.length === 0) { 
            showSectionMessage( 
                "No Shorts yet", 
                "Upload a video with #shorts in the title to put it here." 
            ); 
            return; 
        } 
 
        displayVideos(videos); 
    } catch (error) { 
        console.error("Could not load shorts:", error); 
        showSectionMessage("Couldn't load Shorts", error.message || "Something went wrong."); 
    } 
} 
 
async function loadHistoryVideos() { 
    var ids = getWatchHistoryIds(); 
    if (ids.length === 0) { 
        showSectionMessage("No watch history", "Videos you watch will appear here."); 
        return; 
    } 
 
    try { 
        var result = await window.supabaseClient 
            .from("videos") 
            .select("*") 
            .in("id", ids); 
        if (result.error) throw result.error; 
 
        var map = {}; 
        (result.data || []).forEach(function(video) { 
            map[video.id] = video; 
        }); 
 
        var videos = ids.map(function(id) { 
            return map[id]; 
        }).filter(Boolean); 
 
        if (videos.length === 0) { 
            showSectionMessage("No watch history", "Videos you watch will appear here."); 
            return; 
        } 
 
        displayVideos(videos); 
    } catch (error) { 
        console.error("Could not load history:", error); 
        showSectionMessage("Couldn't load History", error.message || "Something went wrong."); 
    } 
} 
 
async function loadLikedVideos() { 
    if (!currentUser) { 
        showSectionMessage("Log in required", "Log in to see your liked videos."); 
        return; 
    } 
 
    try { 
        var reactionsResult = await window.supabaseClient 
            .from("video_reactions") 
            .select("video_id") 
            .eq("user_id", currentUser.id) 
            .eq("reaction", "like"); 
        if (reactionsResult.error) throw reactionsResult.error; 
 
        var ids = (reactionsResult.data || []).map(function(row) { 
            return row.video_id; 
        }); 
 
        if (ids.length === 0) { 
            showSectionMessage("No liked videos", "Videos you like will appear here."); 
            return; 
        } 
 
        var result = await window.supabaseClient 
            .from("videos") 
            .select("*") 
            .in("id", ids); 
        if (result.error) throw result.error; 
 
        displayVideos(result.data || []); 
    } catch (error) { 
        console.error("Could not load liked videos:", error); 
        showSectionMessage("Couldn't load Liked Videos", error.message || "Something went wrong."); 
    } 
} 
 
async function loadLibraryVideos() { 
    if (!currentUser) { 
        showSectionMessage("Log in required", "Log in to see your Clipfly library."); 
        return; 
    } 
 
    try { 
        var result = await window.supabaseClient 
            .from("videos") 
            .select("*") 
            .eq("owner_id", currentUser.id) 
            .order("id", { ascending: false }); 
        if (result.error) throw result.error; 
 
        if (!result.data || result.data.length === 0) { 
            showSectionMessage("Your library is empty", "Videos you upload will appear here."); 
            return; 
        } 
 
        displayVideos(result.data); 
    } catch (error) { 
        console.error("Could not load library:", error); 
        showSectionMessage("Couldn't load Library", error.message || "Something went wrong."); 
    } 
} 
 
function ensureSubscriptionChannelStyles() {
    if (document.getElementById("clipflySubscriptionChannelStyles")) {
        return;
    }

    var style = document.createElement("style");
    style.id = "clipflySubscriptionChannelStyles";

    style.textContent = `
        .clipfly-subscription-channel-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 18px;
            width: 100%;
        }

        .clipfly-subscription-channel-card {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 18px;
            border-radius: 18px;
            background: #050505 !important;
            border: 1px solid rgba(255, 255, 255, 0.14);
            color: #ffffff !important;
            cursor: pointer;
            transition: transform 0.15s ease, box-shadow 0.15s ease;
            min-height: 100px;
            box-sizing: border-box;
        }

        .clipfly-subscription-channel-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
        }

        .clipfly-subscription-channel-avatar {
            width: 72px;
            height: 72px;
            min-width: 72px;
            border-radius: 50%;
            overflow: hidden;
            background: #171717;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 30px;
        }

        .clipfly-subscription-channel-avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }

        .clipfly-subscription-channel-info {
            min-width: 0;
            flex: 1;
            display: block !important;
            color: #ffffff !important;
        }

        .clipfly-subscription-channel-name {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 6px;
            font-size: 19px;
            font-weight: 700;
            color: #ffffff !important;
            word-break: break-word;
        }

        .clipfly-subscription-channel-label {
            margin-top: 6px;
            font-size: 14px;
            opacity: 0.72;
            color: #ffffff !important;
        }

        @media (max-width: 600px) {
            .clipfly-subscription-channel-grid {
                grid-template-columns: 1fr;
            }

            .clipfly-subscription-channel-card {
                padding: 14px;
            }

            .clipfly-subscription-channel-avatar {
                width: 60px;
                height: 60px;
                min-width: 60px;
            }
        }
    `;

    document.head.appendChild(style);
}

async function loadSubscriptionVideos() {
    if (!currentUser) {
        showSectionMessage(
            "Log in required",
            "Log in to see your subscriptions."
        );
        return;
    }

    try {
        var subResult = await window.supabaseClient
            .from("subscriptions")
            .select("channel_id")
            .eq("subscriber_id", currentUser.id);

        if (subResult.error) {
            throw subResult.error;
        }

        var channelIds = (subResult.data || []).map(function(row) {
            return row.channel_id;
        });

        if (channelIds.length === 0) {
            showSectionMessage(
                "No subscriptions yet",
                "Subscribe to creators to see their channels here."
            );
            return;
        }

        /*
         * Subscriptions now shows CHANNELS instead of individual videos.
         * We get the subscribed users from the profiles table.
         */
        var profilesResult = await window.supabaseClient
            .from("profiles")
            .select("id, username, avatar_url, verified")
            .in("id", channelIds);

        if (profilesResult.error) {
            throw profilesResult.error;
        }

        var profiles = profilesResult.data || [];
        var profileMap = {};

        profiles.forEach(function(profile) {
            profileMap[profile.id] = profile;
        });

        /*
         * If a subscribed user does not have a profiles row yet,
         * use their video data as a fallback so their channel can
         * still appear in Subscriptions.
         */
        var missingIds = channelIds.filter(function(channelId) {
            return !profileMap[channelId];
        });

        if (missingIds.length > 0) {
            var fallbackVideosResult = await window.supabaseClient
                .from("videos")
                .select("owner_id, username")
                .in("owner_id", missingIds);

            if (!fallbackVideosResult.error) {
                (fallbackVideosResult.data || []).forEach(function(video) {
                    if (
                        video.owner_id &&
                        !profileMap[video.owner_id]
                    ) {
                        profileMap[video.owner_id] = {
                            id: video.owner_id,
                            username: video.username || "User",
                            avatar_url: null,
                            verified: false
                        };
                    }
                });
            }
        }

        var grid = document.getElementById("videoGrid");

        if (!grid) {
            return;
        }

        grid.innerHTML = "";

        ensureSubscriptionChannelStyles();

        var channelGrid = document.createElement("div");
        channelGrid.className = "clipfly-subscription-channel-grid";

        var foundChannels = 0;

        /*
         * Keep the same order as the subscriptions table returned it.
         */
        channelIds.forEach(function(channelId) {
            var profile = profileMap[channelId];

            if (!profile) {
                return;
            }

            foundChannels++;

            var card = document.createElement("div");
            card.className = "clipfly-subscription-channel-card";

            var avatarWrap = document.createElement("div");
            avatarWrap.className = "clipfly-subscription-channel-avatar";

            if (profile.avatar_url) {
                var avatar = document.createElement("img");
                avatar.src = profile.avatar_url;
                avatar.alt = "Profile picture";
                avatar.loading = "lazy";

                avatar.onerror = function() {
                    avatar.remove();
                    avatarWrap.textContent = "👤";
                };

                avatarWrap.appendChild(avatar);
            } else {
                avatarWrap.textContent = "👤";
            }

            var info = document.createElement("div");
            info.className = "clipfly-subscription-channel-info";

            var name = document.createElement("div");
            name.className = "clipfly-subscription-channel-name";
            name.textContent = profile.username || "User";

            addVerifiedBadge(name, !!profile.verified);

            var label = document.createElement("div");
            label.className = "clipfly-subscription-channel-label";
            label.textContent = "Subscribed channel";

            info.appendChild(name);
            info.appendChild(label);

            card.appendChild(avatarWrap);
            card.appendChild(info);

            card.addEventListener("click", function() {
                openUserChannel(
                    profile.username || "User",
                    profile.avatar_url || null,
                    profile.id
                );
            });

            channelGrid.appendChild(card);
        });

        if (foundChannels === 0) {
            showSectionMessage(
                "No channels found",
                "Your subscriptions exist, but their channel profiles could not be loaded yet."
            );
            return;
        }

        grid.appendChild(channelGrid);
    } catch (error) {
        console.error("Could not load subscriptions:", error);

        showSectionMessage(
            "Couldn't load Subscriptions",
            error.message || "Something went wrong."
        );
    }
}

function home() { 
    var searchInput = document.getElementById("searchInput"); 
    if (searchInput) searchInput.value = ""; 
    openClipflySection("home"); 
} 
 
function openTrending() { 
    openClipflySection("trending"); 
} 
 
function openShorts() { 
    openClipflySection("shorts"); 
} 
 
function openSubscriptions() { 
    openClipflySection("subscriptions"); 
} 
 
function openHistory() { 
    openClipflySection("history"); 
} 
 
function openLikedVideos() { 
    openClipflySection("liked"); 
} 
 
function openLibrary() { 
    openClipflySection("library"); 
} 
 
// ===================================================== 
// CLOSE WATCH 
// ===================================================== 
 
function closeWatch() { 
    var extra = 
        document.getElementById("clipflyWatchExtra"); 
 
    if (extra) { 
        extra.remove(); 
    } 
 
    currentWatchingVideo = null; 
 
    var popup = 
        document.getElementById( 
            "watchPopup" 
        ); 
 
    var player = 
        document.getElementById( 
            "watchVideo" 
        ); 
 
 
    if (player) { 
 
        player.pause(); 
 
        player.removeAttribute( 
            "src" 
        ); 
 
        player.removeAttribute( 
            "poster" 
        ); 
 
        player.load(); 
    } 
 
 
    if (popup) { 
        popup.style.display = 
            "none"; 
    } 
} 
 
 
// ===================================================== 
// HOME 
// ===================================================== 
 
 
 
// ===================================================== 
// SEARCH 
// ===================================================== 
 
async function searchVideos() { 
 
    var searchInput = 
        document.getElementById( 
            "searchInput" 
        ); 
 
    var grid = 
        document.getElementById( 
            "videoGrid" 
        ); 
 
 
    if (!searchInput || !grid) { 
        return; 
    } 
 
 
    var search = 
        searchInput.value.trim(); 
 
 
    if (!search) { 
        loadVideos(); 
        return; 
    } 
 
 
    try { 
 
        var result = 
            await window.supabaseClient 
                .from("videos") 
                .select("*") 
                .ilike( 
                    "title", 
                    "%" + search + "%" 
                ) 
                .order( 
                    "id", 
                    { 
                        ascending: false 
                    } 
                ); 
 
 
        if (result.error) { 
            throw result.error; 
        } 
 
 
        displayVideos( 
            result.data || [] 
        ); 
 
 
    } catch (error) { 
 
        console.error(error); 
 
 
        showMessage( 
            "Search failed", 
            error.message || 
            "Something went wrong.", 
            "❌" 
        ); 
    } 
} 
 
 
// ===================================================== 
// COMING SOON 
// ===================================================== 
 
function comingSoon(name) { 
    openClipflySection(String(name || "").toLowerCase()); 
} 
 
 
// ===================================================== 
// POPUP BACKGROUND CLICK 
// ===================================================== 
 
window.addEventListener( 
    "click", 
    function(event) { 
 
        var accountPopup = 
            document.getElementById( 
                "accountPopup" 
            ); 
 
        var uploadPopup = 
            document.getElementById( 
                "uploadPopup" 
            ); 
 
        var messagePopup = 
            document.getElementById( 
                "messagePopup" 
            ); 
 
        var watchPopup = 
            document.getElementById( 
                "watchPopup" 
            ); 
 
 
        if ( 
            event.target === 
            accountPopup 
        ) { 
            closeAccount(); 
        } 
 
 
        if ( 
            event.target === 
            uploadPopup 
        ) { 
            closeUpload(); 
        } 
 
 
        if ( 
            event.target === 
            messagePopup 
        ) { 
            closeMessage(); 
        } 
 
 
        if ( 
            event.target === 
            watchPopup 
        ) { 
            closeWatch(); 
        } 
    } 
); 
 
 
// ===================================================== 
// ESCAPE KEY 
// ===================================================== 
 
window.addEventListener( 
    "keydown", 
    function(event) { 
 
        if (event.key !== "Escape") { 
            return; 
        } 
 
        closeAccount(); 
        closeUpload(); 
        closeMessage(); 
        closeUserChannel(); 
        closeWatch(); 
    } 
); 
 
 
// ===================================================== 
// START CLIPFLY 
// ===================================================== 
 
document.addEventListener( 
    "DOMContentLoaded", 
    async function() { 
 
        console.log( 
            "Clipfly starting..." 
        ); 
 
 
        if (!window.supabaseClient) { 
 
            console.error( 
                "Supabase client is missing!" 
            ); 
 
            return; 
        } 
 
 
        setupVideoClick(); 
 
        // Restore the saved Supabase session before login/upload checks. 
        await initializeAuth(); 
        await checkLoggedInUser(); 
 
        await loadVideos(); 
 
 
        console.log( 
            "Clipfly loaded! 🎬" 
        ); 
    } 
); 
 
if (document.readyState === "loading") { 
    document.addEventListener("DOMContentLoaded", startCheckmarkConverter); 
} else { 
    startCheckmarkConverter(); 
}