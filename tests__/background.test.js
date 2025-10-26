const createChromeStub = (state) => {
  const storageState = state;

  const cloneValue = (value) => {
    if (Array.isArray(value)) {
      return value.slice();
    }
    if (value && typeof value === 'object') {
      return { ...value };
    }
    return value;
  };

  const cloneState = () => {
    const snapshot = {};
    for (const [key, value] of Object.entries(storageState)) {
      snapshot[key] = cloneValue(value);
    }
    return snapshot;
  };

  const getFromState = (key) => {
    if (Object.prototype.hasOwnProperty.call(storageState, key)) {
      return storageState[key];
    }
    return undefined;
  };

  return {
    runtime: {
      onMessage: {
        addListener: jest.fn()
      }
    },
    storage: {
      local: {
        get: jest.fn((keys) => {
          if (keys === null) {
            return Promise.resolve(cloneState());
          }

          if (Array.isArray(keys)) {
            const result = {};
            for (const key of keys) {
              if (Object.prototype.hasOwnProperty.call(storageState, key)) {
                result[key] = cloneValue(storageState[key]);
              }
            }
            return Promise.resolve(result);
          }

          if (typeof keys === 'string') {
            const value = getFromState(keys);
            if (value === undefined) {
              return Promise.resolve({});
            }
            return Promise.resolve({ [keys]: cloneValue(value) });
          }

          return Promise.resolve({});
        }),
        set: jest.fn((items) => {
          Object.assign(storageState, items);
          return Promise.resolve();
        }),
        remove: jest.fn((keys) => {
          if (!keys) {
            return Promise.resolve();
          }

          const list = Array.isArray(keys) ? keys : [keys];
          for (const key of list) {
            delete storageState[key];
          }
          return Promise.resolve();
        })
      }
    }
  };
};

describe('background.js storage orchestration', () => {
  let storageState;
  let background;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers().setSystemTime(new Date('2025-10-26T00:00:00Z'));
    storageState = {};
    global.chrome = createChromeStub(storageState);
    background = require('../background.js');
  });

  afterEach(() => {
    delete global.chrome;
    jest.useRealTimers();
  });

  test('saveProgress stores progress and updates trackedContent', async () => {
    const progressData = {
      url: 'https://www.netflix.com/watch/12345',
      title: 'Example Show',
      currentTime: 300,
      duration: 1200,
      platform: 'Netflix',
      type: 'episode',
      episodeNumber: 5,
      seasonNumber: 2,
      seriesTitle: 'Example Show',
      episodeName: 'Episode 5',
      originalTitle: 'Example Show - S2:E5'
    };

    const expectedKey = background.generateContentKey({
      url: progressData.url,
      title: progressData.title,
      platform: progressData.platform,
      type: progressData.type,
      seriesTitle: progressData.seriesTitle
    });

    await background.saveProgress(progressData);

    expect(storageState[expectedKey]).toMatchObject({
      url: progressData.url,
      currentTime: progressData.currentTime,
      duration: progressData.duration,
      platform: progressData.platform,
      type: 'episode',
      episodeNumber: progressData.episodeNumber,
      seasonNumber: progressData.seasonNumber,
      seriesTitle: progressData.seriesTitle,
      episodeName: progressData.episodeName,
      originalTitle: progressData.originalTitle
    });

    expect(storageState[expectedKey].percentComplete).toBeCloseTo(25);
    expect(Array.isArray(storageState.trackedContent)).toBe(true);
    expect(storageState.trackedContent).toContain(expectedKey);
  });

  test('getProgress normalizes URLs before matching', async () => {
    const progressData = {
      url: 'https://www.netflix.com/watch/67890',
      title: 'Example Show',
      currentTime: 90,
      duration: 900,
      platform: 'Netflix',
      type: 'movie',
      episodeNumber: null,
      seasonNumber: null,
      seriesTitle: null,
      episodeName: null,
      originalTitle: 'Example Show'
    };

    const expectedKey = background.generateContentKey({
      url: progressData.url,
      title: progressData.title,
      platform: progressData.platform,
      type: progressData.type,
      seriesTitle: progressData.seriesTitle
    });

    await background.saveProgress(progressData);

    const result = await background.getProgress('https://www.netflix.com/watch/67890?autoplay=true');

    expect(result).not.toBeNull();
    expect(result.url).toBe(progressData.url);
    expect(storageState.trackedContent).toContain(expectedKey);
  });

  test('cleanupOldEntries removes completed items older than six months', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-10-26T00:00:00Z'));

    storageState.trackedContent = ['oldKey', 'recentKey', 'incompleteKey'];
    storageState.oldKey = {
      url: 'https://service.example/old',
      percentComplete: 100,
      lastWatched: '2025-03-01T00:00:00.000Z'
    };
    storageState.recentKey = {
      url: 'https://service.example/recent',
      percentComplete: 100,
      lastWatched: '2025-09-01T00:00:00.000Z'
    };
    storageState.incompleteKey = {
      url: 'https://service.example/incomplete',
      percentComplete: 40,
      lastWatched: '2025-01-01T00:00:00.000Z'
    };

    await background.cleanupOldEntries();

    expect(storageState.oldKey).toBeUndefined();
    expect(storageState.recentKey).toBeDefined();
    expect(storageState.incompleteKey).toBeDefined();
    expect(storageState.trackedContent).toEqual(['recentKey', 'incompleteKey']);
  });

  test('generateContentKey distinguishes series-based keys', () => {
    const seriesKey = background.generateContentKey({
      url: 'https://service.example/watch/abc',
      title: 'Series Name',
      platform: 'Example',
      type: 'episode',
      seriesTitle: 'Series Name'
    });

    const movieKey = background.generateContentKey({
      url: 'https://service.example/watch/abc?autoplay=true',
      title: 'Series Name',
      platform: 'Example',
      type: 'movie',
      seriesTitle: null
    });

    expect(seriesKey).not.toEqual(movieKey);
  });

  test('urlsRoughlyMatch ignores query strings and hash fragments', () => {
    const base = 'https://service.example/watch/123';
    const variant = 'https://service.example/watch/123?autoplay=true#section';

    expect(background.urlsRoughlyMatch(base, variant)).toBe(true);
    expect(background.urlsRoughlyMatch(variant, base)).toBe(true);
  });

  test('saveProgress coerces type to episode when episode markers exist', async () => {
    const progressData = {
      url: 'https://service.example/watch/episode',
      title: 'Some Title',
      currentTime: 120,
      duration: 900,
      platform: 'Example',
      type: 'movie',
      episodeNumber: 4,
      seasonNumber: 1,
      seriesTitle: 'Some Title',
      episodeName: 'Episode 4',
      originalTitle: 'Some Title - S1:E4'
    };

    const contentKey = background.generateContentKey({
      url: progressData.url,
      title: progressData.title,
      platform: progressData.platform,
      type: progressData.type,
      seriesTitle: progressData.seriesTitle
    });

    await background.saveProgress(progressData);

    expect(storageState[contentKey].type).toBe('episode');
    expect(storageState[contentKey].lastWatched).toBe('2025-10-26T00:00:00.000Z');
  });

  test('saveProgress removes legacy keys for the same content', async () => {
    const progressData = {
      url: 'https://service.example/watch/legacy',
      title: 'Legacy Series',
      currentTime: 600,
      duration: 1800,
      platform: 'Example',
      type: 'episode',
      episodeNumber: 7,
      seasonNumber: 3,
      seriesTitle: 'Legacy Series',
      episodeName: 'Episode 7',
      originalTitle: 'Legacy Series - S3:E7'
    };

    const contentKey = background.generateContentKey({
      url: progressData.url,
      title: progressData.title,
      platform: progressData.platform,
      type: 'episode',
      seriesTitle: progressData.seriesTitle
    });

    const legacyEpisodeKey = background.generateContentKey({
      url: progressData.url,
      title: progressData.originalTitle,
      platform: progressData.platform,
      type: 'episode',
      seriesTitle: null
    });

    storageState[legacyEpisodeKey] = {
      url: progressData.url,
      title: progressData.originalTitle,
      percentComplete: 50,
      lastWatched: '2025-10-01T00:00:00.000Z'
    };
    storageState.trackedContent = [legacyEpisodeKey];

    await background.saveProgress(progressData);

    expect(storageState[legacyEpisodeKey]).toBeUndefined();
    expect(storageState.trackedContent).toEqual([contentKey]);
  });

  test('saveProgress drops older episodic entries for the same series', async () => {
    const existingKey = 'content_existing';
    storageState.trackedContent = [existingKey];
    storageState[existingKey] = {
      url: 'https://service.example/watch/old',
      title: 'Series Title',
      seriesTitle: 'Series Title',
      platform: 'Example',
      type: 'episode',
      episodeNumber: 6,
      seasonNumber: 2,
      percentComplete: 90,
      lastWatched: '2025-10-20T00:00:00.000Z'
    };

    const progressData = {
      url: 'https://service.example/watch/new',
      title: 'Series Title',
      currentTime: 400,
      duration: 1600,
      platform: 'Example',
      type: 'episode',
      episodeNumber: 7,
      seasonNumber: 2,
      seriesTitle: 'Series Title',
      episodeName: 'Episode 7',
      originalTitle: 'Series Title - S2:E7'
    };

    const newKey = background.generateContentKey({
      url: progressData.url,
      title: progressData.title,
      platform: progressData.platform,
      type: progressData.type,
      seriesTitle: progressData.seriesTitle
    });

    await background.saveProgress(progressData);

    expect(storageState[existingKey]).toBeUndefined();
    expect(storageState.trackedContent).toEqual([newKey]);
  });

  test('getProgress falls back to scanning all entries when trackedContent is empty', async () => {
    const progressData = {
      url: 'https://service.example/watch/movie',
      title: 'Standalone Movie',
      currentTime: 200,
      duration: 1200,
      platform: 'Example',
      type: 'movie',
      episodeNumber: null,
      seasonNumber: null,
      seriesTitle: null,
      episodeName: null,
      originalTitle: 'Standalone Movie'
    };

    const contentKey = background.generateContentKey({
      url: progressData.url,
      title: progressData.title,
      platform: progressData.platform,
      type: progressData.type,
      seriesTitle: progressData.seriesTitle
    });

    storageState[contentKey] = { ...progressData, percentComplete: 16.6, lastWatched: '2025-10-26T00:00:00.000Z' };
    storageState.trackedContent = [];

    const result = await background.getProgress(progressData.url);

    expect(result).not.toBeNull();
    expect(result.url).toBe(progressData.url);
  });
});
