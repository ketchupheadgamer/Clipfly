const SUPABASE_URL = "https://ztheihcyqhnliakkehop.supabase.co";

const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_RAOWC4JElLrWWXygzP6ymw_G_VDvoo9";

if (!window.supabase) {
    console.error("Supabase library did not load!");
} else {
    const supabaseClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    );

    window.supabaseClient = supabaseClient;

    console.log("Supabase connected!");
}