(function () {
    "use strict";

    /*
     * Change Language: every account picks its own language.
     * The choice is saved on the account (user_metadata.language) and the
     * page is translated with Google's free website translator.
     */

    var COOKIE_NAME = "googtrans";
    var PAGE_LANG = "en";

    // [code, English name, native name]
    var LANGUAGES = [
        ["af", "Afrikaans", "Afrikaans"],
        ["sq", "Albanian", "Shqip"],
        ["am", "Amharic", "አማርኛ"],
        ["ar", "Arabic", "العربية"],
        ["hy", "Armenian", "Հայերեն"],
        ["as", "Assamese", "অসমীয়া"],
        ["ay", "Aymara", "Aymar aru"],
        ["az", "Azerbaijani", "Azərbaycanca"],
        ["bm", "Bambara", "Bamanankan"],
        ["eu", "Basque", "Euskara"],
        ["be", "Belarusian", "Беларуская"],
        ["bn", "Bengali", "বাংলা"],
        ["bho", "Bhojpuri", "भोजपुरी"],
        ["bs", "Bosnian", "Bosanski"],
        ["bg", "Bulgarian", "Български"],
        ["my", "Burmese (Myanmar)", "မြန်မာ"],
        ["ca", "Catalan", "Català"],
        ["ceb", "Cebuano", "Cebuano"],
        ["ny", "Chichewa", "Chichewa"],
        ["zh-CN", "Chinese (Simplified)", "简体中文"],
        ["zh-TW", "Chinese (Traditional)", "繁體中文"],
        ["co", "Corsican", "Corsu"],
        ["hr", "Croatian", "Hrvatski"],
        ["cs", "Czech", "Čeština"],
        ["da", "Danish", "Dansk"],
        ["dv", "Dhivehi", "ދިވެހި"],
        ["doi", "Dogri", "डोगरी"],
        ["nl", "Dutch", "Nederlands"],
        ["en", "English", "English"],
        ["eo", "Esperanto", "Esperanto"],
        ["et", "Estonian", "Eesti"],
        ["ee", "Ewe", "Eʋegbe"],
        ["tl", "Filipino", "Filipino"],
        ["fi", "Finnish", "Suomi"],
        ["fr", "French", "Français"],
        ["fy", "Frisian", "Frysk"],
        ["gl", "Galician", "Galego"],
        ["ka", "Georgian", "ქართული"],
        ["de", "German", "Deutsch"],
        ["el", "Greek", "Ελληνικά"],
        ["gn", "Guarani", "Avañe'ẽ"],
        ["gu", "Gujarati", "ગુજરાતી"],
        ["ht", "Haitian Creole", "Kreyòl ayisyen"],
        ["ha", "Hausa", "Hausa"],
        ["haw", "Hawaiian", "ʻŌlelo Hawaiʻi"],
        ["iw", "Hebrew", "עברית"],
        ["hi", "Hindi", "हिन्दी"],
        ["hmn", "Hmong", "Hmoob"],
        ["hu", "Hungarian", "Magyar"],
        ["is", "Icelandic", "Íslenska"],
        ["ig", "Igbo", "Igbo"],
        ["ilo", "Ilocano", "Ilokano"],
        ["id", "Indonesian", "Bahasa Indonesia"],
        ["ga", "Irish", "Gaeilge"],
        ["it", "Italian", "Italiano"],
        ["ja", "Japanese", "日本語"],
        ["jw", "Javanese", "Basa Jawa"],
        ["kn", "Kannada", "ಕನ್ನಡ"],
        ["kk", "Kazakh", "Қазақша"],
        ["km", "Khmer", "ខ្មែរ"],
        ["rw", "Kinyarwanda", "Ikinyarwanda"],
        ["gom", "Konkani", "कोंकणी"],
        ["ko", "Korean", "한국어"],
        ["kri", "Krio", "Krio"],
        ["ku", "Kurdish (Kurmanji)", "Kurdî"],
        ["ckb", "Kurdish (Sorani)", "کوردی"],
        ["ky", "Kyrgyz", "Кыргызча"],
        ["lo", "Lao", "ລາວ"],
        ["la", "Latin", "Latina"],
        ["lv", "Latvian", "Latviešu"],
        ["ln", "Lingala", "Lingála"],
        ["lt", "Lithuanian", "Lietuvių"],
        ["lg", "Luganda", "Luganda"],
        ["lb", "Luxembourgish", "Lëtzebuergesch"],
        ["mk", "Macedonian", "Македонски"],
        ["mai", "Maithili", "मैथिली"],
        ["mg", "Malagasy", "Malagasy"],
        ["ms", "Malay", "Bahasa Melayu"],
        ["ml", "Malayalam", "മലയാളം"],
        ["mt", "Maltese", "Malti"],
        ["mi", "Maori", "Māori"],
        ["mr", "Marathi", "मराठी"],
        ["mni-Mtei", "Meiteilon (Manipuri)", "ꯃꯤꯇꯩꯂꯣꯟ"],
        ["lus", "Mizo", "Mizo ṭawng"],
        ["mn", "Mongolian", "Монгол"],
        ["ne", "Nepali", "नेपाली"],
        ["nso", "Northern Sotho (Sepedi)", "Sesotho sa Leboa"],
        ["no", "Norwegian", "Norsk"],
        ["or", "Odia (Oriya)", "ଓଡ଼ିଆ"],
        ["om", "Oromo", "Afaan Oromoo"],
        ["ps", "Pashto", "پښتو"],
        ["fa", "Persian", "فارسی"],
        ["pl", "Polish", "Polski"],
        ["pt", "Portuguese", "Português"],
        ["pa", "Punjabi", "ਪੰਜਾਬੀ"],
        ["qu", "Quechua", "Runasimi"],
        ["ro", "Romanian", "Română"],
        ["ru", "Russian", "Русский"],
        ["sm", "Samoan", "Gagana Samoa"],
        ["sa", "Sanskrit", "संस्कृतम्"],
        ["gd", "Scots Gaelic", "Gàidhlig"],
        ["sr", "Serbian", "Српски"],
        ["st", "Sesotho", "Sesotho"],
        ["sn", "Shona", "ChiShona"],
        ["sd", "Sindhi", "سنڌي"],
        ["si", "Sinhala", "සිංහල"],
        ["sk", "Slovak", "Slovenčina"],
        ["sl", "Slovenian", "Slovenščina"],
        ["so", "Somali", "Soomaali"],
        ["es", "Spanish", "Español"],
        ["su", "Sundanese", "Basa Sunda"],
        ["sw", "Swahili", "Kiswahili"],
        ["sv", "Swedish", "Svenska"],
        ["tg", "Tajik", "Тоҷикӣ"],
        ["ta", "Tamil", "தமிழ்"],
        ["tt", "Tatar", "Татарча"],
        ["te", "Telugu", "తెలుగు"],
        ["th", "Thai", "ไทย"],
        ["ti", "Tigrinya", "ትግርኛ"],
        ["ts", "Tsonga", "Xitsonga"],
        ["tr", "Turkish", "Türkçe"],
        ["tk", "Turkmen", "Türkmençe"],
        ["ak", "Twi (Akan)", "Twi"],
        ["uk", "Ukrainian", "Українська"],
        ["ur", "Urdu", "اردو"],
        ["ug", "Uyghur", "ئۇيغۇرچە"],
        ["uz", "Uzbek", "Oʻzbekcha"],
        ["vi", "Vietnamese", "Tiếng Việt"],
        ["cy", "Welsh", "Cymraeg"],
        ["xh", "Xhosa", "isiXhosa"],
        ["yi", "Yiddish", "ייִדיש"],
        ["yo", "Yoruba", "Yorùbá"],
        ["zu", "Zulu", "isiZulu"]
    ];

    var currentLanguage = PAGE_LANG;   // the language saved on the logged-in account
    var appliedLanguage = PAGE_LANG;   // what the page is showing right now
    var applyToken = 0;
    var scriptInjected = false;
    var supported = null;              // languages Google can translate to
    var busy = false;
    var searchText = "";

    function byId(id) {
        return document.getElementById(id);
    }

    function mk(tag, className, text) {
        var node = document.createElement(tag);

        if (className) {
            node.className = className;
        }

        if (text !== undefined) {
            node.textContent = text;
        }

        return node;
    }

    async function getUser() {
        if (window.currentUser) {
            return window.currentUser;
        }

        if (typeof refreshCurrentUser === "function") {
            try {
                return await refreshCurrentUser();
            } catch (error) {
                return null;
            }
        }

        return null;
    }

    /*
     * =========================================
     * COOKIE (tells Google which language to start in)
     * =========================================
     */

    function setTranslateCookie(code) {
        try {
            document.cookie =
                COOKIE_NAME + "=/" + PAGE_LANG + "/" + code + "; path=/";
        } catch (error) {
            console.warn(error);
        }
    }

    function clearTranslateCookie() {
        var expire = "; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
        var host = location.hostname;
        var parts = host.split(".");

        try {
            document.cookie = COOKIE_NAME + "=" + expire;
            document.cookie = COOKIE_NAME + "=" + expire + "; domain=" + host;

            for (var i = 0; i < parts.length - 1; i++) {
                document.cookie =
                    COOKIE_NAME +
                    "=" +
                    expire +
                    "; domain=." +
                    parts.slice(i).join(".");
            }
        } catch (error) {
            console.warn(error);
        }
    }

    // Reloads the page, but never in a loop.
    function reloadOnce() {
        try {
            var last = Number(sessionStorage.getItem("clipfly_lang_reload") || 0);

            if (Date.now() - last < 8000) {
                return;
            }

            sessionStorage.setItem("clipfly_lang_reload", String(Date.now()));

        } catch (error) {
            console.warn(error);
        }

        location.reload();
    }

    /*
     * =========================================
     * STYLES
     * =========================================
     */

    function ensureLanguageStyles() {
        if (byId("clipflyLanguageStyles")) {
            return;
        }

        var style = document.createElement("style");

        style.id = "clipflyLanguageStyles";

        style.textContent = `
            /* Hide Google's own translate bar and popups */
            iframe.goog-te-banner-frame,
            .goog-te-banner-frame.skiptranslate,
            iframe.VIpgJd-ZVi9od-ORHb-OEVmcd,
            .VIpgJd-ZVi9od-aZ2wEe-wOHMyf,
            .goog-te-balloon-frame,
            #goog-gt-tt,
            .goog-tooltip {
                display: none !important;
            }

            body {
                top: 0 !important;
            }

            .goog-text-highlight {
                background: none !important;
                box-shadow: none !important;
            }

            .cfl-note {
                color: #9ca8ba;
                line-height: 1.5;
                margin-bottom: 14px;
            }

            .cfl-status {
                min-height: 20px;
                margin: 10px 0;
                font-size: 14px;
            }

            .cfl-list {
                max-height: 50vh;
                overflow-y: auto;
                margin-top: 4px;
                padding-right: 4px;
            }

            .cfl-row {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 11px 12px;
                margin-bottom: 6px;
                border-radius: 10px;
                background: #101014;
                border: 1px solid #35353d;
                cursor: pointer;
            }

            .cfl-row:hover {
                border-color: #3478ff;
            }

            .cfl-row.current {
                cursor: default;
                border-color: #3478ff;
                background: rgba(52, 120, 255, 0.12);
            }

            .cfl-text {
                flex: 1;
                min-width: 0;
            }

            .cfl-english {
                font-weight: 700;
            }

            .cfl-native {
                font-size: 13px;
                color: #9ca8ba;
                margin-top: 2px;
            }

            .cfl-chip {
                font-size: 12px;
                font-weight: 800;
                color: #4b8cff;
                white-space: nowrap;
            }

            .cfl-empty {
                text-align: center;
                color: #9ca8ba;
                padding: 22px 0;
            }
        `;

        document.head.appendChild(style);
    }

    /*
     * =========================================
     * GOOGLE TRANSLATE (runs in the background)
     * =========================================
     */

    function ensureTranslateHost() {
        if (byId("google_translate_element")) {
            return;
        }

        var host = document.createElement("div");

        host.id = "google_translate_element";

        host.style.position = "fixed";
        host.style.left = "-9999px";
        host.style.top = "-9999px";
        host.style.width = "1px";
        host.style.height = "1px";
        host.style.overflow = "hidden";

        document.body.appendChild(host);
    }

    function waitForCombo(timeoutMs) {
        return new Promise(function (resolve) {
            var start = Date.now();

            (function check() {
                var combo = document.querySelector("select.goog-te-combo");

                if (combo && combo.options.length > 1) {
                    resolve(combo);
                    return;
                }

                if (Date.now() - start > timeoutMs) {
                    resolve(null);
                    return;
                }

                setTimeout(check, 250);
            })();
        });
    }

    function readSupported(combo) {
        var map = {};

        for (var i = 0; i < combo.options.length; i++) {
            var option = combo.options[i];

            if (!option.value) {
                continue;
            }

            map[option.value.toLowerCase()] = {
                value: option.value,
                label: option.text
            };
        }

        supported = map;
    }

    async function ensureTranslator(timeoutMs) {
        ensureLanguageStyles();
        ensureTranslateHost();

        if (!scriptInjected) {
            scriptInjected = true;

            window.clipflyTranslateInit = function () {
                try {
                    new google.translate.TranslateElement(
                        { pageLanguage: PAGE_LANG, autoDisplay: false },
                        "google_translate_element"
                    );
                } catch (error) {
                    console.warn("Could not start the translator:", error);
                }
            };

            var script = document.createElement("script");

            script.src =
                "https://translate.google.com/translate_a/element.js?cb=clipflyTranslateInit";

            script.async = true;

            script.onerror = function () {
                scriptInjected = false;
            };

            document.head.appendChild(script);
        }

        var combo = await waitForCombo(timeoutMs || 20000);

        if (combo) {
            readSupported(combo);
        }

        return combo;
    }

    function setTranslatorLanguage(combo, code) {
        var wanted = code.toLowerCase();
        var value = null;

        for (var i = 0; i < combo.options.length; i++) {
            if (combo.options[i].value.toLowerCase() === wanted) {
                value = combo.options[i].value;
                break;
            }
        }

        if (!value) {
            return false;
        }

        combo.value = value;
        combo.dispatchEvent(new Event("change"));

        // Try once more if Google didn't pick it up.
        setTimeout(function () {
            var cls = document.documentElement.className || "";

            if (cls.indexOf("translated-") === -1) {
                var again = document.querySelector("select.goog-te-combo");

                if (again) {
                    again.value = value;
                    again.dispatchEvent(new Event("change"));
                }
            }
        }, 1500);

        return true;
    }

    // Returns true when the page is (or will be) in that language.
    async function applyLanguage(code) {
        code = code || PAGE_LANG;

        var token = ++applyToken;

        if (code === PAGE_LANG) {
            clearTranslateCookie();

            if (appliedLanguage !== PAGE_LANG) {
                // Going back to the original English page needs a fresh load.
                reloadOnce();
            }

            return true;
        }

        if (code === appliedLanguage) {
            return true;
        }

        setTranslateCookie(code);

        var combo = await ensureTranslator(20000);

        if (token !== applyToken) {
            return true;
        }

        if (!combo) {
            return false;
        }

        var ok = setTranslatorLanguage(combo, code);

        if (ok) {
            appliedLanguage = code;
        }

        return ok;
    }

    /*
     * =========================================
     * THE LANGUAGE LIST (A to Z)
     * =========================================
     */

    function buildLanguageList() {
        var list = LANGUAGES.map(function (item) {
            return { code: item[0], english: item[1], native: item[2] };
        });

        if (supported) {
            // Only show languages Google can really translate to.
            list = list.filter(function (item) {
                return item.code === PAGE_LANG || supported[item.code.toLowerCase()];
            });

            // Anything Google supports that isn't in our list yet.
            var known = {};

            list.forEach(function (item) {
                known[item.code.toLowerCase()] = true;
            });

            Object.keys(supported).forEach(function (low) {
                if (!known[low] && low !== PAGE_LANG) {
                    list.push({
                        code: supported[low].value,
                        english: supported[low].label,
                        native: ""
                    });
                }
            });
        }

        list.sort(function (a, b) {
            return a.english.localeCompare(b.english);
        });

        return list;
    }

    function englishNameFor(code) {
        var list = buildLanguageList();

        for (var i = 0; i < list.length; i++) {
            if (list[i].code.toLowerCase() === String(code).toLowerCase()) {
                return list[i].english;
            }
        }

        return code;
    }

    /*
     * =========================================
     * THE CHANGE LANGUAGE WINDOW
     * =========================================
     */

    function ensureLanguagePopup() {
        var popup = byId("clipflyLanguagePopup");

        if (popup) {
            return popup;
        }

        popup = mk("div", "popup");

        popup.id = "clipflyLanguagePopup";
        popup.style.display = "none";
        popup.style.zIndex = "2100";

        var box = mk("div", "popup-box");

        box.style.width = "min(480px, 94vw)";

        var close = mk("button", "close-button", "✕");

        close.type = "button";
        close.addEventListener("click", closeLanguageWindow);

        var body = mk("div");

        body.id = "clipflyLanguageBody";

        box.appendChild(close);
        box.appendChild(body);
        popup.appendChild(box);

        popup.addEventListener("click", function (event) {
            if (event.target === popup) {
                closeLanguageWindow();
            }
        });

        document.body.appendChild(popup);

        return popup;
    }

    function closeLanguageWindow() {
        var popup = byId("clipflyLanguagePopup");

        if (popup) {
            popup.style.display = "none";
        }
    }

    function setLanguageStatus(text, isError) {
        var node = byId("clipflyLanguageStatus");

        if (!node) {
            return;
        }

        node.textContent = text || "";
        node.style.color = isError ? "#f87171" : "#9ca8ba";
    }

    function renderLanguageRows() {
        var list = byId("clipflyLanguageList");

        if (!list) {
            return;
        }

        list.innerHTML = "";

        var query = searchText.trim().toLowerCase();

        var items = buildLanguageList().filter(function (item) {
            return (
                !query ||
                item.english.toLowerCase().indexOf(query) !== -1 ||
                item.native.toLowerCase().indexOf(query) !== -1
            );
        });

        if (items.length === 0) {
            list.appendChild(mk("div", "cfl-empty", "No languages found."));
            return;
        }

        items.forEach(function (item) {
            var isCurrent =
                item.code.toLowerCase() === currentLanguage.toLowerCase();

            var row = mk("div", "cfl-row" + (isCurrent ? " current" : ""));

            var text = mk("div", "cfl-text");

            text.appendChild(
                mk(
                    "div",
                    "cfl-english",
                    item.english + (item.code === PAGE_LANG ? " (default)" : "")
                )
            );

            if (item.native && item.native !== item.english) {
                text.appendChild(mk("div", "cfl-native", item.native));
            }

            row.appendChild(text);

            if (isCurrent) {
                row.appendChild(mk("span", "cfl-chip", "Current"));
            } else {
                row.addEventListener("click", function () {
                    chooseLanguage(item.code);
                });
            }

            list.appendChild(row);
        });
    }

    function renderLanguageWindow(notice) {
        var body = byId("clipflyLanguageBody");

        if (!body) {
            return;
        }

        body.innerHTML = "";

        body.appendChild(mk("h2", "", "🌐 Change language"));

        body.appendChild(
            mk(
                "p",
                "cfl-note",
                "Pick the language Clipfly shows in for this account. It's saved to your account, so each account can use its own language. Translations are done automatically by Google Translate."
            )
        );

        if (notice) {
            var warning = mk("p", "cfl-note", notice);

            warning.style.color = "#fbbf24";

            body.appendChild(warning);
        }

        var searchWrap = mk("div", "account-form");

        var search = document.createElement("input");

        search.type = "text";
        search.placeholder = "Search languages...";
        search.autocomplete = "off";
        search.value = searchText;

        search.addEventListener("input", function () {
            searchText = search.value;
            renderLanguageRows();
        });

        searchWrap.appendChild(search);

        body.appendChild(searchWrap);

        var status = mk("div", "cfl-status");

        status.id = "clipflyLanguageStatus";

        body.appendChild(status);

        // Keep the language names themselves from being translated.
        var list = mk("div", "cfl-list notranslate");

        list.id = "clipflyLanguageList";
        list.setAttribute("translate", "no");

        body.appendChild(list);

        renderLanguageRows();
    }

    async function openLanguageWindow() {
        ensureLanguageStyles();

        var popup = ensureLanguagePopup();
        var body = byId("clipflyLanguageBody");

        searchText = "";

        body.innerHTML = "";
        body.appendChild(mk("h2", "", "🌐 Change language"));
        body.appendChild(mk("p", "cfl-note", "Loading languages..."));

        popup.style.display = "flex";

        // Loading the translator must not translate the page by accident.
        if (currentLanguage === PAGE_LANG) {
            clearTranslateCookie();
        } else {
            setTranslateCookie(currentLanguage);
        }

        if (!supported) {
            await ensureTranslator(8000);
        }

        renderLanguageWindow(
            supported
                ? ""
                : "Couldn't reach Google Translate right now, so every language is listed. Picking one may not work until you're online."
        );
    }

    async function chooseLanguage(code) {
        if (busy) {
            return;
        }

        var user = await getUser();

        if (!user) {
            setLanguageStatus(
                "Log in to save a language to your account.",
                true
            );

            return;
        }

        busy = true;

        setLanguageStatus("Saving...", false);

        try {
            var result = await window.supabaseClient.auth.updateUser({
                data: { language: code }
            });

            if (result.error) {
                throw result.error;
            }

            if (result.data && result.data.user) {
                window.currentUser = result.data.user;
            }

            currentLanguage = code;

            renderLanguageRows();

            setLanguageStatus(
                code === PAGE_LANG && appliedLanguage !== PAGE_LANG
                    ? "Switching back to English..."
                    : "Translating...",
                false
            );

            var ok = await applyLanguage(code);

            if (ok === false) {
                setLanguageStatus(
                    "Saved, but Clipfly couldn't reach Google Translate to translate the page right now. Try again in a moment.",
                    true
                );

            } else {
                setLanguageStatus(
                    "Done! Clipfly is now in " + englishNameFor(code) + ".",
                    false
                );

                var status = byId("clipflyLanguageStatus");

                if (status) {
                    status.style.color = "#4ade80";
                }
            }

        } catch (error) {
            console.error("Could not change language:", error);

            setLanguageStatus(
                error.message || "Could not change your language.",
                true
            );

        } finally {
            busy = false;
        }
    }

    /*
     * =========================================
     * THE BUTTON IN THE PROFILE POPUP
     * =========================================
     */

    function addLanguageButton() {
        var profile = byId("profileScreen");

        if (!profile || byId("clipflyChangeLanguageButton")) {
            return;
        }

        var button = mk("button", "dark-button", "🌐 Change Language");

        button.id = "clipflyChangeLanguageButton";
        button.type = "button";

        button.addEventListener("click", openLanguageWindow);

        // Right under Switch Badge.
        var anchor =
            byId("clipflySwitchBadgeButton") ||
            byId("clipflySwitchAccountButton");

        if (anchor && anchor.parentNode) {
            anchor.parentNode.insertBefore(button, anchor.nextSibling);

        } else {
            var logout = profile.querySelector('button[onclick="logOut()"]');

            if (logout && logout.parentNode) {
                logout.parentNode.insertBefore(button, logout);
            } else {
                profile.appendChild(button);
            }
        }
    }

    /*
     * =========================================
     * EACH ACCOUNT USES ITS OWN LANGUAGE
     * =========================================
     */

    function languageForUser(user) {
        var code = user && user.user_metadata && user.user_metadata.language;

        return code ? String(code) : PAGE_LANG;
    }

    function watchLogin() {
        if (!window.supabaseClient || !window.supabaseClient.auth) {
            return;
        }

        function useLanguageOf(user) {
            currentLanguage = languageForUser(user);

            applyLanguage(currentLanguage).catch(function (error) {
                console.warn("Could not apply language:", error);
            });
        }

        window.supabaseClient.auth.onAuthStateChange(function (event, session) {
            var user = session && session.user ? session.user : null;

            // Supabase advises not to await its calls inside this callback.
            setTimeout(function () {
                useLanguageOf(user);
            }, 0);
        });

        window.supabaseClient.auth
            .getSession()
            .then(function (result) {
                var session = result && result.data && result.data.session;

                useLanguageOf(session ? session.user : null);
            })
            .catch(function (error) {
                console.warn(error);
            });
    }

    /*
     * =========================================
     * START
     * =========================================
     */

    function init() {
        ensureLanguageStyles();

        addLanguageButton();

        window.addEventListener("keydown", function (event) {
            if (event.key === "Escape") {
                closeLanguageWindow();
            }
        });

        watchLogin();
    }

    window.openLanguageWindow = openLanguageWindow;

    init();

})();
