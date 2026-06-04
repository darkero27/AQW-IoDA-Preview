/**
 * AQW Confirm Image - Optimized with Cache
 */

(function() {
    const style = document.createElement("style");
    style.id = "aqw-hide-original";
    style.textContent = `
        .bg-dark h1 + *,
        .bg-dark h1 + br { display: none !important; }
        .bg-dark img[src$=".gif"] { display: none !important; }
    `;
    document.documentElement.appendChild(style);
})();

const VALID_ITEM_CATEGORIES = ["Class","Armor","Weapon","Cape","Helm","Helmet","Hood","Pet","Misc","Necklace","Sword","Dagger","Axe","Mace","Polearm","Staff","Wand","Bow","Gun","Enhancement"];
const PRIORITY_CATEGORIES = ["Class","Armor","Pet","Weapon","Cape","Helm","Helmet","Hood","Misc","Necklace","Sword","Dagger","Axe","Mace","Polearm","Staff","Wand","Bow","Gun","Enhancement"];

const redirectCache = new Map();
const imageCache = new Map();

function toHttps(url) { return url ? url.replace(/^http:\/\//i, 'https://') : url; }

function getWikiSlug(rawName) {
    let cleanName = rawName.replace(/\s+x\d+$/i, "").trim();
    // PERUBAHAN: Hapus (IoDA) dari regex? TIDAK! Biarkan (IoDA) tetap ada.
    // Regex di bawah ini hanya menghapus suffix kategori, BUKAN (IoDA)
    // (IoDA) tidak ada dalam daftar, jadi akan tetap dipertahankan!
    cleanName = cleanName.replace(/\s*\((Class|Armor|Helm|Cape|Weapon|Pet|Misc|Necklace|Sword|Dagger|Axe|Mace|Polearm|Staff|Wand|Bow|Gun|0 AC|AC|Legend|Non-Legend|Merge|Rare|VIP|Monster)\)/gi, "").trim();
    let slug = cleanName.toLowerCase();
    slug = slug.replace(/'/g, "-").replace(/\s+/g, "-");
    slug = slug.replace(/[^a-z0-9\-]/g, "").replace(/-+/g, "-");
    return slug;
}

function isValidItemUrl(url, linkText) {
    if (!url) return false;
    const urlLower = url.toLowerCase();
    const textLower = linkText.toLowerCase();
    if (urlLower.includes("-npc") || textLower.includes("(npc)")) return false;
    return VALID_ITEM_CATEGORIES.some(cat => textLower.includes(cat.toLowerCase()));
}

function getCategoryPriority(linkText) {
    const textLower = linkText.toLowerCase();
    for (let i = 0; i < PRIORITY_CATEGORIES.length; i++) {
        if (textLower.includes(PRIORITY_CATEGORIES[i].toLowerCase())) return i;
    }
    return 999;
}

async function fetchWikiAndDetectType(url) {
    if (redirectCache.has(url)) {
        const cached = redirectCache.get(url);
        return { type: cached.type, redirectUrl: cached.redirectUrl };
    }
    
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "fetchWikiHTML", url }, (response) => {
            if (chrome.runtime.lastError || !response || !response.success) {
                resolve({ type: "error", redirectUrl: null });
                return;
            }
            try {
                const doc = new DOMParser().parseFromString(response.html, "text/html");
                const pageContent = doc.querySelector("#page-content");
                const pageText = pageContent ? pageContent.textContent : "";
                const isDisambiguation = pageText.includes("usually refers to:") || pageText.includes("may refer to:") || pageText.includes("refers to:");
                
                if (isDisambiguation) {
                    const allLinks = pageContent.querySelectorAll("a");
                    let bestLink = null, bestPriority = 999;
                    for (const link of allLinks) {
                        const text = link.textContent.trim();
                        const href = link.getAttribute("href");
                        if (!href) continue;
                        let fullUrl = href;
                        if (href && !href.startsWith("http")) fullUrl = `https://aqwwiki.wikidot.com${href}`;
                        if (isValidItemUrl(fullUrl, text)) {
                            const priority = getCategoryPriority(text);
                            if (priority < bestPriority) { bestPriority = priority; bestLink = fullUrl; }
                        }
                    }
                    if (bestLink) {
                        redirectCache.set(url, { type: "disambiguation", redirectUrl: bestLink });
                        resolve({ type: "disambiguation", redirectUrl: bestLink });
                        return;
                    }
                }
                redirectCache.set(url, { type: "normal", redirectUrl: null });
                resolve({ type: "normal", redirectUrl: null });
            } catch (err) {
                resolve({ type: "error", redirectUrl: null });
            }
        });
    });
}

async function fetchWikiImages(url) {
    if (imageCache.has(url)) {
        return imageCache.get(url);
    }
    
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "fetchWikiHTML", url }, (response) => {
            if (chrome.runtime.lastError || !response || !response.success) {
                resolve({ male: null, female: null, wikiHasTabs: false });
                return;
            }
            try {
                const doc = new DOMParser().parseFromString(response.html, "text/html");
                let maleImg = null, femaleImg = null, wikiHasTabs = false;
                const tabView = doc.querySelector(".yui-navset");
                if (tabView && tabView.querySelectorAll(".yui-nav li").length >= 2) wikiHasTabs = true;
                const imgMale = doc.querySelector("#wiki-tab-0-0 img");
                const imgFemale = doc.querySelector("#wiki-tab-0-1 img");
                
                function isValidImg(src) {
                    if (!src) return false;
                    const url = src.toLowerCase();
                    const blocklist = ["/image-tags/","acsmall","aclarge","raresmall","legendsmall","membersmall","map","npc","icon"];
                    return !blocklist.some(word => url.includes(word));
                }
                
                if (imgMale && isValidImg(imgMale.src)) maleImg = toHttps(imgMale.src);
                if (imgFemale && isValidImg(imgFemale.src)) femaleImg = toHttps(imgFemale.src);
                
                if (!maleImg && !femaleImg) {
                    const allImages = doc.querySelectorAll("#page-content img");
                    for (const img of allImages) {
                        if (isValidImg(img.src)) {
                            const httpsSrc = toHttps(img.src);
                            if (!maleImg) maleImg = httpsSrc;
                            else if (!femaleImg) femaleImg = httpsSrc;
                            else break;
                        }
                    }
                }
                const result = { male: maleImg, female: femaleImg, wikiHasTabs };
                imageCache.set(url, result);
                resolve(result);
            } catch (err) {
                resolve({ male: null, female: null, wikiHasTabs: false });
            }
        });
    });
}

let hasProcessed = false;
let isProcessing = false;

async function replaceContent() {
    if (isProcessing || hasProcessed) return;
    const h1 = document.querySelector(".bg-dark h1");
    if (!h1) return;
    const itemName = h1.textContent.trim();
    if (!itemName) return;
    if (document.getElementById("aqw-confirm-container")) { hasProcessed = true; return; }
    
    isProcessing = true;
    const slug = getWikiSlug(itemName);
    const wikiUrl = `https://aqwwiki.wikidot.com/${slug}`;
    
    const [detection, images] = await Promise.all([fetchWikiAndDetectType(wikiUrl), fetchWikiImages(wikiUrl)]);
    
    let finalUrl = wikiUrl;
    let finalImages = images;
    if (detection.type === "disambiguation" && detection.redirectUrl) {
        finalUrl = detection.redirectUrl;
        if (finalUrl !== wikiUrl) finalImages = await fetchWikiImages(finalUrl);
    }
    
    const { male, female, wikiHasTabs } = finalImages;
    
    let descriptionText = "";
    let temp = h1.nextSibling;
    while (temp) {
        if (temp.textContent) descriptionText += temp.textContent;
        temp = temp.nextSibling;
    }
    
    const lowerName = itemName.toLowerCase();
    const lowerDesc = descriptionText.toLowerCase();
    const isArmorOrClass = lowerName.includes("armor") || lowerName.includes("class") || 
                           lowerDesc.includes("level") && (lowerDesc.includes("armor") || lowerDesc.includes("class"));
    
    const shouldShowTabs = isArmorOrClass && wikiHasTabs && (male && female);
    
    const allElements = [];
    let current = h1.nextSibling;
    let shopPriceElement = null;
    while (current) {
        if (current.nodeType === Node.ELEMENT_NODE) {
            if (current.textContent && current.textContent.includes("Shop Price:")) {
                shopPriceElement = current.cloneNode(true);
                const toRemove = current;
                current = current.nextSibling;
                toRemove.remove();
                continue;
            }
            allElements.push(current.cloneNode(true));
        } else if (current.nodeType === Node.TEXT_NODE && current.textContent.trim()) {
            allElements.push(current.cloneNode(true));
        }
        current = current.nextSibling;
    }
    
    const originalStyles = window.getComputedStyle(h1);
    const newLink = document.createElement("a");
    newLink.href = finalUrl;
    newLink.target = "_blank";
    newLink.textContent = itemName;
    newLink.style.cssText = `font-size:${originalStyles.fontSize};font-family:${originalStyles.fontFamily};font-weight:${originalStyles.fontWeight};color:${originalStyles.color};line-height:${originalStyles.lineHeight};letter-spacing:${originalStyles.letterSpacing};text-decoration:none;cursor:pointer;display:block;`;
    newLink.onmouseenter = () => newLink.style.textDecoration = "underline";
    newLink.onmouseleave = () => newLink.style.textDecoration = "none";
    newLink.setAttribute("data-wiki-redirect", "true");
    
    const container = document.createElement("div");
    container.id = "aqw-confirm-container";
    container.style.cssText = "display:flex;flex-wrap:wrap;gap:20px;margin:15px 0;padding:0;background:transparent;align-items:flex-start;";
    
    const imageContainer = document.createElement("div");
    imageContainer.style.cssText = "flex:0 0 250px;text-align:center;";
    
    const tabContainer = document.createElement("div");
    tabContainer.style.cssText = "display:flex;justify-content:center;gap:10px;margin-bottom:10px;";
    const maleTab = document.createElement("button");
    maleTab.textContent = "♂ Male";
    maleTab.style.cssText = "padding:4px 12px;background:#4a4a4a;border:none;border-radius:6px;color:white;cursor:pointer;font-size:12px;";
    const femaleTab = document.createElement("button");
    femaleTab.textContent = "♀ Female";
    femaleTab.style.cssText = "padding:4px 12px;background:#4a4a4a;border:none;border-radius:6px;color:white;cursor:pointer;font-size:12px;";
    tabContainer.appendChild(maleTab);
    tabContainer.appendChild(femaleTab);
    
    const imgWrapper = document.createElement("div");
    imgWrapper.style.cssText = "min-height:230px;display:flex;align-items:center;justify-content:center;";
    
    imageContainer.appendChild(tabContainer);
    imageContainer.appendChild(imgWrapper);
    
    const descContainer = document.createElement("div");
    descContainer.style.cssText = "flex:1;min-width:200px;";
    allElements.forEach(el => descContainer.appendChild(el.cloneNode(true)));
    if (shopPriceElement) {
        const priceWrapper = document.createElement("div");
        priceWrapper.style.marginTop = "15px";
        priceWrapper.style.paddingTop = "10px";
        priceWrapper.style.borderTop = "1px solid rgba(255,255,255,0.15)";
        priceWrapper.appendChild(shopPriceElement.cloneNode(true));
        descContainer.appendChild(priceWrapper);
    }
    
    container.appendChild(imageContainer);
    container.appendChild(descContainer);
    
    let toRemove = h1.nextSibling;
    while (toRemove) { const next = toRemove.nextSibling; toRemove.remove(); toRemove = next; }
    h1.parentNode.replaceChild(newLink, h1);
    newLink.insertAdjacentElement("afterend", container);
    document.querySelectorAll(".bg-dark img[src*='.gif']").forEach(img => img.remove());
    
    if (male || female) {
        const updateImage = (src) => {
            imgWrapper.innerHTML = "";
            const img = document.createElement("img");
            img.src = toHttps(src);
            img.alt = itemName;
            img.style.cssText = "width:100%;max-width:230px;height:auto;border-radius:8px;box-shadow:0 4px 15px rgba(0,0,0,0.3);";
            img.onerror = () => img.remove();
            imgWrapper.appendChild(img);
        };
        const setActiveTab = (active) => {
            maleTab.style.background = active === 'male' ? '#4ade80' : '#4a4a4a';
            maleTab.style.color = active === 'male' ? '#000' : '#fff';
            femaleTab.style.background = active === 'female' ? '#4ade80' : '#4a4a4a';
            femaleTab.style.color = active === 'female' ? '#000' : '#fff';
        };
        if (shouldShowTabs && male && female) {
            maleTab.style.display = femaleTab.style.display = 'inline-block';
            maleTab.onclick = () => { setActiveTab('male'); updateImage(male); };
            femaleTab.onclick = () => { setActiveTab('female'); updateImage(female); };
            updateImage(male);
            setActiveTab('male');
        } else if (male) {
            maleTab.style.display = femaleTab.style.display = 'none';
            updateImage(male);
        } else if (female) {
            maleTab.style.display = femaleTab.style.display = 'none';
            updateImage(female);
        }
    } else {
        imgWrapper.innerHTML = "";
        maleTab.style.display = femaleTab.style.display = 'none';
    }
    
    const hideStyle = document.getElementById("aqw-hide-original");
    if (hideStyle) hideStyle.remove();
    hasProcessed = true;
    isProcessing = false;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => replaceContent());
else replaceContent();
