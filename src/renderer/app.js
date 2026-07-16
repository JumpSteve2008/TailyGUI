/*global sillyTaily */

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

// Update maximize button icon on window state change
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
