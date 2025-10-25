// Debug console script

async function loadData() {
  const allData = await chrome.storage.local.get(null);
  
  // Display all data
  document.getElementById('all-data').textContent = JSON.stringify(allData, null, 2);
  
  // Display tracked content list
  const trackedContent = allData.trackedContent || [];
  document.getElementById('tracked-list').textContent = JSON.stringify(trackedContent, null, 2);
  
  // Find and display latest entry
  let latestEntry = null;
  let latestTime = 0;
  
  for (const [key, value] of Object.entries(allData)) {
    if (key === 'trackedContent') continue;
    if (value.lastWatched) {
      const time = new Date(value.lastWatched).getTime();
      if (time > latestTime) {
        latestTime = time;
        latestEntry = { key, ...value };
      }
    }
  }
  
  if (latestEntry) {
    document.getElementById('latest-entry').textContent = JSON.stringify(latestEntry, null, 2);
    
    // Highlight important fields
    const hasEpisode = latestEntry.episodeNumber !== undefined;
    const episodeStatus = hasEpisode 
      ? `✅ Episode Number: ${latestEntry.episodeNumber}` 
      : '❌ No Episode Number';
    
    const details = `
Latest: ${latestEntry.title}
Type: ${latestEntry.type}
Platform: ${latestEntry.platform}
${episodeStatus}
Progress: ${Math.round(latestEntry.percentComplete)}%
Last Watched: ${new Date(latestEntry.lastWatched).toLocaleString()}

Full Data:
${JSON.stringify(latestEntry, null, 2)}`;
    
    document.getElementById('latest-entry').textContent = details;
  } else {
    document.getElementById('latest-entry').textContent = 'No entries found';
  }
}

// Auto-refresh every 2 seconds
setInterval(loadData, 2000);

// Manual refresh button
document.getElementById('refresh').addEventListener('click', loadData);

// Clear all data button
document.getElementById('clear').addEventListener('click', async () => {
  if (confirm('Are you sure you want to clear all ReWatch data?')) {
    await chrome.storage.local.clear();
    await loadData();
    alert('All data cleared!');
  }
});

// Export data button
document.getElementById('export').addEventListener('click', async () => {
  const allData = await chrome.storage.local.get(null);
  const dataStr = JSON.stringify(allData, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `ReWatch-debug-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  
  URL.revokeObjectURL(url);
});

// Initial load
loadData();
