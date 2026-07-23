/**
 * This file will automatically be loaded by vite and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/tutorial/application-architecture#main-and-renderer-processes
 *
 * By default, Node.js integration in this file is disabled. When enabling Node.js integration
 * in a renderer process, please be aware of potential security implications. You can read
 * more about security risks here:
 *
 * https://electronjs.org/docs/tutorial/security
 *
 * To enable Node.js integration in this file, open up `main.js` and enable the `nodeIntegration`
 * flag:
 *
 * ```
 *  // Create the browser window.
 *  mainWindow = new BrowserWindow({
 *    width: 800,
 *    height: 600,
 *    webPreferences: {
 *      nodeIntegration: true
 *    }
 *  });
 * ```
 */

import { createApp } from "vue";
import { createPinia } from 'pinia';
import axios from 'axios';
import App from "./App.vue";
import { authService } from './services/auth.service.js';
import { createI18nPlugin } from './i18n/index.js';
import { installLegacyI18nBridge } from './i18n/legacy.js';

// Add axios interceptor to include auth headers on all requests
axios.interceptors.request.use(
  (config) => {
    const headers = authService.getAuthHeaders();
    if (headers.Authorization) {
      config.headers.Authorization = headers.Authorization;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Add axios response interceptor to handle 401 errors with automatic re-authentication
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only handle 401 errors, and only retry once
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // First try to refresh the token
        await authService.refreshToken();
        console.log("[Axios] Token refreshed, retrying request...");

        // Update the authorization header and retry
        const headers = authService.getAuthHeaders();
        originalRequest.headers.Authorization = headers.Authorization;
        return axios(originalRequest);
      } catch (refreshError) {
        // Refresh failed, try automatic re-authentication
        console.log("[Axios] Token refresh failed, attempting re-authentication...");

        const reAuthSuccess = await authService.reAuthenticate();
        if (reAuthSuccess) {
          console.log("[Axios] Re-authentication successful, retrying request...");
          const headers = authService.getAuthHeaders();
          originalRequest.headers.Authorization = headers.Authorization;
          return axios(originalRequest);
        }

        // Both refresh and re-auth failed
        console.log("[Axios] Re-authentication failed, session expired");
        window.dispatchEvent(new CustomEvent("auth:expired"));
      }
    }

    return Promise.reject(error);
  }
);

// Forward server logs to browser console
if (window.electronAPI?.onServerLog) {
  window.electronAPI.onServerLog((data) => {
    const prefix = "%c[Server]";
    const style = "color: #10b981; font-weight: bold;";
    for (const { type, text } of data.batch) {
      if (type === "error") {
        console.error(prefix, style, text);
      } else {
        console.log(prefix, style, text);
      }
    }
  });
}

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(createI18nPlugin());
const appRoot = document.querySelector('#app');
installLegacyI18nBridge(appRoot);
app.mount(appRoot);
