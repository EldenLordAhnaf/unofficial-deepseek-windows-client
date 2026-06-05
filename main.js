const { app, BrowserWindow, Tray, Menu, nativeImage, Notification, globalShortcut, ipcMain, nativeTheme } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const settings = require('electron-settings');

let mainWindow = null;
let tray = null;

app.setAppUserModelId('com.deepseek.unofficial-deepseek');

async function applyTheme(theme) {
    const themeToApply = theme || 'auto';
    
    if (themeToApply === 'auto') {
        nativeTheme.themeSource = 'system';
    } else if (themeToApply === 'light') {
        nativeTheme.themeSource = 'light';
    } else if (themeToApply === 'dark') {
        nativeTheme.themeSource = 'dark';
    }
    
    await settings.set('theme', themeToApply);
}

async function initializeTheme() {
    const savedTheme = await settings.get('theme');
    const theme = savedTheme || 'auto';
    await applyTheme(theme);
}

async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1920,
        height: 1080,
        icon: path.join(__dirname, 'icon.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        title: 'DeepSeek (Unofficial Client)'
    });

    mainWindow.loadURL('https://chat.deepseek.com');

    mainWindow.webContents.on('did-finish-load', () => {
        setTimeout(() => {
            mainWindow.webContents.executeJavaScript(`
                (function() {
                    if (window.__notificationObserver) return;
                    const observer = new MutationObserver(() => {
                        const selectors = [
                            '[data-testid="assistant-message"]',
                            '.assistant-message',
                            '[role="article"]:has(.assistant)',
                            '.message:last-child'
                        ];
                        let lastMessage = null;
                        for (const sel of selectors) {
                            const elements = document.querySelectorAll(sel);
                            if (elements.length) {
                                lastMessage = elements[elements.length - 1];
                                if (lastMessage.innerText && lastMessage.innerText.length > 10) break;
                            }
                        }
                        if (lastMessage && !lastMessage.hasAttribute('data-notified')) {
                            lastMessage.setAttribute('data-notified', 'true');
                            const text = lastMessage.innerText.slice(0, 200);
                            window.electronAPI.notify('DeepSeek Response', text);
                        }
                    });
                    observer.observe(document.body, { childList: true, subtree: true });
                    window.__notificationObserver = observer;
                })();
            `);
        }, 3000);
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    mainWindow.on('close', (event) => {
        if (process.platform !== 'darwin') {
            event.preventDefault();
            mainWindow.hide();
        }
    });
}

function createTray() {
    let trayIcon = nativeImage.createFromPath(path.join(__dirname, 'icon.ico'));
    trayIcon = trayIcon.resize({ width: 32, height: 32 });
    tray = new Tray(trayIcon);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show DeepSeek',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                } else {
                    createWindow();
                }
            }
        },
        {
            label: 'New Chat',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                    mainWindow.webContents.executeJavaScript(`
                        document.querySelector('[aria-label="New chat"], [data-testid="new-chat-button"]')?.click();
                    `);
                }
            }
        },
        {
            label: 'Settings',
            click: () => openSettingsWindow()
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                app.isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Unofficial DeepSeek Client');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        } else {
            createWindow();
        }
    });
}

let settingsWindow = null;

function openSettingsWindow() {
    if (settingsWindow) {
        settingsWindow.focus();
        return;
    }

    settingsWindow = new BrowserWindow({
        width: 500,
        height: 400,
        parent: mainWindow,
        modal: true,
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'settings-preload.js')
        },
        title: 'Settings - DeepSeek Unofficial'
    });

    settingsWindow.loadFile('settings.html');
    settingsWindow.once('ready-to-show', () => {
        settingsWindow.show();
    });

    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });
}

function setupAutoUpdater() {
    autoUpdater.checkForUpdatesAndNotify();
    setInterval(() => {
        autoUpdater.checkForUpdatesAndNotify();
    }, 4 * 60 * 60 * 1000);

    autoUpdater.on('update-available', (info) => {
        new Notification({
            title: 'Update Available',
            body: `Version ${info.version} is ready to download.`
        }).show();
    });

    autoUpdater.on('update-downloaded', (info) => {
        new Notification({
            title: 'Update Ready',
            body: 'Restart now to install the update.'
        }).show();

        setTimeout(() => {
            autoUpdater.quitAndInstall();
        }, 10000);
    });
}

app.whenReady().then(async () => {
    await initializeTheme();

    createWindow();
    createTray();
    setupAutoUpdater();

    globalShortcut.register('Ctrl+Shift+Space', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.show();
                mainWindow.focus();
            }
        }
    });

    globalShortcut.register('Ctrl+Shift+D', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
            mainWindow.webContents.executeJavaScript(`
                document.querySelector('textarea, [contenteditable="true"]')?.focus();
            `);
        }
    });
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    } else {
        mainWindow.show();
    }
});

ipcMain.on('show-notification', (event, title, body) => {
    new Notification({
        title: title,
        body: body,
        silent: false
    }).show();
});

ipcMain.on('set-theme', async (event, theme) => {
    await applyTheme(theme);
    if (mainWindow) {
        mainWindow.webContents.reload();
    }
});

ipcMain.on('check-for-updates', () => {
    autoUpdater.checkForUpdatesAndNotify();
});

app.on('before-quit', () => {
    app.isQuitting = true;
});