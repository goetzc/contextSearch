/// Static variables
var searchEngines = {};
var searchEnginesArray = [];
var selection = "";
var targetUrl = "";
var browserVersion = 0;

/// Preferences
var openSearchResultsInNewTab = true;
var openTabInForeground = false;

/// Messages
// listen for messages from the content or options script
browser.runtime.onMessage.addListener(function(message) {
    switch (message.action) {
        case "notify":
            notify(message.data);
            break;
        case "getSelectionText":
            if (message.data) selection = message.data;
            break;
        case "sendCurrentTabUrl":
            if (message.data) targetUrl = message.data;
            break;
        case "setTabMode":
            openSearchResultsInNewTab = message.data.newTab;
            openTabInForeground = message.data.tabActive;
            break;
        default:
            break;
    }
});

/// Initialisation
function init() {
    browser.runtime.getBrowserInfo().then(gotBrowserInfo);
    browser.storage.onChanged.addListener(onStorageChanges);

    onStorageSyncChanges();

    // getBrowserInfo
    function gotBrowserInfo(info){
        let v = info.version;
        browserVersion = parseInt(v.slice(0, v.search(".") - 1));
    }
}

/// Context menus
function buildContextMenuItem(searchEngine, id, title, faviconUrl){
    const contexts = ["selection"];

    if (!searchEngine.show) return;

    if (browserVersion > 55){
        browser.contextMenus.create({
            id: id,
            title: title,
            contexts: contexts,
            icons: { 18: faviconUrl }
        });
    } else {
        browser.contextMenus.create({
            id: id,
            title: title,
            contexts: contexts
        });
    }
}

/// Storage
function onStorageChanges(changes, area) {
    if (area === "sync") {
        onStorageSyncChanges();
    }
}

// On storage sync changes re-build the context menu using the search engines from storage sync
function onStorageSyncChanges() {
    browser.contextMenus.removeAll();
    browser.contextMenus.onClicked.removeListener(processSearch);
    browser.contextMenus.create({
        id: "cs-google-site",
        title: "Search this site with Google",
        contexts: ["selection"]
    });
    browser.contextMenus.create({
        id: "cs-options",
        title: "Options...",
        contexts: ["selection"]
    });
    browser.contextMenus.create({
        id: "cs-separator",
        type: "separator",
        contexts: ["selection"]
    });

    browser.storage.sync.get(null).then(
        (data) => {
            searchEngines = sortByIndex(data);
            searchEnginesArray = [];
            var index = 0;
            for (var id in searchEngines) {
                var strId = "cs-" + index.toString();
                var strTitle = searchEngines[id].name;
                var url = searchEngines[id].url;
                var faviconUrl = "https://s2.googleusercontent.com/s2/favicons?domain_url=" + url;
                searchEnginesArray.push(id);
                buildContextMenuItem(searchEngines[id], strId, strTitle, faviconUrl);
                index += 1;
            }
        }
    );

    browser.contextMenus.onClicked.addListener(processSearch);
}

/// Search engines
function sortByIndex(list) {
    var sortedList = {};
    var skip = false;
    
    // If there are no indexes, then add some arbitrarily
    for (var i = 0;i < Object.keys(list).length;i++) {
    var id = Object.keys(list)[i];
    if (list[id].index != null) {
        break;
    } 
    if (list[id] != null) {
        sortedList[id] = list[id];
        sortedList[id]["index"] = i;
        skip = true;
    }
    }

    for (var i = 0;i < Object.keys(list).length;i++) {
      for (let id in list) {
        if (list[id] != null && list[id].index === i) {
          sortedList[id] = list[id];
        }
      }
    }
    return sortedList;
}

// Perform search based on selected search engine, i.e. selected context menu item
function processSearch(info, tab){
    var tabPosition = tab.index + 1;
    if (!openSearchResultsInNewTab) {
        tabPosition = null;
    }
    let id = info.menuItemId.replace("cs-", "");

    // Prefer info.selectionText over selection received by content script for these lengths (more reliable)
    if (info.selectionText.length < 150 || info.selectionText.length > 150) {
        selection = info.selectionText;
    }

    if (id === "google-site" && targetUrl != "") {
        openTab(tab.id, targetUrl, tabPosition);
        targetUrl = "";
        return;
    } else if (id === "options") {
        browser.runtime.openOptionsPage().then(null, onError);
        return;
    }

    id = parseInt(id);
    
    // At this point, it should be a number
    if(!isNaN(id)){
		let searchEngineUrl = searchEngines[searchEnginesArray[id]].url;
        if (searchEngineUrl.includes("{search terms}")) {
            targetUrl = searchEngineUrl.replace("{search terms}", encodeURIComponent(selection));
        } else if (searchEngineUrl.includes("%s")) {
			targetUrl = searchEngineUrl.replace("%s", encodeURIComponent(selection));
        } else {
            targetUrl = searchEngineUrl + encodeURIComponent(selection);
        }
        openTab(tab.id, targetUrl, tabPosition);
        targetUrl = "";
    }    
}

/// Helper functions
function openTab(tabId, targetUrl, tabPosition) {
    if (tabPosition != null) {
        browser.tabs.create({
            active: openTabInForeground,
            index: tabPosition,
            url: targetUrl
        });
        return;
    }
    sendMessage(tabId, "openUrlInSameTab", targetUrl);
}

function onError(error) {
    console.log(`${error}`);
}

function sendMessage(tabId, action, data){
    console.log(tabId);
    console.log(action);
    console.log(data);
	browser.tabs.sendMessage(tabId, {"action": action, "data": data});
}

function notify(message){
    browser.notifications.create(message.substring(0, 20),
    {
        type: "basic",
        iconUrl: browser.extension.getURL("icons/icon_96.png"),
        title: "Context Search",
        message: message
    });
}

init();
