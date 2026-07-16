/*global sillyTaily */

var profileTag = document.getElementById('profile-tag');
var loadingScreen = document.getElementById('loading-screen');
var errorScreen = document.getElementById('error-screen');
var errorMessage = document.getElementById('error-message');
var loadingHint = document.getElementById('loading-hint');
var stFrame = document.getElementById('st-frame');
var retryBtn = document.getElementById('retry-btn');

var currentStatus = null;
var currentProfile = '...';

function showScreen(screen) {
  loadingScreen.style.display = 'none';
  errorScreen.style.display = 'none';
  stFrame.style.display = 'none';

  if (screen === 'loading') {
    loadingScreen.style.display = '';
  } else if (screen === 'error') {
    errorScreen.style.display = '';
  } else if (screen === 'iframe') {
    stFrame.style.display = '';
  }
}

// Window controls
document.getElementById('btn-minimize').addEventListener('click', function () {
  sillyTaily.window.minimize();
});

document.getElementById('btn-maximize').addEventListener('click', function () {
  sillyTaily.window.maximize();
});

document.getElementById('btn-close').addEventListener('click', function () {
  sillyTaily.window.close();
});

sillyTaily.window.onMaximizeChange(function (maximized) {
  var btn = document.getElementById('btn-maximize');
  if (maximized) {
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12"><rect x="0" y="2" width="8" height="8" stroke="currentColor" stroke-width="1" fill="none"/><rect x="2" y="0" width="8" height="8" stroke="currentColor" stroke-width="1" fill="none"/></svg>';
    btn.title = 'Restore';
  } else {
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="1" width="10" height="10" stroke="currentColor" stroke-width="1" fill="none"/></svg>';
    btn.title = 'Maximize';
  }
});

// Server status listener
sillyTaily.server.onStatusChange(function (status) {
  currentStatus = status;
  currentProfile = status.profileName;
  profileTag.textContent = status.profileName;
  loadingHint.textContent = 'Profile: ' + status.profileName + ' | Port: ' + status.port;

  if (status.state === 'loading') {
    showScreen('loading');
  } else if (status.state === 'error') {
    errorMessage.textContent = status.error || 'The SillyTavern server could not be started.';
    showScreen('error');
  }
});

// Server URL listener
sillyTaily.server.onUrl(function (url) {
  stFrame.src = url;
  showScreen('iframe');
});

// Retry button
retryBtn.addEventListener('click', function () {
  require('electron').ipcRenderer.send('app:quit');
});

// Start in loading state
showScreen('loading');
