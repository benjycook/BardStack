const DB_NAME = 'stackloop';
const DB_VERSION = 1;
const STORE_FILTER_TAGS = 'filterTags';
const STORE_TRACKS = 'tracks';

const DEFAULT_FILTER_TAGS = [
    { name: 'All', emoji: '∞' },
    { name: 'Combat', emoji: '⚔️' },
    { name: 'Tavern', emoji: '🍺' },
    { name: 'Dungeon', emoji: '🕸️' },
    { name: 'Forest', emoji: '🌲' }
];

const DEFAULT_TRACKS = [
    { id: 1, title: 'Boss Battle Theme', duration: '3:45', tag: 'Combat' },
    { id: 2, title: 'Forest Birds', duration: '10:00', tag: 'Forest' },
    { id: 3, title: 'Sword Clashing Loop', duration: '1:00', tag: 'Combat' },
    { id: 4, title: 'Dungeon Drips', duration: '5:30', tag: 'Dungeon' },
    { id: 5, title: 'Tavern Chatter', duration: '2:15', tag: 'Tavern' },
    { id: 6, title: 'Campfire Crackle', duration: '4:00', tag: 'Forest' },
    { id: 7, title: 'Eerie Wind', duration: '2:30', tag: 'Dungeon' },
    { id: 8, title: 'Goblin Laughs', duration: '0:45', tag: 'Combat' }
];

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_FILTER_TAGS)) {
                db.createObjectStore(STORE_FILTER_TAGS, { keyPath: 'name' });
            }
            if (!db.objectStoreNames.contains(STORE_TRACKS)) {
                db.createObjectStore(STORE_TRACKS, { keyPath: 'id' });
            }
        };
    });
}

function getAll(db, storeName) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function putAll(db, storeName, items) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.clear();
        items.forEach(item => store.put(item));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

function addTrack(db, track) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_TRACKS, 'readwrite');
        const store = tx.objectStore(STORE_TRACKS);
        const req = store.add(track);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        tx.onerror = () => reject(tx.error);
    });
}

function saveFilterTags(db, tags) {
    return putAll(db, STORE_FILTER_TAGS, tags);
}

function audioApp() {
    return {
        activeTab: 'dashboard',
        modalOpen: false,
        pendingSelection: null,
        selectedTag: 'All',
        db: null,
        loading: true,
        uploadTrackName: '',
        uploadTrackTag: '',
        uploadAudioFile: null,

        activeStack: [
            { id: 101, title: 'Rainy Village', volume: 60, isPlaying: true, icon: 'fa-cloud-rain' },
            { id: 102, title: 'Distant Thunder', volume: 30, isPlaying: true, icon: 'fa-bolt' }
        ],

        filterTags: [],
        tracks: [],

        get filteredTracks() {
            if (this.selectedTag === 'All') return this.tracks;
            return this.tracks.filter(t => t.tag === this.selectedTag);
        },

        async init() {
            try {
                this.db = await openDB();
                let tags = await getAll(this.db, STORE_FILTER_TAGS);
                let tracks = await getAll(this.db, STORE_TRACKS);
                if (tags.length === 0) {
                    await saveFilterTags(this.db, DEFAULT_FILTER_TAGS);
                    tags = DEFAULT_FILTER_TAGS;
                }
                if (tracks.length === 0) {
                    await putAll(this.db, STORE_TRACKS, DEFAULT_TRACKS);
                    tracks = DEFAULT_TRACKS;
                }
                this.filterTags = tags;
                this.tracks = tracks;
            } catch (e) {
                console.error('IndexedDB init failed', e);
                this.filterTags = DEFAULT_FILTER_TAGS;
                this.tracks = DEFAULT_TRACKS;
            } finally {
                this.loading = false;
            }
        },

        async saveFilterTags() {
            if (!this.db) return;
            try {
                await saveFilterTags(this.db, this.filterTags);
            } catch (e) {
                console.error('Failed to save filter tags', e);
            }
        },

        setUploadAudioFile(file) {
            this.uploadAudioFile = file || null;
        },

        clearUploadForm() {
            this.uploadTrackName = '';
            this.uploadTrackTag = '';
            this.uploadAudioFile = null;
        },

        async saveTrackToLibrary(track) {
            const id = Number.isInteger(track.id) ? track.id : Math.floor(Date.now() + Math.random() * 1000);
            const entry = {
                id,
                title: track.title,
                duration: track.duration || '0:00',
                tag: track.tag || 'All',
                audioData: track.audioData ?? null
            };
            if (!this.db) return;
            try {
                await addTrack(this.db, entry);
                this.tracks = [...this.tracks, entry];
                this.clearUploadForm();
                this.activeTab = 'library';
            } catch (e) {
                console.error('Failed to save track', e);
            }
        },

        confirmPlay(item) {
            this.pendingSelection = item;
            this.modalOpen = true;
        },

        addToStack() {
            this.processSelection(false);
            this.modalOpen = false;
            this.activeTab = 'dashboard';
        },

        replaceStack() {
            this.processSelection(true);
            this.modalOpen = false;
            this.activeTab = 'dashboard';
        },

        processSelection(replace) {
            if (replace) {
                this.activeStack = [];
            }
            this.pushToStack(this.pendingSelection);
        },

        pushToStack(track) {
            const newId = Date.now() + Math.random();
            this.activeStack.push({
                id: newId,
                title: track.title,
                volume: 80,
                isPlaying: true,
                icon: 'fa-music'
            });
        },

        removeFromStack(index) {
            this.activeStack.splice(index, 1);
        },

        stopAll() {
            this.activeStack.forEach(t => t.isPlaying = false);
        }
    };
}
