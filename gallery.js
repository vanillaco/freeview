// Global state
let allImageFiles = [];
let currentImageFiles = [];
let currentFolder = 'All Files';
let rootFolderName = '';
let objectURLs = new Set();
let currentLightboxIndex = 0;

// Favourites
const FAVOURITES_KEY = 'freeview-favourites';
let favourites = loadFavourites();

// Lightbox panning state
let isPanning = false;
let startX = 0, startY = 0;
let panX = 0, panY = 0;

// Progressive rendering state
let renderedCount = 0;
const CHUNK_SIZE = 60;
let scrollObserver = null;

// Supported image formats
const SUPPORTED_FORMATS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.tiff'];

// DOM Elements
const folderInput = document.getElementById('folderInput');
const gallery = document.getElementById('gallery');
const sidebarFolders = document.getElementById('sidebarFolders');
const folderTitle = document.getElementById('folderTitle');
const sortSelect = document.getElementById('sortSelect');
const connectBtn = document.getElementById('connectBtn');
const hamburger = document.getElementById('folderSheetBtn');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');

const itemCount = document.getElementById('itemCount');
const totalSize = document.getElementById('totalSize');
const thumbnailSize = document.getElementById('thumbnailSize');
const loadingSpinner = document.getElementById('loadingSpinner');
const searchInput = document.getElementById('searchInput');
const lightbox = document.getElementById('lightbox');
const lightboxImage = document.getElementById('lightboxImage');
const lightboxFilename = document.getElementById('lightboxFilename');
const lightboxPosition = document.getElementById('lightboxPosition');
const zoomSlider = document.getElementById('zoomSlider');
const zoomLevel = document.getElementById('zoomLevel');

// Favourites
function loadFavourites() {
    try {
        const stored = localStorage.getItem(FAVOURITES_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

function saveFavourites() {
    try {
        localStorage.setItem(FAVOURITES_KEY, JSON.stringify(favourites));
    } catch {}
}

function isFavourite(path) {
    return favourites.some(f => f.path === path);
}

function toggleFavourite(path, name) {
    const idx = favourites.findIndex(f => f.path === path);
    if (idx !== -1) {
        favourites.splice(idx, 1);
    } else {
        favourites.push({ path, name });
    }
    saveFavourites();
    renderFavourites();
    refreshStarButtons();
}

function renderFavourites() {
    const container = document.getElementById('sidebarFavourites');
    const section = document.getElementById('favouritesSection');
    container.innerHTML = '';

    if (favourites.length === 0) {
        section.classList.remove('has-items');
        return;
    }

    section.classList.add('has-items');
    favourites.forEach(fav => {
        const item = document.createElement('div');
        item.className = 'sidebar-item';
        item.dataset.path = fav.path;
        item.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 4a2 2 0 0 1 2-2h3.586a1 1 0 0 1 .707.293l1.414 1.414a1 1 0 0 0 .707.293H12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4z"/>
            </svg>
            <span>${escHtml(fav.name)}</span>
            <button class="star-btn filled" title="Remove from Favourites">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M6 0l1.5 4.5H12L8.5 7.5l1.5 4.5L6 9l-4 3 1.5-4.5L0 4.5h4.5z"/>
                </svg>
            </button>
        `;
        const star = item.querySelector('.star-btn');
        star.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavourite(fav.path, fav.name);
            if (currentFolder === fav.path) {
                currentFolder = 'All Files';
                renderGallery();
            }
        });
        item.addEventListener('click', () => {
            const folderExists = allImageFiles.some(file => {
                const relPath = getRelativePath(file);
                return relPath && relPath.startsWith(fav.path + '/');
            });
            if (folderExists) {
                document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                currentFolder = fav.path;
                renderGallery();
            }
        });
        if (currentFolder === fav.path) {
            item.classList.add('active');
        }
        container.appendChild(item);
    });
}

function refreshStarButtons() {
    document.querySelectorAll('.sidebar-item .star-btn').forEach(btn => {
        const item = btn.closest('.sidebar-item');
        const path = item.dataset.path;
        if (path && isFavourite(path)) {
            btn.classList.add('filled');
            btn.title = 'Remove from Favourites';
            btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M6 0l1.5 4.5H12L8.5 7.5l1.5 4.5L6 9l-4 3 1.5-4.5L0 4.5h4.5z"/></svg>`;
        } else if (path) {
            btn.classList.remove('filled');
            btn.title = 'Add to Favourites';
            btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1"><path d="M6 1l1.5 4.5H12L8.5 7.5l1.5 4.5L6 9l-4 3 1.5-4.5L0 4.5h4.5z"/></svg>`;
        }
    });
}

function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

async function createThumbnailURL(file, maxDim) {
    try {
        const bitmap = await createImageBitmap(file, {
            resizeWidth: maxDim,
            resizeHeight: maxDim,
            resizeQuality: 'high'
        });
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        return new Promise(resolve => {
            canvas.toBlob(blob => resolve(URL.createObjectURL(blob)), 'image/jpeg', 0.85);
        });
    } catch {
        return URL.createObjectURL(file);
    }
}

function debounce(fn, ms) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

function disconnectImageObservers() {
    document.querySelectorAll('.gallery-item').forEach(item => {
        if (item._observer) {
            item._observer.disconnect();
            delete item._observer;
        }
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', init);

function init() {
    setupEventListeners();
    setupDragAndDrop();
    setupSidebarResize();
    setupLightboxPanning();
    setupMobileSidebar();
    setupLightboxSwipe();
    renderFavourites();
}

// Event Listeners
function setupEventListeners() {
    connectBtn.addEventListener('click', (e) => {
        e.preventDefault();
        handleConnectDisconnect();
    });
    folderInput.addEventListener('change', handleFolderSelection);
    sortSelect.addEventListener('change', handleSort);
    thumbnailSize.addEventListener('input', handleThumbnailResize);
    searchInput.addEventListener('input', debounce(() => renderGallery(), 200));
    
    // Lightbox controls
    document.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
    document.querySelector('.lightbox-prev').addEventListener('click', showPrevImage);
    document.querySelector('.lightbox-next').addEventListener('click', showNextImage);
    zoomSlider.addEventListener('input', handleZoom);
    
    // Keyboard controls
    document.addEventListener('keydown', handleKeyboard);
}

// Connect/Disconnect Handler
function handleConnectDisconnect() {
    if (connectBtn.classList.contains('connected')) {
        // Disconnect
        handleClear();
        connectBtn.textContent = 'Connect';
        connectBtn.classList.remove('connected');
    } else {
        // Connect - open folder dialog
        folderInput.click();
    }
}

// File Handling
async function handleFolderSelection(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
    
    await processFiles(files);
}

// Drag and Drop
function setupDragAndDrop() {
    document.body.addEventListener('dragover', (e) => {
        e.preventDefault();
        gallery.classList.add('drag-over');
    });
    
    document.body.addEventListener('dragleave', (e) => {
        // Only remove if leaving the window
        if (e.target === document.body) {
            gallery.classList.remove('drag-over');
        }
    });
    
    document.body.addEventListener('drop', async (e) => {
        e.preventDefault();
        gallery.classList.remove('drag-over');
        
        const items = e.dataTransfer.items;
        if (items) {
            const files = [];
            for (let i = 0; i < items.length; i++) {
                const item = items[i].webkitGetAsEntry();
                if (item) {
                    await traverseDirectory(item, '', files);
                }
            }
            if (files.length > 0) {
                await processFiles(files);
            }
        }
    });
}

async function traverseDirectory(item, path, files) {
    if (item.isFile) {
        return new Promise((resolve) => {
            item.file((file) => {
                const ext = '.' + file.name.split('.').pop().toLowerCase();
                if (SUPPORTED_FORMATS.includes(ext)) {
                    file.relativePath = path + file.name;
                    files.push(file);
                }
                resolve();
            });
        });
    } else if (item.isDirectory) {
        const dirReader = item.createReader();
        return new Promise((resolve) => {
            dirReader.readEntries(async (entries) => {
                for (const entry of entries) {
                    await traverseDirectory(entry, path + item.name + '/', files);
                }
                resolve();
            });
        });
    }
}

// Sidebar Resize
function setupSidebarResize() {
    const resizer = document.getElementById('resizer');
    const sidebar = document.getElementById('sidebar');
    let isResizing = false;
    
    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const newWidth = e.clientX;
        if (newWidth > 150 && newWidth < 400) {
            sidebar.style.width = newWidth + 'px';
        }
    });
    
    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}

// iOS bottom sheet (iPhone folder picker)
function setupMobileSidebar() {
    if (!hamburger) return;

    function openSheet() {
        document.getElementById('sidebar').classList.add('open');
        sidebarBackdrop.classList.add('visible');
        document.body.classList.add('sheet-open');
    }

    function closeSheet() {
        document.getElementById('sidebar').classList.remove('open');
        sidebarBackdrop.classList.remove('visible');
        document.body.classList.remove('sheet-open');
    }

    hamburger.addEventListener('click', (e) => {
        e.stopPropagation();
        const sheet = document.getElementById('sidebar');
        if (sheet.classList.contains('open')) {
            closeSheet();
        } else {
            openSheet();
        }
    });

    sidebarBackdrop.addEventListener('click', closeSheet);

    document.addEventListener('click', (e) => {
        const item = e.target.closest('.sidebar-item');
        if (item && window.innerWidth <= 768) {
            closeSheet();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && window.innerWidth <= 768) {
            const sheet = document.getElementById('sidebar');
            if (sheet.classList.contains('open')) {
                closeSheet();
            }
        }
    });
}

// Lightbox touch swipe
function setupLightboxSwipe() {
    let startX = 0;
    let startY = 0;
    let isSwiping = false;

    lightboxImage.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        isSwiping = true;
    }, { passive: true });

    lightboxImage.addEventListener('touchmove', (e) => {
        if (!isSwiping) return;
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;
        if (Math.abs(dx) > Math.abs(dy) && zoomSlider.value <= 100) {
            e.preventDefault();
        }
    }, { passive: false });

    lightboxImage.addEventListener('touchend', (e) => {
        if (!isSwiping) return;
        isSwiping = false;
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 2 && zoomSlider.value <= 100) {
            if (dx > 0) showPrevImage();
            else showNextImage();
        }
    }, { passive: true });
}

function getRelativePath(file) {
    return file.relativePath || file.webkitRelativePath || '';
}

async function processFiles(files) {
    // Don't show loading yet - will show during renderGallery
    
    // Clear previous object URLs
    revokeAllObjectURLs();
    
    // Filter image files
    const imageFiles = files.filter(file => {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        return SUPPORTED_FORMATS.includes(ext);
    });
    
    if (imageFiles.length === 0) {
        showEmptyState();
        return;
    }
    
    // Extract root folder name
    const relPath = getRelativePath(imageFiles[0]);
    if (relPath) {
        rootFolderName = relPath.split('/')[0];
        folderTitle.textContent = rootFolderName;
    } else {
        // For drag and drop without relative path, use a generic name
        rootFolderName = 'Selected Folder';
        folderTitle.textContent = rootFolderName;
    }
    
    allImageFiles = imageFiles;
    currentImageFiles = imageFiles;
    currentFolder = 'All Files';
    
    // Build sidebar
    buildSidebar();
    
    // Render gallery (this will show loading and wait for all images)
    await renderGallery();
    
    // Update button to show "Disconnect"
    connectBtn.textContent = 'Disconnect';
    connectBtn.classList.add('connected');
    
}

function buildSidebar() {
    sidebarFolders.innerHTML = '';
    
    // Add "All Files" option
    const allFilesItem = createSidebarItem('All Files', allImageFiles.length);
    allFilesItem.classList.add('active');
    allFilesItem.addEventListener('click', (e) => handleFolderFilter(e, 'All Files'));
    sidebarFolders.appendChild(allFilesItem);
    
    // Extract unique folders
    const folders = {};
    allImageFiles.forEach(file => {
        const relPath = getRelativePath(file);
        if (relPath) {
            const parts = relPath.split('/');
            if (parts.length > 2) {
                const folderPath = parts.slice(0, -1).join('/');
                const folderName = parts[parts.length - 2];
                if (!folders[folderPath]) {
                    folders[folderPath] = {
                        name: folderName,
                        path: folderPath,
                        count: 0
                    };
                }
                folders[folderPath].count++;
            }
        }
    });
    
    // Add folder items (sorted alphabetically)
    Object.values(folders).sort((a, b) => a.name.localeCompare(b.name)).forEach(folder => {
        const item = createSidebarItem(folder.name, folder.count, folder.path);
        const star = item.querySelector('.star-btn');
        star.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavourite(folder.path, folder.name);
        });
        item.addEventListener('click', (e) => {
            if (e.target.closest('.star-btn')) return;
            handleFolderFilter(e, folder.path);
        });
        sidebarFolders.appendChild(item);
    });

    renderFavourites();
}

function createSidebarItem(name, count, folderPath) {
    const item = document.createElement('div');
    item.className = 'sidebar-item';
    item.dataset.folder = name;
    if (folderPath) item.dataset.path = folderPath;
    item.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 4a2 2 0 0 1 2-2h3.586a1 1 0 0 1 .707.293l1.414 1.414a1 1 0 0 0 .707.293H12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4z"/>
        </svg>
        <span>${name}</span>
        <div class="sidebar-item-end">
            ${folderPath ? `<button class="star-btn ${isFavourite(folderPath) ? 'filled' : ''}" title="${isFavourite(folderPath) ? 'Remove from Favourites' : 'Add to Favourites'}">${isFavourite(folderPath)
                ? `<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M6 0l1.5 4.5H12L8.5 7.5l1.5 4.5L6 9l-4 3 1.5-4.5L0 4.5h4.5z"/></svg>`
                : `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1"><path d="M6 1l1.5 4.5H12L8.5 7.5l1.5 4.5L6 9l-4 3 1.5-4.5L0 4.5h4.5z"/></svg>`}</button>` : ''}
            <span class="folder-count">${count}</span>
        </div>
    `;
    return item;
}

function handleFolderFilter(event, folderPath) {
    currentFolder = folderPath;
    renderGallery();
    refreshActiveItems();
}

function refreshActiveItems() {
    document.querySelectorAll('.sidebar-item').forEach(item => {
        if (item.dataset.path === currentFolder || item.dataset.folder === currentFolder) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

function getFilteredAndSortedFiles() {
    let files = [];
    if (currentFolder === 'All Files') {
        files = [...allImageFiles];
    } else {
        files = allImageFiles.filter(file => {
            const relPath = getRelativePath(file);
            if (relPath) {
                const fileFolderPath = relPath.split('/').slice(0, -1).join('/');
                return fileFolderPath === currentFolder;
            }
            return false;
        });
    }
    
    // Apply search filter if input has value
    const searchQuery = searchInput.value.trim().toLowerCase();
    if (searchQuery) {
        files = files.filter(file => file.name.toLowerCase().includes(searchQuery));
    }
    
    return sortFiles(files);
}

async function renderGallery() {
    // Clear gallery immediately and show loading
    disconnectImageObservers();
    gallery.innerHTML = '';
    showLoading();
    
    // Revoke previous thumbnail URLs to prevent memory leaks
    revokeAllObjectURLs();
    
    currentImageFiles = getFilteredAndSortedFiles();
    renderedCount = 0;
    
    if (currentImageFiles.length === 0) {
        hideLoading();
        showEmptyState();
        updateStatusBar();
        return;
    }
    
    // Create grid
    const gridContainer = document.createElement('div');
    gridContainer.className = 'gallery-grid';
    gridContainer.id = 'galleryGrid';
    gallery.appendChild(gridContainer);
    
    // Create sentinel for scroll observing
    const sentinel = document.createElement('div');
    sentinel.id = 'scrollSentinel';
    sentinel.style.height = '20px';
    sentinel.style.margin = '20px 0';
    gallery.appendChild(sentinel);
    
    // Render first chunk
    renderNextChunk();
    
    // Setup IntersectionObserver
    if (scrollObserver) {
        scrollObserver.disconnect();
    }
    
    scrollObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            renderNextChunk();
        }
    }, {
        root: gallery,
        rootMargin: '400px'
    });
    
    scrollObserver.observe(sentinel);
    
    updateStatusBar();
    hideLoading();
    refreshActiveItems();
}

function renderNextChunk() {
    if (renderedCount >= currentImageFiles.length) {
        // Disconnect observer if everything is loaded
        if (scrollObserver) {
            const sentinel = document.getElementById('scrollSentinel');
            if (sentinel) sentinel.style.display = 'none';
        }
        return;
    }
    
    const gridContainer = document.getElementById('galleryGrid');
    if (!gridContainer) return;
    
    const nextChunk = currentImageFiles.slice(renderedCount, renderedCount + CHUNK_SIZE);
    
    nextChunk.forEach((file, index) => {
        const itemIndex = renderedCount + index;
        
        const item = document.createElement('div');
        item.className = 'gallery-item';
        
        const img = document.createElement('img');
        img.alt = file.name;
        img.loading = 'lazy';
        
        const name = document.createElement('div');
        name.className = 'gallery-item-name';
        name.textContent = file.name;
        
        item.appendChild(img);
        item.appendChild(name);
        
        item.addEventListener('click', () => openLightbox(itemIndex));
        
        // Lazy thumbnail — downsample when visible, revoke when off-screen
        let objectURL = null;
        let pending = false;
        const observer = new IntersectionObserver((entries) => {
            const entry = entries[0];
            if (entry.isIntersecting) {
                if (objectURL || pending) return;
                pending = true;
                createThumbnailURL(file, 600).then(url => {
                    if (pending && item.isConnected && !objectURL) {
                        objectURL = url;
                        objectURLs.add(url);
                        img.src = url;
                    } else {
                        URL.revokeObjectURL(url);
                    }
                    pending = false;
                });
            } else {
                pending = false;
                if (objectURL) {
                    URL.revokeObjectURL(objectURL);
                    objectURLs.delete(objectURL);
                    objectURL = null;
                    img.removeAttribute('src');
                }
            }
        }, {
            root: gallery,
            rootMargin: '500px 0px'
        });
        
        observer.observe(item);
        item._observer = observer;
        
        gridContainer.appendChild(item);
    });
    
    renderedCount += nextChunk.length;
}

function showEmptyState() {
    gallery.innerHTML = `
        <div class="empty-state">
            <svg width="80" height="80" viewBox="0 0 32 32" fill="currentColor" opacity="0.25">
                <path d="M6.2556 25.5333 L24.8778 25.5333 C26.8889 25.5333 27.9 24.4111 27.9 22.2778 L21.3 16.0778 C20.8111 15.6222 20.2222 15.3889 19.6222 15.3889 C19.0111 15.3889 18.4667 15.6 17.9555 16.0555 L12.9333 20.5444 L10.8778 18.6889 C10.4111 18.2666 9.9 18.0555 9.3778 18.0555 C8.8778 18.0555 8.4 18.2555 7.9444 18.6777 L3.7111 22.5 C3.7778 24.5111 4.6 25.5333 6.2556 25.5333 Z M6.3333 26.3111 L25.5555 26.3111 C27.8889 26.3111 29.0444 25.1666 29.0444 22.8777 L29.0444 9.3 C29.0444 7.0111 27.8889 5.8555 25.5555 5.8555 L6.3333 5.8555 C4.0111 5.8555 2.8444 7.0111 2.8444 9.3 L2.8444 22.8777 C2.8444 25.1666 4.0111 26.3111 6.3333 26.3111 Z M6.3556 24.5222 C5.2444 24.5222 4.6333 23.9333 4.6333 22.7777 L4.6333 9.4 C4.6333 8.2444 5.2444 7.6444 6.3556 7.6444 L25.5333 7.6444 C26.6333 7.6444 27.2555 8.2444 27.2555 9.4 L27.2555 22.7777 C27.2555 23.9333 26.6333 24.5222 25.5333 24.5222 Z"/>
                <path d="M11.1222 16.1889 C12.5556 16.1889 13.7333 15.0111 13.7333 13.5666 C13.7333 12.1333 12.5556 10.9444 11.1222 10.9444 C9.6778 10.9444 8.5 12.1333 8.5 13.5666 C8.5 15.0111 9.6778 16.1889 11.1222 16.1889 Z"/>
            </svg>
            <p>No images found</p>
        </div>
    `;
}

// Sorting
function sortFiles(files) {
    const sortBy = sortSelect.value;
    const sorted = [...files];
    
    switch (sortBy) {
        case 'name-asc':
            sorted.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'name-desc':
            sorted.sort((a, b) => b.name.localeCompare(a.name));
            break;
        case 'date-asc':
            sorted.sort((a, b) => a.lastModified - b.lastModified);
            break;
        case 'date-desc':
            sorted.sort((a, b) => b.lastModified - a.lastModified);
            break;
        case 'size-asc':
            sorted.sort((a, b) => a.size - b.size);
            break;
        case 'size-desc':
            sorted.sort((a, b) => b.size - a.size);
            break;
    }
    
    return sorted;
}

function handleSort() {
    renderGallery();
}

// Status Bar
function updateStatusBar() {
    const count = currentImageFiles.length;
    const totalBytes = currentImageFiles.reduce((sum, file) => sum + file.size, 0);
    
    itemCount.textContent = `${count} ${count === 1 ? 'item' : 'items'}`;
    totalSize.textContent = formatBytes(totalBytes);
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Thumbnail Resize
function handleThumbnailResize() {
    const size = thumbnailSize.value;
    document.documentElement.style.setProperty('--thumb-size', `${size}px`);
}

// Lightbox
function openLightbox(index) {
    // Ensure that the target item is actually rendered in the DOM
    while (index >= renderedCount && renderedCount < currentImageFiles.length) {
        renderNextChunk();
    }
    
    currentLightboxIndex = index;
    const file = currentImageFiles[index];
    
    // Clean up previous lightbox image URL if any to prevent memory leak
    if (lightboxImage.src) {
        URL.revokeObjectURL(lightboxImage.src);
        objectURLs.delete(lightboxImage.src);
    }
    
    const objectURL = URL.createObjectURL(file);
    objectURLs.add(objectURL);
    
    lightboxImage.src = objectURL;
    lightboxFilename.textContent = file.name;
    lightboxPosition.textContent = `${index + 1} of ${currentImageFiles.length}`;
    
    // Reset panning offset when loading new image
    panX = 0;
    panY = 0;
    
    lightbox.style.display = 'flex';
    zoomSlider.value = 100;
    zoomLevel.textContent = '100%';
    updateImageTransform();
}

function closeLightbox() {
    lightbox.style.display = 'none';
    if (lightboxImage.src) {
        URL.revokeObjectURL(lightboxImage.src);
        objectURLs.delete(lightboxImage.src);
        lightboxImage.src = '';
    }
}

function showPrevImage() {
    if (currentImageFiles.length <= 1) return;
    const prevIndex = (currentLightboxIndex - 1 + currentImageFiles.length) % currentImageFiles.length;
    openLightbox(prevIndex);
}

function showNextImage() {
    if (currentImageFiles.length <= 1) return;
    const nextIndex = (currentLightboxIndex + 1) % currentImageFiles.length;
    openLightbox(nextIndex);
}

function handleZoom() {
    const scale = zoomSlider.value / 100;
    if (scale <= 1) {
        panX = 0;
        panY = 0;
        lightboxImage.style.cursor = 'default';
    } else {
        lightboxImage.style.cursor = 'grab';
    }
    updateImageTransform();
    zoomLevel.textContent = `${zoomSlider.value}%`;
}

// Keyboard Controls
function handleKeyboard(e) {
    if (lightbox.style.display === 'flex') {
        switch (e.key) {
            case 'Escape':
                closeLightbox();
                break;
            case 'ArrowLeft':
                showPrevImage();
                break;
            case 'ArrowRight':
                showNextImage();
                break;
        }
    }
}

// Lightbox Panning
function setupLightboxPanning() {
    lightboxImage.addEventListener('mousedown', (e) => {
        if (zoomSlider.value <= 100) return;
        e.preventDefault();
        isPanning = true;
        startX = e.clientX - panX;
        startY = e.clientY - panY;
        lightboxImage.style.cursor = 'grabbing';
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        panX = e.clientX - startX;
        panY = e.clientY - startY;
        updateImageTransform();
    });
    
    document.addEventListener('mouseup', () => {
        if (isPanning) {
            isPanning = false;
            lightboxImage.style.cursor = 'grab';
        }
    });
}

function updateImageTransform() {
    const scale = zoomSlider.value / 100;
    lightboxImage.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
}

// Clear
function handleClear() {
    // Revoke all object URLs
    revokeAllObjectURLs();
    disconnectImageObservers();
    
    // Clear state
    allImageFiles = [];
    currentImageFiles = [];
    currentFolder = 'All Files';
    rootFolderName = '';
    
    // Clear UI
    gallery.innerHTML = `
        <div class="empty-state">
            <svg width="80" height="80" viewBox="0 0 32 32" fill="currentColor" opacity="0.25">
                <path d="M6.2556 25.5333 L24.8778 25.5333 C26.8889 25.5333 27.9 24.4111 27.9 22.2778 L21.3 16.0778 C20.8111 15.6222 20.2222 15.3889 19.6222 15.3889 C19.0111 15.3889 18.4667 15.6 17.9555 16.0555 L12.9333 20.5444 L10.8778 18.6889 C10.4111 18.2666 9.9 18.0555 9.3778 18.0555 C8.8778 18.0555 8.4 18.2555 7.9444 18.6777 L3.7111 22.5 C3.7778 24.5111 4.6 25.5333 6.2556 25.5333 Z M6.3333 26.3111 L25.5555 26.3111 C27.8889 26.3111 29.0444 25.1666 29.0444 22.8777 L29.0444 9.3 C29.0444 7.0111 27.8889 5.8555 25.5555 5.8555 L6.3333 5.8555 C4.0111 5.8555 2.8444 7.0111 2.8444 9.3 L2.8444 22.8777 C2.8444 25.1666 4.0111 26.3111 6.3333 26.3111 Z M6.3556 24.5222 C5.2444 24.5222 4.6333 23.9333 4.6333 22.7777 L4.6333 9.4 C4.6333 8.2444 5.2444 7.6444 6.3556 7.6444 L25.5333 7.6444 C26.6333 7.6444 27.2555 8.2444 27.2555 9.4 L27.2555 22.7777 C27.2555 23.9333 26.6333 24.5222 25.5333 24.5222 Z"/>
                <path d="M11.1222 16.1889 C12.5556 16.1889 13.7333 15.0111 13.7333 13.5666 C13.7333 12.1333 12.5556 10.9444 11.1222 10.9444 C9.6778 10.9444 8.5 12.1333 8.5 13.5666 C8.5 15.0111 9.6778 16.1889 11.1222 16.1889 Z"/>
            </svg>
            <p>Drop a folder here or click "Connect" to begin</p>
        </div>
    `;
    sidebarFolders.innerHTML = '';
    renderFavourites();
    folderTitle.textContent = 'Freeview';
    folderInput.value = '';
    
    // Reset connection controls in toolbar
    connectBtn.textContent = 'Connect';
    connectBtn.classList.remove('connected');
    
    // Clear search input
    searchInput.value = '';
    
    updateStatusBar();
}

// Loading with Minimum Duration of 200ms
let loadingStartTime = 0;

function showLoading() {
    loadingStartTime = Date.now();
    loadingSpinner.style.display = 'flex';
}

function hideLoading() {
    const elapsed = Date.now() - loadingStartTime;
    const minDuration = 200;
    if (elapsed < minDuration) {
        setTimeout(() => {
            loadingSpinner.style.display = 'none';
        }, minDuration - elapsed);
    } else {
        loadingSpinner.style.display = 'none';
    }
}

// Memory Management
function revokeAllObjectURLs() {
    objectURLs.forEach(url => URL.revokeObjectURL(url));
    objectURLs.clear();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    revokeAllObjectURLs();
});