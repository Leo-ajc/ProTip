var currentSite = null;
var currentTabId = null;
var startTime = null;

var updateTimeOnPageInterval = 1000 * 10;  // 10 seconds // 1 minute.

browser.alarms.onAlarm.addListener(function( alarm ) {
    if(localStorage['automaticDonate'] == "true"){
        var val = '',
            address = '',
            SATOSHIS = 100000000,
            FEE = SATOSHIS * 0.0001,
            BTCUnits = 'BTC',
            BTCMultiplier = SATOSHIS;

        Promise.all([
            preferences.setCurrency(localStorage["fiatCurrencyCode"]),
            wallet.restoreAddress()
        ]).then(function(){
            paymentManager.payAll(localStorage['incidentalTotalFiat'], localStorage['subscriptionTotalFiat']).then(function(response){
                localStorage['weeklyAlarmReminder'] = false;
                window.alarmManager.doToggleAlarm();

                db.clear('sites');
                browser.browserAction.setBadgeBackgroundColor({color:'#5bc0de'});
                browser.browserAction.setBadgeText({text: 'Sent!'});
            }, function(error){
                // If doToggleAlarm() is not called, the alarm will fire every 2 hours after the set period.
                // Maybe the balance is too low, or blockcypher.com is not working, or there are no
                // recorded bitcoins or subscriptions to send to.
                localStorage['weeklyAlarmReminder'] = false;
                window.alarmManager.doToggleAlarm();

                db.clear('sites');
                browser.browserAction.setBadgeBackgroundColor({color:'#5bc0de'});
                browser.browserAction.setBadgeText({text: 'Sent!'});
                console.log(error.message);
            });
        });
    } else if (localStorage['manualRemind'] == 'true') {
        localStorage['weeklyAlarmReminder'] = true;
        browser.browserAction.setBadgeBackgroundColor({color:'#9BDBFC'});
        browser.browserAction.setBadgeText({text: '....'});
    }
});

browser.runtime.onInstalled.addListener(function(details){
    //if(details.reason == "update"){
        preferences.convert();
        var thisVersion = browser.runtime.getManifest().version;
        console.log("Updated from " + details.previousVersion + " to " + thisVersion + "!");
    //}
});

window.addEventListener("storage", function(e){
    // Let the user see their available balance in the browserAction
    // Doesn't have to be super accurate. Certainly don't need to hit
    // an API call constantly.
    browser.browserAction.setBadgeBackgroundColor({color:'#dddddd'});
    if(localStorage['availableBalanceFiat'] == '0'){
        browser.browserAction.setBadgeText({text: '0.00'});
    } else {
        browser.browserAction.setBadgeText({text: localStorage['availableBalanceFiat']});
        // currencyManager.amount(parseFloat(localStorage['availableBalanceFiat'])).then(function(formattedMoney) {
        //     browser.browserAction.setBadgeText({text: formattedMoney});
        // });
    }

    if(insufficientBalance()) {
       browser.browserAction.setBadgeBackgroundColor({color:'#ff0000'});
    }

    // If weekly reminder active, then show the [....] flag.
    // if (localStorage['manualRemind'] == 'true' && localStorage['weeklyAlarmReminder'] == 'true'){
    //     browser.browserAction.setBadgeBackgroundColor({color:'#9BDBFC'});
    //     browser.browserAction.setBadgeText({text: '....'});
    // }
}, false);

function insufficientBalance() {
    var totalDonationFiat = parseFloat(localStorage['incidentalTotalFiat']) + parseFloat(localStorage['bitcoinFeeFiat']) + parseFloat(localStorage['subscriptionTotalFiat']);
    var availableBalanceFiat = parseFloat(localStorage['availableBalanceFiat']);
    if(isNaN(totalDonationFiat) || isNaN(availableBalanceFiat)) {
        return false;
    }
    if (totalDonationFiat > availableBalanceFiat) {
        return true;
    }
    return false;
}

function checkIdleTime(newState) {
    console.log("Checking idle behaviour " + newState);
    if ((newState == "idle" || newState == "locked") &&
        localStorage["paused"] == "false") {
        localStorage["paused"] = "true";
    } else if (newState == "active") {
        localStorage["paused"] = "false";
    }
}

function updateTimeOnPage() {

    if (localStorage["paused"] == "true") {
        currentSite = null;
        return;
    }

    if (currentTabId == null) {
        return;
    }

    browser.tabs.get(currentTabId).then(function(tab) {
        // Ensure set on focused window.
        browser.windows.get(tab.windowId).then(function(window) {
            if (!window.focused) {
                return;
            }
            var site = tab.url
            if (site == null) {
                return; // console.log("Not valid URL.");
            }

            // Init on browser or tab startup.
            if (currentSite == null) {
                currentSite = site;
                startTime = new Date();
                return;
            }

            // Compare the current time to last time.
            var now = new Date();
            var delta = now.getTime() - startTime.getTime();

            // If delta is too large. Something unexpected has happened, just ignore.
            if (delta < (updateTimeOnPageInterval + updateTimeOnPageInterval / 2)) {
                isBlacklisted(site, function(blacklistFound){
                    if(!blacklistFound){ // not blacklisted.
                        updateTime(currentSite, delta/1000);
                    }
                });
            }

            // When tab change, the site might also change.
            currentSite = site;
            startTime = now;
        });
    });
}

function isBlacklisted(url, callback){
    var hostname = new URL(url).hostname;
    db.get('blacklistedhostnames', hostname).then(function(record){
        if(!record){ // if hostname not blacklisted.
            db.get('blacklist', url).then(function(record){
                if(!record){
                  callback(false);
                } else {
                  callback(true);
                }
            });
        } else {
            callback(true);
        }
    });
}

function hasKnownBtcAddress(url, callback){
  db.get('sites', url).then(function(record){
      if(record){
          callback(record);
      } else {
          callback(false);
      }
  });
}


function isStarredUser(url, callback){
    var twitterHandle = url.match(/[https|http]:\/\/twitter\.com\/(.*)/);
    if(twitterHandle){
        twitterHandle = twitterHandle[1];
        db.get('sponsors', twitterHandle).then(function(record){
            if(record){
                callback(true);
            } else {
                callback(false);
            }
        });
    } else {
        callback(false);
    }
}

function updateTime(url, seconds) {  //function updateTime(site, seconds) {

    // Only sites with BitcoinAddresses should exist.
    // No need to record sites that don't have a bitcoinAddress
    db.get('sites', url).done(function(record) {
        if (record && record.timeOnPage) { // exist
            db.from('sites', '=', url).patch({timeOnPage: (parseInt(record.timeOnPage) + parseInt(seconds))});
        } else if(record) {
            db.from('sites', '=', url).patch({timeOnPage: parseInt(seconds)});
        }
    });
}


Array.prototype.diff = function(a) {
    // [1,2,3,4,5,6].diff( [3,4,5] );
    // => [1, 2, 6]
    return this.filter(function(i) {return a.indexOf(i) < 0;});
};

var db;
function initialize() {
    db = new ydn.db.Storage('protip', schema);

    if(localStorage.firstRun) {
        db.put('subscriptions', {label: 'Support ProTip', amountFiat: '0.25'}, '13U4gmroMmFwHAwd2Sukn4fE2WvHG6hP8e');
        localStorage.firstRun = false
    }

    if (!localStorage.paused) {
        localStorage.paused = "false";
    }


    browser.tabs.onActivated.addListener(
    function(activeInfo) {
        console.log("Tab changed");
        currentTabId = activeInfo.tabId;
        updateTimeOnPage();
    });

    browser.tabs.onUpdated.addListener(
    function(tabId, changeInfo, tab) {
        if (tabId == currentTabId) {
            console.log("Tab updated");
            updateTimeOnPage();
        }
    });

    browser.windows.onFocusChanged.addListener(
    function(windowId) {
        console.log("Detected window focus changed.");
        browser.tabs.query({windowId: windowId, active: true})
          .then(function(tabs) {
            console.log("Window/Tab changed");
            var tab = tabs[0];
            if (tab !== undefined) {
              currentTabId = tab.id;
            }
            updateTimeOnPage();
        });
    });

    // Force an update of the counter
    window.setInterval(updateTimeOnPage, updateTimeOnPageInterval);

    // Keep track of idle time.
    browser.idle.queryState(60).then(checkIdleTime);
    browser.idle.onStateChanged.addListener(checkIdleTime);
}

initialize();


browser.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {

        if(request.action && request.action == "isBlacklisted") {
            isBlacklisted(request.url, function(blacklistFound){
                browser.tabs.query({active: true}).then(function(tabs) {
                    var tab = tabs[0];
                    if(blacklistFound){
                        browser.browserAction.setBadgeBackgroundColor({color:'#000000', tabId: tab.id});
                        browser.browserAction.setBadgeText({text: 'x', tabId: tab.id});
                    } else {
                        hasKnownBtcAddress(request.url, function(record){
                            // give permission for the content script to scan the DOM for BTC addresses
                            browser.tabs.sendMessage(tab.id, {method: 'isBlacklisted', response: false, knownBTCAddress: record.bitcoinAddress});
                        })
                    }
                });
            });
        } else if(request.action && request.action == "isStarredUser") {
            isStarredUser(request.url, function(starredFound){
                if( starredFound ) {
                    browser.tabs.query({active: true}).then(function(tabs) {
                        var tab = tabs[0];
                        browser.tabs.sendMessage(tab.id, {method: 'isStarredUser', response: true});
                    });
                }
            });
        } else if(request.action && request.action == "deleteBitcoinAddress"){
            db.remove('sites', request.url);
            db.put('blacklist', { url: request.url });
            browser.tabs.query({active: true}).then(function(tabs) {
                var tab = tabs[0];
                browser.browserAction.setBadgeBackgroundColor({color:'#000000', tabId: tab.id});
                browser.browserAction.setBadgeText({text: 'x', tabId: tab.id});
                browser.browserAction.setIcon({path: 'assets/images/icon_48.png', tabId: tab.id});
            });
        } else if(request.action && request.action == "putBitcoinAddress" && validAddress(request.bitcoinAddress)){
            db.get('sites', request.url).done(function(record) {
                if (!record) {
                    db.put('sites', {bitcoinAddress: request.bitcoinAddress, url: request.url, title: request.title});
                } else {
                    db.from('sites', '=', record.url).patch({ bitcoinAddress: request.bitcoinAddress });
                }
                db.remove('blacklist', request.url);
            });
            browser.tabs.query({active: true}).then(function(tabs) {
                var tab = tabs[0];
                browser.browserAction.setBadgeBackgroundColor({color:'#00ff00', tabId: tab.id});
                if (request.source && request.source == 'metatag') {
                    browser.browserAction.setBadgeText({text: 'meta', tabId: tab.id}); // request.bitcoinAddresses.length.toString(), tabId: tab.id});
                } else {
                    browser.browserAction.setBadgeText({text: request.bitcoinAddress.trim().substring(0,4), tabId: tab.id}); // request.bitcoinAddresses.length.toString(), tabId: tab.id});
                }
                browser.browserAction.setIcon({path: 'assets/images/heart48x48.png', tabId: tab.id});
            });
        }
    }
);
