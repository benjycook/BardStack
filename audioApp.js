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

const DEFAULT_TRACKS = []
/*
[
    { id: 1, title: 'Boss Battle Theme', duration: '3:45', tag: 'Combat' },
    { id: 2, title: 'Forest Birds', duration: '10:00', tag: 'Forest' },
    { id: 3, title: 'Sword Clashing Loop', duration: '1:00', tag: 'Combat' },
    { id: 4, title: 'Dungeon Drips', duration: '5:30', tag: 'Dungeon' },
    { id: 5, title: 'Tavern Chatter', duration: '2:15', tag: 'Tavern' },
    { id: 6, title: 'Campfire Crackle', duration: '4:00', tag: 'Forest' },
    { id: 7, title: 'Eerie Wind', duration: '2:30', tag: 'Dungeon' },
    { id: 8, title: 'Goblin Laughs', duration: '0:45', tag: 'Combat' }
];
*/ 

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

function deleteTrack(db, id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_TRACKS, 'readwrite');
        const store = tx.objectStore(STORE_TRACKS);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        tx.onerror = () => reject(tx.error);
    });
}

function putTrack(db, track) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_TRACKS, 'readwrite');
        const store = tx.objectStore(STORE_TRACKS);
        const req = store.put(track);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        tx.onerror = () => reject(tx.error);
    });
}

function saveFilterTags(db, tags) {
    return putAll(db, STORE_FILTER_TAGS, tags);
}

function createStackItem(track, overrides = {}) {
    return {
        id: overrides.id ?? Date.now() + Math.random(),
        title: track.title,
        volume: overrides.volume ?? 80,
        isPlaying: overrides.isPlaying ?? true,
        icon: track.icon ?? 'fa-music',
        audioBuffer: null,
        gainNode: null,
        startOffset: 0,
        _source: null,
        _startedAt: 0,
        ...overrides
    };
}

function audioApp() {
    return {
        activeTab: 'dashboard',
        modalOpen: false,
        pendingSelection: null,
        selectedTag: 'All',
        editingTrackId: null,
        db: null,
        loading: true,
        uploadTrackName: '',
        uploadTrackTags: [],
        uploadAudioFile: null,
        audioContext: null,

        activeStack: [],
        /*
        [
            createStackItem({ title: 'Rainy Village', icon: 'fa-cloud-rain' }, { id: 101, volume: 60, isPlaying: false }),
            createStackItem({ title: 'Distant Thunder', icon: 'fa-bolt' }, { id: 102, volume: 30, isPlaying: false })
        ],
        */ 

        filterTags: [],
        tracks: [],

        getTrackTags(track) {
            if (Array.isArray(track.tags) && track.tags.length) return track.tags;
            if (track.tag != null && track.tag !== '') return [track.tag];
            return ['All'];
        },

        get filteredTracks() {
            if (this.selectedTag === 'All') return this.tracks;
            return this.tracks.filter(t => this.getTrackTags(t).includes(this.selectedTag));
        },

        getAudioContext() {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            return this.audioContext;
        },

        async ensureAudioContext() {
            const ctx = this.getAudioContext();
            if (ctx.state === 'suspended') await ctx.resume();
            return ctx;
        },

        async decodeAudioData(blob) {
            const ctx = this.getAudioContext();
            const arrayBuffer = await blob.arrayBuffer();
            return await ctx.decodeAudioData(arrayBuffer);
        },

        startPlayback(item) {
            if (!item.audioBuffer) return;
            const ctx = this.audioContext || this.getAudioContext();
            if (item._source) {
                try { item._source.stop(); } catch (_) {}
                item._source.disconnect();
            }
            if (!item.gainNode) {
                item.gainNode = ctx.createGain();
                item.gainNode.connect(ctx.destination);
            }
            item.gainNode.gain.setValueAtTime(item.volume / 100, ctx.currentTime);
            const source = ctx.createBufferSource();
            source.buffer = item.audioBuffer;
            source.loop = true;
            source.connect(item.gainNode);
            source.start(0, item.startOffset);
            item._source = source;
            item._startedAt = ctx.currentTime;
        },

        pausePlayback(item) {
            if (item._source) {
                const ctx = this.audioContext;
                if (ctx) {
                    item.startOffset = item.startOffset + (ctx.currentTime - item._startedAt);
                    if (item.startOffset < 0) item.startOffset = 0;
                }
                try { item._source.stop(); } catch (_) {}
                item._source.disconnect();
                item._source = null;
            }
        },

        togglePlay(track) {
            track.isPlaying = !track.isPlaying;
            if (track.isPlaying) {
                this.startPlayback(track);
            } else {
                this.pausePlayback(track);
            }
        },

        setTrackVolume(track) {
            if (track.gainNode && this.audioContext) {
                track.gainNode.gain.setValueAtTime(track.volume / 100, this.audioContext.currentTime);
            }
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

        async deleteAllTracks() {
            if (!this.db) return;
            try {
                await putAll(this.db, STORE_TRACKS, []);
                this.tracks = [];
            } catch (e) {
                console.error('Failed to delete tracks', e);
            }
        },

        blobToDataURL(blob) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(blob);
            });
        },

        dataURLToBlob(dataURL) {
            const [header, base64] = dataURL.split(',');
            const mime = (header.match(/:(.*?);/) || [])[1] || 'audio/mpeg';
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return new Blob([bytes], { type: mime });
        },

        async importData(file) {
            if (!file || !this.db) return;
            try {
                const text = await file.text();
                const payload = JSON.parse(text);
                if (!payload.tracks || !Array.isArray(payload.tracks)) {
                    console.error('Invalid export file: missing tracks array');
                    return;
                }
                if (payload.filterTags && Array.isArray(payload.filterTags)) {
                    const plainTags = payload.filterTags.map(t => ({ name: String(t.name), emoji: String(t.emoji) }));
                    await saveFilterTags(this.db, plainTags);
                    this.filterTags = plainTags;
                }
                for (const track of payload.tracks) {
                    const id = Math.floor(Date.now() + Math.random() * 1000);
                    const audioData = track.audioData && typeof track.audioData === 'string' && track.audioData.startsWith('data:')
                        ? this.dataURLToBlob(track.audioData)
                        : null;
                    const tags = Array.isArray(track.tags) ? track.tags : (track.tag != null ? [track.tag] : ['All']);
                    const entry = {
                        id,
                        title: track.title || 'Untitled',
                        duration: track.duration || '0:00',
                        tags: tags.map(String),
                        audioData
                    };
                    await addTrack(this.db, entry);
                    this.tracks = [...this.tracks, entry];
                }
            } catch (e) {
                console.error('Import failed', e);
            }
        },

        triggerImportInput() {
            this.$refs.importFileInput?.click();
        },

        async exportData() {
            const payload = {
                version: 1,
                exportedAt: new Date().toISOString(),
                filterTags: this.filterTags,
                tracks: []
            };
            for (const track of this.tracks) {
                const exported = {
                    id: track.id,
                    title: track.title,
                    duration: track.duration || '0:00',
                    tags: this.getTrackTags(track)
                };
                if (track.audioData && track.audioData instanceof Blob) {
                    exported.audioData = await this.blobToDataURL(track.audioData);
                } else {
                    exported.audioData = null;
                }
                payload.tracks.push(exported);
            }
            const json = JSON.stringify(payload);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `stackloop-export-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
        },

        setUploadAudioFile(file) {
            this.uploadAudioFile = file || null;
        },

        clearUploadForm() {
            this.uploadTrackName = '';
            this.uploadTrackTags = [];
            this.uploadAudioFile = null;
        },

        toggleUploadTag(tagName) {
            const i = this.uploadTrackTags.indexOf(tagName);
            if (i === -1) this.uploadTrackTags = [...this.uploadTrackTags, tagName];
            else this.uploadTrackTags = this.uploadTrackTags.filter((_, j) => j !== i);
        },

        async saveTrackToLibrary(track) {
            const id = Number.isInteger(track.id) ? track.id : Math.floor(Date.now() + Math.random() * 1000);
            const tags = Array.isArray(track.tags) ? [...track.tags] : (track.tag != null ? [track.tag] : ['All']);
            const entry = {
                id,
                title: track.title,
                duration: track.duration || '0:00',
                tags,
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

        async deleteTrackFromLibrary(track) {
            if (!this.db) return;
            try {
                await deleteTrack(this.db, track.id);
                this.tracks = this.tracks.filter(t => t.id !== track.id);
            } catch (e) {
                console.error('Failed to delete track', e);
            }
        },

        async toggleTrackTag(track, tagName) {
            const current = this.getTrackTags(track).filter(t => t !== 'All');
            const hasTag = current.includes(tagName);
            const newTags = hasTag ? current.filter(t => t !== tagName) : [...current, tagName];
            const tags = newTags.length ? newTags : ['All'];
            const plainTrack = {
                id: track.id,
                title: track.title,
                duration: track.duration || '0:00',
                tags: [...tags],
                audioData: track.audioData ?? null
            };
            if (!this.db) return;
            try {
                await putTrack(this.db, plainTrack);
                this.tracks = this.tracks.map(t => t.id === track.id ? { ...t, tags: [...tags] } : t);
            } catch (e) {
                console.error('Failed to update track tags', e);
            }
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
                this.activeStack.forEach(item => {
                    this.pausePlayback(item);
                    if (item.gainNode) item.gainNode.disconnect();
                });
                this.activeStack = [];
            }
            this.pushToStack(this.pendingSelection);
        },

        async pushToStack(track) {
            await this.ensureAudioContext();
            const item = createStackItem(track);
            this.activeStack.push(item);
            if (track.audioData) {
                try {
                    item.audioBuffer = await this.decodeAudioData(track.audioData);
                    if (item.isPlaying) this.startPlayback(item);
                } catch (e) {
                    console.error('Failed to decode audio', e);
                    item.isPlaying = false;
                }
            } else {
                item.isPlaying = false;
            }
        },

        removeFromStack(index) {
            const item = this.activeStack[index];
            this.pausePlayback(item);
            if (item.gainNode) item.gainNode.disconnect();
            this.activeStack.splice(index, 1);
        },

        stopAll() {
            this.activeStack.forEach(item => {
                this.pausePlayback(item);
                item.isPlaying = false;
            });
        }
    };
}
