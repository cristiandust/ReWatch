// Popup script for ReWatch

let allContent = [];
let currentFilter = 'all';

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  loadContent();
  setupEventListeners();
});

// Load all tracked content
async function loadContent() {
  try {
    const result = await chrome.storage.local.get(null);
    
    // Filter out non-content items
    allContent = Object.entries(result)
      .filter(([key, value]) => key.startsWith('content_'))
      .map(([key, value]) => ({ ...value, key }))
      .sort((a, b) => new Date(b.lastWatched) - new Date(a.lastWatched));
    
    updateStats();
    renderContent();
  } catch (error) {
    console.error('Error loading content:', error);
    showError('Failed to load content');
  }
}

// Update statistics
function updateStats() {
  const totalCount = allContent.length;
  const inProgressCount = allContent.filter(item => 
    item.percentComplete > 5 && item.percentComplete < 95
  ).length;
  
  document.getElementById('total-count').textContent = totalCount;
  document.getElementById('in-progress-count').textContent = inProgressCount;
}

// Render content list
function renderContent() {
  const contentList = document.getElementById('content-list');
  const emptyState = document.getElementById('empty-state');
  
  // Filter content based on current filter
  const filteredContent = currentFilter === 'all' 
    ? allContent 
    : allContent.filter(item => item.type === currentFilter);
  
  if (filteredContent.length === 0) {
    contentList.innerHTML = '';
    contentList.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }
  
  contentList.style.display = 'block';
  emptyState.style.display = 'none';
  
  contentList.innerHTML = filteredContent.map(item => createContentCard(item)).join('');
  
  // Add event listeners to action buttons
  attachActionListeners();
}

// Create HTML for a content card
function createContentCard(item) {
  const percent = Math.round(item.percentComplete);
  const timeString = formatTime(item.currentTime);
  const durationString = formatTime(item.duration);
  const dateString = formatDate(item.lastWatched);
  
  // Format title with episode and season numbers if available
  const baseTitle = item.title || item.seriesTitle || item.originalTitle || 'Untitled';
  let displayTitle = escapeHtml(baseTitle);
  if (item.type === 'episode') {
    if (item.episodeName) {
      displayTitle += ` <span class="episode-name">– ${escapeHtml(item.episodeName)}</span>`;
    }

    // Build episode/season badge
    let badge = '';
    if (item.seasonNumber && item.episodeNumber) {
      badge = `S${item.seasonNumber} E${item.episodeNumber}`;
    } else if (item.seasonNumber) {
      badge = `Season ${item.seasonNumber}`;
    } else if (item.episodeNumber) {
      badge = `Ep ${item.episodeNumber}`;
    }
    
    if (badge) {
      displayTitle += ` <span class="episode-badge">${badge}</span>`;
    }
  }
  
  return `
    <div class="content-item" data-key="${item.key}">
      <div class="content-header">
        <div class="content-title">${displayTitle}</div>
        <span class="content-type ${item.type}">${item.type}</span>
      </div>
      <div class="content-platform">${escapeHtml(item.platform)}</div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${percent}%"></div>
      </div>
      <div class="content-meta">
        <span class="content-time">${timeString} / ${durationString} (${percent}%)</span>
        <span class="content-date">${dateString}</span>
      </div>
      <div class="content-actions">
        <button class="btn-icon open" data-url="${escapeHtml(item.url)}" title="Open">🔗</button>
        <button class="btn-icon delete" data-key="${item.key}" title="Delete">🗑️</button>
      </div>
    </div>
  `;
}

// Attach event listeners to action buttons
function attachActionListeners() {
  // Open buttons
  document.querySelectorAll('.btn-icon.open').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const url = e.target.dataset.url;
      chrome.tabs.create({ url });
    });
  });
  
  // Delete buttons
  document.querySelectorAll('.btn-icon.delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const key = e.target.dataset.key;
      if (confirm('Delete this item?')) {
        await chrome.storage.local.remove(key);
        await loadContent();
      }
    });
  });
}

// Setup event listeners for filters and buttons
function setupEventListeners() {
  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentFilter = e.target.dataset.filter;
      renderContent();
    });
  });
  
  // Clear completed button
  document.getElementById('clear-completed').addEventListener('click', async () => {
    if (!confirm('Clear all completed items (95%+)?')) return;
    
    const toRemove = allContent
      .filter(item => item.percentComplete >= 95)
      .map(item => item.key);
    
    if (toRemove.length > 0) {
      await chrome.storage.local.remove(toRemove);
      await loadContent();
    }
  });
  
  // Export data button
  document.getElementById('export-data').addEventListener('click', () => {
    const dataStr = JSON.stringify(allContent, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    chrome.downloads.download({
      url,
      filename: `ReWatch-export-${new Date().toISOString().split('T')[0]}.json`,
      saveAs: true
    });
  });
}

// Utility functions
function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showError(message) {
  const contentList = document.getElementById('content-list');
  contentList.innerHTML = `<div class="loading" style="color: #dc3545;">${message}</div>`;
}
