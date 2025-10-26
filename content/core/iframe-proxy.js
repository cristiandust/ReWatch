(() => {
  if (typeof window === 'undefined') {
    return;
  }

  if (window.self === window.top) {
    return;
  }

  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'ReWatch_PARENT_INFO') {
      window.ReWatchParentUrl = event.data.url;
      window.ReWatchParentTitle = event.data.title;
      window.ReWatchParentEpisode = event.data.episodeNumber;
      window.ReWatchParentSeason = event.data.seasonNumber;
      console.log('[ReWatch] Received parent info:', {
        url: event.data.url,
        title: event.data.title,
        episodeNumber: event.data.episodeNumber,
        seasonNumber: event.data.seasonNumber
      });
    }
  });

  try {
    window.parent.postMessage({ type: 'ReWatch_REQUEST_INFO' }, '*');
  } catch (error) {
    console.log('[ReWatch] Could not request parent info:', error.message);
  }
})();
