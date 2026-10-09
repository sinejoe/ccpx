/**
 * ccpx Gmail → routine bridge (Google Apps Script).
 *
 * Polls Gmail every minute for new user replies in a week's `ccpx <DATE>`
 * thread and fires the "ccpx weekly crossword" routine's API trigger, so a
 * solve or an OK is picked up in minutes instead of waiting for the cron.
 * The routine still decides what to do from git + Gmail (RUNBOOK.md); the
 * fire text is only a hint.
 *
 * Setup (script.google.com, signed in to the mailbox that receives the
 * replies):
 *   1. New project, paste this file.
 *   2. Project Settings → Script Properties → add ROUTINE_TOKEN = the
 *      sk-ant-oat01-… token from the routine's API trigger.
 *   3. Run `install` once and approve the Gmail + external-request scopes.
 *      It seeds the already-seen messages (no fire) and adds the 1-minute
 *      trigger. Run `uninstall` to stop.
 */

var ROUTINE_ID = 'trig_01KbVr5VESyUnkJsYV9BTDqc';
var FIRE_URL = 'https://api.anthropic.com/v1/claude_code/routines/' + ROUTINE_ID + '/fire';
var QUERY = 'subject:"ccpx 20" newer_than:3d';
var MARKER = '[ccpx-bot]';
var SEEN_KEY = 'seenIds';
var SEEN_MAX = 300;

function install() {
  uninstall();
  scan_(false);
  ScriptApp.newTrigger('poll').timeBased().everyMinutes(1).create();
}

function uninstall() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'poll') ScriptApp.deleteTrigger(t);
  });
}

function poll() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    scan_(true);
  } finally {
    lock.releaseLock();
  }
}

// Collect user (non-marker) messages not seen before; fire once if any.
function scan_(fire) {
  var props = PropertiesService.getScriptProperties();
  var seen = JSON.parse(props.getProperty(SEEN_KEY) || '[]');
  var seenSet = {};
  seen.forEach(function (id) { seenSet[id] = true; });

  var fresh = [];
  GmailApp.search(QUERY, 0, 20).forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      var id = msg.getId();
      if (seenSet[id]) return;
      seenSet[id] = true;
      seen.push(id);
      if (!isBot_(msg)) fresh.push(thread.getFirstMessageSubject());
    });
  });

  if (fire && fresh.length) {
    var token = props.getProperty('ROUTINE_TOKEN');
    if (!token) throw new Error('Script property ROUTINE_TOKEN is not set');
    var res = UrlFetchApp.fetch(FIRE_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': 'Bearer ' + token,
        'anthropic-version': '2023-06-01'
      },
      payload: JSON.stringify({
        text: 'Gmail bridge: new user reply in "' + fresh[0] + '". Follow RUNBOOK.md as usual.'
      }),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code >= 300) {
      // Leave these messages unseen so the next poll retries.
      throw new Error('Routine fire failed: HTTP ' + code + ' ' + res.getContentText().slice(0, 300));
    }
  }

  props.setProperty(SEEN_KEY, JSON.stringify(seen.slice(-SEEN_MAX)));
}

// Bot mail starts with the marker; judge only the first non-blank line, since
// user replies quote the bot mail below.
function isBot_(msg) {
  var lines = msg.getPlainBody().split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line) return line.indexOf(MARKER) === 0;
  }
  return false;
}
