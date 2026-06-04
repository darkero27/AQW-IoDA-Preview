// background.js - Fetch wiki HTML (same method as AQWikiTools)

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "fetchWikiHTML") {
        const url = request.url;
        
        fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.text();
            })
            .then(html => {
                sendResponse({ success: true, html: html });
            })
            .catch(error => {
                console.error("Fetch error:", error);
                sendResponse({ success: false, error: error.message });
            });
        
        return true;
    }
});

console.log("AQW Confirm Image background loaded");